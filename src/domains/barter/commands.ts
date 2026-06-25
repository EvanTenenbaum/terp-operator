/**
 * Barter Settlement domain — command handlers.
 *
 * Implements the "Product as a Monetary Instrument" plan
 * (docs/engineering-plans/product-as-monetary-instrument-plan.md).
 *
 * Phase 1: payWithProduct (outbound vendor barter).
 *
 * A barter settlement is a single command producing up to three atomic legs:
 *   1. INVENTORY  — issue product from one or more batches at COST
 *   2. SETTLEMENT — reduce a vendor bill (or create a fully-paid bill) at SETTLEMENT AMOUNT
 *   3. GAIN/LOSS  — correction-journal entry for (settlementAmount − costBasis), zero by default
 *
 * Per the plan's D2/D3 reconciliation:
 *   - Inventory is always carried at unitCost.
 *   - settlementAmount defaults to Σ(qty × unitCost) → gainLoss = 0 (no journal entry).
 *   - When a manager+ override sets settlementAmount ≠ costBasis (with a reason),
 *     the difference books as a realized gain/loss into the period-aware
 *     correctionJournalEntries (assertPeriodUnlocked enforced).
 *
 * Per D5: consigned batches (ownershipStatus='C') are rejected — transfer
 * ownership to 'OFC' first via transferInventoryOwnership.
 *
 * NOTE: this module intentionally imports helpers, schemas, and the Payload
 * type from `@/server/services/commandBus`. commandBus.ts in turn re-imports
 * the exported barter handler from this module, creating a circular import.
 * This is safe under ESM because every reference to those imported bindings
 * lives inside a function body — same pattern as the payments/vendor-management
 * domain extractions.
 */

import Decimal from 'decimal.js';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  barterSettlements,
  barterSettlementLines,
  barterSettlementAllocations,
  batches,
  clientLedgerEntries,
  contacts,
  correctionJournalEntries,
  customers,
  inventoryMovements,
  invoices,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
  vendorBills,
  vendorPayments,
  vendors,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult, SessionUser } from '../../shared/types';

import {
  addMoney,
  assertPeriodUnlocked,
  code,
  moneyScale,
  mulMoney,
  qtyScale,
  stringValue,
  subMoney,
  type Payload,
} from '@/server/services/commandBus';

// Standard intake path — Phase 2 (settleDebtWithProduct) routes inbound barter
// product through the same createBatch helper as all other intake.
import { createBatch } from '@/domains/intake';

// Credit-engine recompute (mirrors the payments domain pattern) — inbound
// barter reduces AR balances, so credit/utilization signals must refresh.
import { enqueueCustomerRecompute } from '@/server/services/creditEngine';

// ─── Payload validation ──────────────────────────────────────────────────────

const payWithProductLineSchema = z.object({
  batchId: z.string().uuid({ message: 'Each line requires a batchId.' }),
  qty: z.coerce.number().positive({ message: 'Line qty must be greater than zero.' }),
});

const payWithProductPayloadSchema = z.object({
  vendorId: z.string().uuid({ message: 'vendorId is required.' }),
  vendorBillId: z.string().uuid().optional(),
  lines: z
    .array(payWithProductLineSchema)
    .min(1, { message: 'At least one barter line is required.' }),
  settlementAmount: z.coerce.number().nonnegative().optional(),
  overrideReason: z.string().min(1).optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
});

// Roles permitted to override the settlement value away from cost basis (D7).
// Catalog already gates the whole command at minRole='manager', so this is
// defense-in-depth; owner/manager pass.
const OVERRIDE_ROLES = new Set(['manager', 'owner']);

// ─── payWithProduct (outbound vendor barter) ─────────────────────────────────

/**
 * payWithProduct — issue product from one or more batches to settle a vendor's
 * payable.
 *
 * Atomicity guarantees (single tx opened by executeCommand):
 *   - Source batches locked via SELECT … FOR UPDATE before mutation.
 *   - Vendor bill (when provided) locked via SELECT … FOR UPDATE.
 *   - Inventory decrement, vendorPayment insert, vendorBill update, and
 *     gain/loss journal write all commit together or roll back together.
 *
 * Reversal: handled by the standard command-bus snapshot/restore path. The
 * snapshotByAffectedIds in commandBus.ts already covers batches, vendorBills,
 * vendorPayments, correctionJournalEntries, barterSettlements, and
 * barterSettlementLines — so before/after snapshots are sufficient. No
 * dedicated reverse handler is required for Phase 1.
 */
export async function payWithProduct(
  tx: Tx,
  payload: Payload,
  user: SessionUser,
  commandId: string
): Promise<CommandResult> {
  // 1. ─── Validate payload ──────────────────────────────────────────────────
  const parsed = payWithProductPayloadSchema.parse(payload);

  const vendorId = parsed.vendorId;
  const note = parsed.note ?? null;

  // 2. ─── Resolve & sanity-check vendor ─────────────────────────────────────
  const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new Error('Vendor not found.');

  // 3. ─── Lock source batches in deterministic order ────────────────────────
  // Sort by batchId to ensure a stable lock acquisition order across concurrent
  // barter commands and other consumers (sales posting, ownership transfer),
  // preventing deadlocks. Then read each batch under FOR UPDATE.
  //
  // We also aggregate line quantities per batch (a payload may list the same
  // batch twice) to validate available_qty against the combined draw.
  const lineByBatch = new Map<string, { totalQty: Decimal; lines: Array<{ qty: number }> }>();
  for (const line of parsed.lines) {
    const existing = lineByBatch.get(line.batchId);
    const qtyDec = new Decimal(line.qty);
    if (existing) {
      existing.totalQty = existing.totalQty.plus(qtyDec);
      existing.lines.push({ qty: line.qty });
    } else {
      lineByBatch.set(line.batchId, { totalQty: qtyDec, lines: [{ qty: line.qty }] });
    }
  }
  const sortedBatchIds = [...lineByBatch.keys()].sort();

  type BatchRow = Record<string, unknown>;
  const batchById = new Map<string, BatchRow>();
  for (const batchId of sortedBatchIds) {
    const result = await tx.execute(
      sql`SELECT * FROM ${batches} WHERE ${batches.id} = ${batchId} FOR UPDATE`
    );
    const row = result.rows[0] as BatchRow | undefined;
    if (!row) throw new Error(`Batch ${batchId} not found.`);

    // D5: reject consigned product outbound — operator must transfer to OFC first.
    if (row['ownership_status'] === 'C') {
      const batchName = (row['name'] as string | undefined) ?? batchId;
      throw new Error(
        `Cannot settle with consigned batch "${batchName}" — transfer ownership to OFC first via transferInventoryOwnership.`
      );
    }

    // Over-issue guard under lock.
    const available = new Decimal(String(row['available_qty'] ?? 0));
    const demanded = lineByBatch.get(batchId)!.totalQty;
    if (available.lt(demanded)) {
      const batchName = (row['name'] as string | undefined) ?? batchId;
      throw new Error(
        `Insufficient inventory on batch "${batchName}": available ${available.toFixed(3)}, requested ${demanded.toFixed(3)}.`
      );
    }

    batchById.set(batchId, row);
  }

  // 4. ─── Compute cost basis (Σ qty × unitCost) ─────────────────────────────
  let costBasisDec = new Decimal(0);
  for (const line of parsed.lines) {
    const batch = batchById.get(line.batchId)!;
    const unitCost = new Decimal(String(batch['unit_cost'] ?? 0));
    costBasisDec = costBasisDec.plus(unitCost.times(new Decimal(line.qty)));
  }
  const costBasis = costBasisDec.toDecimalPlaces(2).toFixed(2);

  // 5. ─── Resolve settlement amount + override gate (D7) ────────────────────
  let settlementAmount: string;
  let valueOverridden = false;
  let overrideReason: string | null = null;

  if (parsed.settlementAmount !== undefined) {
    const candidate = new Decimal(parsed.settlementAmount).toDecimalPlaces(2).toFixed(2);
    if (new Decimal(candidate).equals(costBasisDec.toDecimalPlaces(2))) {
      // Provided value equals cost basis; not an override.
      settlementAmount = candidate;
    } else {
      // Real override — gate on manager+ and require a reason (D7).
      if (!OVERRIDE_ROLES.has(user.role)) {
        throw new Error('Only manager or owner roles can override the barter settlement value.');
      }
      const reason = parsed.overrideReason?.trim();
      if (!reason) {
        throw new Error(
          'overrideReason is required when settlementAmount differs from cost basis.'
        );
      }
      settlementAmount = candidate;
      valueOverridden = true;
      overrideReason = reason;
    }
  } else {
    settlementAmount = costBasis;
  }

  // 6. ─── Compute gain/loss; assert period unlocked if non-zero ─────────────
  const gainLoss = subMoney(settlementAmount, costBasis); // settlementAmount − costBasis
  const gainLossDec = new Decimal(gainLoss);
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  if (!gainLossDec.isZero()) {
    await assertPeriodUnlocked(tx, period);
  }

  // 7. ─── Inventory leg — decrement availableQty and audit movement ────────
  const affectedIds: string[] = [];
  // Track which batch ids were touched (deduped) for the affected set.
  for (const batchId of sortedBatchIds) {
    const batch = batchById.get(batchId)!;
    const totalQty = lineByBatch.get(batchId)!.totalQty;
    const nextAvailable = new Decimal(String(batch['available_qty'] ?? 0)).minus(totalQty);
    await tx
      .update(batches)
      .set({ availableQty: qtyScale(nextAvailable.toFixed(3)), updatedAt: new Date() })
      .where(eq(batches.id, batchId));
    affectedIds.push(batchId);
  }
  // One inventoryMovements row per input line (preserves per-line audit detail).
  for (const line of parsed.lines) {
    await tx.insert(inventoryMovements).values({
      batchId: line.batchId,
      commandId,
      kind: 'barter_issue',
      qtyDelta: qtyScale(new Decimal(line.qty).negated().toFixed(3)),
      reason: `Barter outbound settlement to ${vendor.name}`,
    });
  }

  // 8. ─── Settlement leg — reduce vendor bill OR create fully-paid bill ────
  let settledBillId: string;
  let createdNewBill = false;

  if (parsed.vendorBillId) {
    // Reduce an existing bill.
    const billId = parsed.vendorBillId;
    const billRows = await tx.execute(
      sql`SELECT * FROM ${vendorBills} WHERE ${vendorBills.id} = ${billId} FOR UPDATE`
    );
    const bill = billRows.rows[0] as Record<string, unknown> | undefined;
    if (!bill) throw new Error('Vendor bill not found.');
    if (bill['vendor_id'] !== vendorId) {
      throw new Error('Vendor bill does not belong to the specified vendor.');
    }
    if (bill['status'] === 'paid' || bill['status'] === 'void') {
      throw new Error(`Vendor bill is already ${bill['status']}; cannot settle with product.`);
    }
    const billAmount = new Decimal(String(bill['amount']));
    const billPaid = new Decimal(String(bill['amount_paid'] ?? 0));
    const settlementDec = new Decimal(settlementAmount);
    // Open balance guard — mirrors recordVendorPayment.
    if (billPaid.plus(settlementDec).greaterThan(billAmount)) {
      throw new Error('Product settlement cannot exceed the open vendor bill balance.');
    }
    const nextPaid = addMoney(billPaid, settlementDec);
    const isFullyPaid = new Decimal(nextPaid).gte(billAmount);
    await tx
      .update(vendorBills)
      .set({
        amountPaid: nextPaid,
        status: isFullyPaid ? 'paid' : 'partial',
        dueReason: isFullyPaid ? 'Paid in full (product settlement)' : 'Partially settled with product',
        updatedAt: new Date(),
      })
      .where(eq(vendorBills.id, billId));
    settledBillId = billId;
    affectedIds.push(billId);

    // Contra vendorPayment entry (method='product') for traceability.
    const [payment] = await tx
      .insert(vendorPayments)
      .values({
        vendorBillId: billId,
        amount: moneyScale(settlementAmount),
        method: 'product',
        reference: stringValue(payload.reference) || `Barter settlement`,
        status: 'posted',
      })
      .returning();
    affectedIds.push(payment.id);
  } else {
    // No existing bill — create a fully-paid bill + payment, mirroring the
    // postVendorLedgerPayment pattern but inline (per spec, don't fan out).
    const txDate = new Date();
    const [newBill] = await tx
      .insert(vendorBills)
      .values({
        vendorId,
        billNo: code('VBILL'),
        amount: moneyScale(settlementAmount),
        amountPaid: moneyScale(settlementAmount),
        dueDate: txDate,
        scheduledFor: txDate,
        termsDays: vendor.termsDays,
        status: 'paid',
        dueReason: 'Paid in full (product settlement)',
        createdAt: txDate,
        updatedAt: txDate,
      })
      .returning();
    settledBillId = newBill.id;
    createdNewBill = true;
    affectedIds.push(newBill.id);

    const [payment] = await tx
      .insert(vendorPayments)
      .values({
        vendorBillId: newBill.id,
        amount: moneyScale(settlementAmount),
        method: 'product',
        reference: stringValue(payload.reference) || `Barter settlement`,
        status: 'posted',
        createdAt: txDate,
      })
      .returning();
    affectedIds.push(payment.id);
  }

  // 9. ─── Insert barterSettlements header ──────────────────────────────────
  const [settlement] = await tx
    .insert(barterSettlements)
    .values({
      settlementNo: code('BARTER'),
      direction: 'outbound',
      counterpartyType: 'vendor',
      vendorId,
      settlementAmount: moneyScale(settlementAmount),
      costBasis: moneyScale(costBasis),
      gainLoss: moneyScale(gainLoss),
      valueOverridden,
      overrideReason,
      vendorBillId: settledBillId,
      status: 'posted',
      commandId,
      note,
    })
    .returning();
  affectedIds.unshift(settlement.id);

  // 10. ─── Insert barterSettlementLines (one per input line) ───────────────
  for (const line of parsed.lines) {
    const batch = batchById.get(line.batchId)!;
    const unitCost = String(batch['unit_cost'] ?? 0);
    // Per-line settlement allocation: distribute total settlementAmount across
    // lines pro-rata by line cost basis. This preserves Σ(lineSettlementAmount)
    // = settlementAmount exactly (Decimal-safe). For the default (no override)
    // path this collapses to line cost basis dollar-for-dollar.
    const lineCost = mulMoney(unitCost, line.qty);
    let lineSettlement: string;
    if (costBasisDec.isZero()) {
      // Edge case: cost basis is zero. Distribute settlement evenly across lines
      // so the sum is exact; truncation goes to the last line.
      lineSettlement = '0.00';
    } else {
      lineSettlement = new Decimal(settlementAmount)
        .times(new Decimal(lineCost))
        .dividedBy(costBasisDec)
        .toDecimalPlaces(2)
        .toFixed(2);
    }
    await tx.insert(barterSettlementLines).values({
      settlementId: settlement.id,
      batchId: line.batchId,
      productName: String(batch['name'] ?? ''),
      qty: qtyScale(line.qty),
      unitCost: moneyScale(unitCost),
      lineSettlementAmount: lineSettlement,
    });
  }

  // 11. ─── Gain/loss leg — correction journal entry (if non-zero) ──────────
  if (!gainLossDec.isZero()) {
    const memoVerb = gainLossDec.isPositive() ? 'gain' : 'loss';
    const [journal] = await tx
      .insert(correctionJournalEntries)
      .values({
        period,
        amount: moneyScale(gainLoss),
        memo: `Barter ${memoVerb} — payWithProduct settlement ${settlement.settlementNo}`,
        status: 'posted',
        sourceType: 'barter_settlement',
        sourceId: settlement.id,
        commandId,
      })
      .returning();
    affectedIds.push(journal.id);
  }

  // 12. ─── Vendor id in affected set (for ledger / cache invalidation) ─────
  affectedIds.push(vendorId);

  // De-dupe affectedIds preserving order.
  const seen = new Set<string>();
  const dedupedAffected = affectedIds.filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const toastDetail = createdNewBill
    ? `Created paid bill ${moneyScale(settlementAmount)} for ${vendor.name}.`
    : `Applied ${moneyScale(settlementAmount)} to vendor bill for ${vendor.name}.`;
  const overrideSuffix = valueOverridden
    ? ` (override: ${overrideReason ?? 'reason recorded'})`
    : '';

  return {
    ok: true,
    commandId,
    affectedIds: dedupedAffected,
    toast: `Product settlement posted. ${toastDetail}${overrideSuffix}`,
  };
}

// Re-export the parsed schema for use in tests and (eventually) tRPC routers.
export const __payWithProductInternals = {
  payloadSchema: payWithProductPayloadSchema,
};

// ─── settleDebtWithProduct (inbound client barter) ───────────────────────────

const settleDebtLineSchema = z.object({
  productName: z.string().min(1, { message: 'Each line requires a productName.' }),
  qty: z.coerce.number().positive({ message: 'Line qty must be greater than zero.' }),
  unitCost: z.coerce.number().nonnegative({ message: 'unitCost cannot be negative.' }),
  category: z.string().optional(),
  brandId: z.string().uuid().optional(),
});

const settleDebtWithProductPayloadSchema = z.object({
  customerId: z.string().uuid({ message: 'customerId is required.' }),
  lines: z
    .array(settleDebtLineSchema)
    .min(1, { message: 'At least one barter line is required.' }),
  settlementAmount: z.coerce.number().nonnegative().optional(),
  overrideReason: z.string().min(1).optional(),
  allocationIntent: z.enum(['fifo', 'selected_invoice', 'unapplied']).optional(),
  invoiceId: z.string().uuid().optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
});

/**
 * settleDebtWithProduct — inbound client barter (D4).
 *
 * The customer hands the operator product; the operator forgives part of the
 * customer's AR. Per D4, intake follows the *standard* PO + receipt path with
 * the customer represented as a vendor (auto-provisioned via the contacts
 * link). The new vendorBill (what we now "owe" the customer-as-vendor for the
 * product) is then netted against the customer's AR, so no cash moves.
 *
 * Atomic legs (single tx opened by executeCommand):
 *   1. INTAKE       — barter PO + lines, batches (via createBatch then posted),
 *                     receipt + receipt lines, vendor bill (AP) at costBasis
 *   2. SETTLEMENT   — customer.balance -= settlementAmount, clientLedgerEntries
 *                     (product_settlement + optional down_payment for excess),
 *                     contra vendorPayment with method='product' settling the
 *                     vendor bill at costBasis
 *   3. ALLOCATION   — optional invoice allocations (fifo / selected_invoice /
 *                     unapplied) via barterSettlementAllocations
 *   4. GAIN/LOSS    — correctionJournalEntries for (settlementAmount − costBasis)
 *                     when non-zero; gated on assertPeriodUnlocked
 *
 * Lock order (deadlock-free; matches existing payment + barter conventions):
 *   customers → contacts (only when auto-provisioning vendor identity) →
 *   invoices (when allocating)
 *
 * REVERSAL GUARD (NOT IMPLEMENTED HERE — Phase 4):
 *   The standard command bus reversal restores from beforeSnapshot. If any of
 *   the created batches were resold downstream (batch.availableQty <
 *   batch.intakeQty) or the receipt/PO was amended, reversal must be blocked
 *   and the operator must post an offsetting outbound settlement instead. The
 *   guard is added in Phase 4 invariants/reversal code, alongside period-lock
 *   reversal gating consistent with the rest of closeout.
 */
export async function settleDebtWithProduct(
  tx: Tx,
  payload: Payload,
  user: SessionUser,
  commandId: string
): Promise<CommandResult> {
  // 1. ─── Validate payload ──────────────────────────────────────────────────
  const parsed = settleDebtWithProductPayloadSchema.parse(payload);

  const customerId = parsed.customerId;
  const allocationIntent = parsed.allocationIntent ?? 'unapplied';
  const note = parsed.note ?? null;

  // 2. ─── Compute costBasis = Σ(qty × unitCost) with Decimal precision ─────
  let costBasisDec = new Decimal(0);
  for (const line of parsed.lines) {
    costBasisDec = costBasisDec.plus(new Decimal(line.qty).times(new Decimal(line.unitCost)));
  }
  const costBasis = costBasisDec.toDecimalPlaces(2).toFixed(2);

  // 3. ─── Resolve settlementAmount + override gate (D7) ────────────────────
  let settlementAmount: string;
  let valueOverridden = false;
  let overrideReason: string | null = null;

  if (parsed.settlementAmount !== undefined) {
    const candidate = new Decimal(parsed.settlementAmount).toDecimalPlaces(2).toFixed(2);
    if (new Decimal(candidate).equals(costBasisDec.toDecimalPlaces(2))) {
      settlementAmount = candidate;
    } else {
      // Real override — D7 gating.
      if (!OVERRIDE_ROLES.has(user.role)) {
        throw new Error('Only manager or owner roles can override the barter settlement value.');
      }
      const reason = parsed.overrideReason?.trim();
      if (!reason) {
        throw new Error(
          'overrideReason is required when settlementAmount differs from cost basis.'
        );
      }
      settlementAmount = candidate;
      valueOverridden = true;
      overrideReason = reason;
    }
  } else {
    settlementAmount = costBasis;
  }

  // gainLoss = settlementAmount − costBasis. With the D2 default it's zero.
  const gainLoss = subMoney(settlementAmount, costBasis);
  const gainLossDec = new Decimal(gainLoss);

  // 4. ─── Lock the customer row + read AR + identity link ──────────────────
  const customerRows = await tx.execute(
    sql`SELECT * FROM ${customers} WHERE ${customers.id} = ${customerId} FOR UPDATE`
  );
  const customer = customerRows.rows[0] as Record<string, unknown> | undefined;
  if (!customer) throw new Error('Customer not found.');
  const contactId = (customer['contact_id'] as string | null | undefined) ?? null;
  if (!contactId) {
    throw new Error(
      'Customer is not linked to a contact; cannot resolve a vendor identity for the barter PO. ' +
        'Link the customer to a contact in the contacts system first (CAP-033).'
    );
  }
  const customerName = String(customer['name'] ?? 'customer');
  const currentBalance = new Decimal(String(customer['balance'] ?? 0));

  // 5. ─── Resolve / auto-provision the customer's vendor identity (§6.1) ───
  // The PO requires a vendor; we represent the customer as a vendor via their
  // shared contact row. Race-safe: lock the contact row, then re-check for an
  // existing vendor with that contactId before inserting a new one.
  const [existingVendor] = await tx
    .select()
    .from(vendors)
    .where(eq(vendors.contactId, contactId))
    .limit(1);

  let vendor: typeof vendors.$inferSelect;
  if (existingVendor) {
    vendor = existingVendor;
  } else {
    // Lock the contact row so a concurrent settleDebtWithProduct for the
    // same customer/contact cannot race us into creating two vendor rows.
    await tx.execute(
      sql`SELECT * FROM ${contacts} WHERE ${contacts.id} = ${contactId} FOR UPDATE`
    );
    // Re-check under lock.
    const [doubleCheck] = await tx
      .select()
      .from(vendors)
      .where(eq(vendors.contactId, contactId))
      .limit(1);
    if (doubleCheck) {
      vendor = doubleCheck;
    } else {
      // Flip the contact to is_vendor=true so the contacts system reflects
      // both roles for this counterparty.
      await tx
        .update(contacts)
        .set({ isVendor: true, updatedAt: new Date() })
        .where(eq(contacts.id, contactId));
      const [newVendor] = await tx
        .insert(vendors)
        .values({
          name: customerName,
          termsDays: 14,
          consignmentDefault: false,
          contactId,
          notes: `Auto-provisioned for barter settlement (customer ${customerId}).`,
        })
        .returning();
      vendor = newVendor;
    }
  }
  const vendorId = vendor.id;

  // 6. ─── Generate the settlement number up-front so we can cross-reference
  //        it on the contra vendorPayment before the settlement header row
  //        itself is inserted (step 14).
  const settlementNo = code('BARTER');
  const txDate = new Date();

  // 7. ─── Create the barter PO ────────────────────────────────────────────
  const [po] = await tx
    .insert(purchaseOrders)
    .values({
      poNo: code('BTR-PO'),
      vendorId,
      status: 'received',
      total: costBasis,
      paymentTerms: 'vendor_terms',
      internalNotes: 'Barter settlement intake',
      orderedAt: txDate,
      receivedAt: txDate,
      createdAt: txDate,
      updatedAt: txDate,
    })
    .returning();
  const poId = po.id;

  // 8. ─── Per-line: PO line → createBatch → post batch → receipt line ─────
  // We also accumulate per-line context for the settlement-lines insert and
  // the receipt total. createBatch is the standard intake helper (which is
  // why we honor TER-1658 by feeding it a real PO line); it leaves the batch
  // in 'draft' state. We then transition each batch to 'posted' (mirroring
  // postPurchaseReceipt's per-batch update) so inventory is immediately
  // available.
  const [receipt] = await tx
    .insert(purchaseReceipts)
    .values({
      receiptNo: code('BTR-RCPT'),
      purchaseOrderId: poId,
      vendorId,
      status: 'posted',
      total: costBasis,
      createdAt: txDate,
      updatedAt: txDate,
    })
    .returning();
  const receiptId = receipt.id;

  const createdBatchIds: string[] = [];
  type LineContext = {
    productName: string;
    qty: number;
    unitCost: number;
    batchId: string;
  };
  const lineContexts: LineContext[] = [];

  for (const line of parsed.lines) {
    const lineCategory = line.category ?? 'Barter';
    // Insert the PO line first so createBatch's required purchaseOrderLineId
    // points at a real row.
    const [poLine] = await tx
      .insert(purchaseOrderLines)
      .values({
        purchaseOrderId: poId,
        productName: line.productName,
        category: lineCategory,
        qty: qtyScale(line.qty),
        receivedQty: qtyScale(line.qty),
        unitCost: moneyScale(line.unitCost),
        unitPrice: moneyScale(line.unitCost),
        ownershipStatus: 'OFC',
        status: 'received',
        createdAt: txDate,
        updatedAt: txDate,
      })
      .returning();

    // Run the batch through the standard intake helper. It validates the
    // payload, ensures the item/tag catalog, auto-resolves the brand from the
    // vendor (ensureVendorBrand), and creates a draft batch with the supplied
    // intakeQty / unitCost.
    const createResult = await createBatch(
      tx,
      {
        name: line.productName,
        category: lineCategory,
        vendorId,
        brandId: line.brandId,
        purchaseOrderId: poId,
        purchaseOrderLineId: poLine.id,
        intakeQty: line.qty,
        availableQty: line.qty,
        unitCost: line.unitCost,
        ownershipStatus: 'OFC',
        status: 'draft',
      },
      commandId
    );
    const batchId = createResult.affectedIds[0];
    if (!batchId) {
      throw new Error('Internal: createBatch did not return a batch id.');
    }

    // Promote the draft batch to posted, mirroring postPurchaseReceipt.
    await tx
      .update(batches)
      .set({
        status: 'posted',
        availableQty: qtyScale(line.qty),
        arrivalConfirmed: true,
        arrivalStatus: 'arrived',
        validationIssues: [],
        postedAt: txDate,
        updatedAt: txDate,
      })
      .where(eq(batches.id, batchId));

    // Audit movement (use the standard intake_posted kind, per D4: inbound
    // barter reuses the normal receipt path with no new movement kind).
    await tx.insert(inventoryMovements).values({
      batchId,
      commandId,
      kind: 'intake_posted',
      qtyDelta: qtyScale(line.qty),
      reason: `Barter settlement intake from ${customerName}`,
    });

    // Per-line receipt entry — subtotal uses Decimal so the receipt total
    // matches the per-line sum exactly.
    const subtotal = mulMoney(line.qty, line.unitCost);
    await tx.insert(purchaseReceiptLines).values({
      receiptId,
      batchId,
      qty: qtyScale(line.qty),
      unitCost: moneyScale(line.unitCost),
      subtotal,
    });

    createdBatchIds.push(batchId);
    lineContexts.push({
      productName: line.productName,
      qty: line.qty,
      unitCost: line.unitCost,
      batchId,
    });
  }

  // 9. ─── Vendor bill (AP) for costBasis ──────────────────────────────────
  const [vendorBill] = await tx
    .insert(vendorBills)
    .values({
      vendorId,
      purchaseOrderId: poId,
      purchaseReceiptId: receiptId,
      billNo: code('VBILL'),
      amount: costBasis,
      amountPaid: '0.00',
      dueDate: txDate,
      scheduledFor: txDate,
      termsDays: vendor.termsDays,
      status: 'open',
      dueReason: 'Barter settlement intake',
      createdAt: txDate,
      updatedAt: txDate,
    })
    .returning();
  const vendorBillId = vendorBill.id;

  // 10. ─── Net AP↔AR: reduce customer balance, append ledger entries ──────
  // Split the settlement into a "settled portion" (consumes positive AR) and
  // an "excess portion" (drives the balance negative as a buyer credit, per
  // D6). One ledger entry per non-zero portion keeps the sum-of-ledger ==
  // customer.balance invariant exact (balanceReconciliation).
  const settlementDec = new Decimal(settlementAmount);
  const positiveBalance = Decimal.max(currentBalance, new Decimal(0));
  const settledPortion = Decimal.min(positiveBalance, settlementDec);
  const excessPortion = settlementDec.minus(settledPortion);

  const balanceAfterSettled = currentBalance.minus(settledPortion);
  const balanceAfterExcess = balanceAfterSettled.minus(excessPortion); // == newBalance
  const newBalance = balanceAfterExcess.toDecimalPlaces(2).toFixed(2);

  await tx
    .update(customers)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  const ledgerIds: string[] = [];
  if (settledPortion.greaterThan(0)) {
    const [entry] = await tx
      .insert(clientLedgerEntries)
      .values({
        customerId,
        kind: 'product_settlement',
        amount: moneyScale(settledPortion.negated()),
        balanceAfter: balanceAfterSettled.toDecimalPlaces(2).toFixed(2),
        note: `Barter settlement ${settlementNo} — product received as payment`,
      })
      .returning();
    ledgerIds.push(entry.id);
  }
  if (excessPortion.greaterThan(0)) {
    const [entry] = await tx
      .insert(clientLedgerEntries)
      .values({
        customerId,
        kind: 'down_payment',
        amount: moneyScale(excessPortion.negated()),
        balanceAfter: newBalance,
        note: `Barter settlement ${settlementNo} — buyer credit from excess product value`,
      })
      .returning();
    ledgerIds.push(entry.id);
  }

  // 11. ─── Settle the vendor bill (contra payment, method='product') ──────
  // The bill is for costBasis; the contra payment settles it in full so no
  // cash moves. The AR reduction in step 10 is what funds it.
  await tx
    .update(vendorBills)
    .set({
      amountPaid: costBasis,
      status: 'paid',
      dueReason: 'Paid in full (barter settlement — netted against client AR)',
      updatedAt: new Date(),
    })
    .where(eq(vendorBills.id, vendorBillId));

  const [vendorPaymentRow] = await tx
    .insert(vendorPayments)
    .values({
      vendorBillId,
      purchaseOrderId: poId,
      amount: costBasis,
      method: 'product',
      reference: settlementNo,
      status: 'posted',
      createdAt: txDate,
    })
    .returning();

  // 12. ─── Optional invoice allocation ────────────────────────────────────
  // The allocated amount is bounded by settledPortion (the part that actually
  // consumed positive AR). The excess portion is buyer credit and is never
  // allocated to a real invoice. Allocation rows reference barterSettlements
  // (not payments), so we buffer them here and insert after the settlement
  // header exists (step 14) — the invoice updates themselves happen now,
  // under the locks we already hold, so concurrent payment commands see
  // consistent open balances if they interleave on the next invoice.
  const allocationIds: string[] = [];
  const invoiceIdsTouched: string[] = [];
  const plannedAllocations: Array<{ invoiceId: string; amount: string }> = [];
  let remainingToAllocate = settledPortion;

  if (allocationIntent !== 'unapplied' && remainingToAllocate.greaterThan(0)) {
    // Determine the invoice set under FOR UPDATE locks for safe concurrent
    // updates against logPayment/allocatePayment.
    let invoicesToPay: Array<Record<string, unknown>> = [];
    if (allocationIntent === 'selected_invoice') {
      if (!parsed.invoiceId) {
        throw new Error('invoiceId is required when allocationIntent is "selected_invoice".');
      }
      const result = await tx.execute(
        sql`SELECT * FROM ${invoices} WHERE ${invoices.id} = ${parsed.invoiceId} FOR UPDATE`
      );
      invoicesToPay = result.rows as Array<Record<string, unknown>>;
      if (!invoicesToPay.length) {
        throw new Error('Invoice not found for selected_invoice allocation.');
      }
      const inv = invoicesToPay[0];
      if (inv['customer_id'] !== customerId) {
        throw new Error('Selected invoice does not belong to this customer.');
      }
      if (inv['status'] === 'paid' || inv['status'] === 'void') {
        throw new Error(`Selected invoice is already ${String(inv['status'])}.`);
      }
    } else {
      // FIFO: oldest open/partial first.
      const result = await tx.execute(
        sql`SELECT * FROM ${invoices}
            WHERE ${invoices.customerId} = ${customerId}
              AND ${invoices.status} in ('open', 'partial')
            ORDER BY ${invoices.createdAt} ASC
            FOR UPDATE`
      );
      invoicesToPay = result.rows as Array<Record<string, unknown>>;
    }

    for (const inv of invoicesToPay) {
      if (remainingToAllocate.lte(0)) break;
      const open = new Decimal(String(inv['total'])).minus(
        new Decimal(String(inv['amount_paid'] ?? 0))
      );
      if (open.lte(0)) continue;
      const allocationAmount = Decimal.min(open, remainingToAllocate);
      const allocAmountStr = allocationAmount.toDecimalPlaces(2).toFixed(2);

      // Update the invoice now — the FOR UPDATE lock we already hold makes
      // this safe; subsequent FIFO iterations see the new amount_paid.
      const invoicePaid = addMoney(String(inv['amount_paid'] ?? 0), allocAmountStr);
      const invoiceStatus = new Decimal(invoicePaid).gte(new Decimal(String(inv['total'])))
        ? 'paid'
        : 'partial';
      await tx
        .update(invoices)
        .set({ amountPaid: invoicePaid, status: invoiceStatus, updatedAt: new Date() })
        .where(eq(invoices.id, inv['id'] as string));
      invoiceIdsTouched.push(inv['id'] as string);
      plannedAllocations.push({ invoiceId: inv['id'] as string, amount: allocAmountStr });
      remainingToAllocate = remainingToAllocate.minus(allocationAmount);
    }
  }

  // 13. ─── Gain/loss leg ─────────────────────────────────────────────────
  let journalId: string | null = null;
  if (!gainLossDec.isZero()) {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    await assertPeriodUnlocked(tx, period);
    const memoVerb = gainLossDec.isPositive() ? 'gain' : 'loss';
    const [journal] = await tx
      .insert(correctionJournalEntries)
      .values({
        period,
        amount: moneyScale(gainLoss),
        memo: `Barter ${memoVerb} — settleDebtWithProduct ${settlementNo}`,
        status: 'posted',
        sourceType: 'barter_settlement',
        // sourceId filled below once the settlement header exists; insert now
        // with null and patch — but the column allows null today, so leave
        // unset here and update post-header insert.
        commandId,
      })
      .returning();
    journalId = journal.id;
  }

  // 14. ─── Insert barterSettlements header + lines + allocations ──────────
  const [settlement] = await tx
    .insert(barterSettlements)
    .values({
      settlementNo,
      direction: 'inbound',
      counterpartyType: 'customer',
      customerId,
      vendorId,
      settlementAmount,
      costBasis,
      gainLoss,
      valueOverridden,
      overrideReason,
      purchaseOrderId: poId,
      purchaseReceiptId: receiptId,
      vendorBillId,
      status: 'posted',
      commandId,
      note,
      createdAt: txDate,
      updatedAt: txDate,
    })
    .returning();
  const settlementId = settlement.id;

  // Settlement lines — distribute per-line settlement pro-rata by cost basis
  // (the same Decimal-precise scheme used in payWithProduct). The default no-
  // override path collapses to lineCost dollar-for-dollar.
  for (const ctx of lineContexts) {
    const lineCost = mulMoney(ctx.qty, ctx.unitCost);
    let lineSettlement: string;
    if (costBasisDec.isZero()) {
      lineSettlement = '0.00';
    } else {
      lineSettlement = new Decimal(settlementAmount)
        .times(new Decimal(lineCost))
        .dividedBy(costBasisDec)
        .toDecimalPlaces(2)
        .toFixed(2);
    }
    await tx.insert(barterSettlementLines).values({
      settlementId,
      batchId: ctx.batchId,
      productName: ctx.productName,
      qty: qtyScale(ctx.qty),
      unitCost: moneyScale(ctx.unitCost),
      lineSettlementAmount: lineSettlement,
    });
  }

  // Re-insert planned allocations now that the header exists with a real id.
  for (const plan of plannedAllocations) {
    const [row] = await tx
      .insert(barterSettlementAllocations)
      .values({
        settlementId,
        invoiceId: plan.invoiceId,
        amount: plan.amount,
      })
      .returning();
    allocationIds.push(row.id);
  }

  // Back-fill the journal sourceId now that we have the settlement id.
  if (journalId) {
    await tx
      .update(correctionJournalEntries)
      .set({ sourceId: settlementId })
      .where(eq(correctionJournalEntries.id, journalId));
  }

  // 15. ─── Credit-engine signal refresh (mirrors allocatePayment) ─────────
  await enqueueCustomerRecompute(tx, customerId, 'event:settleDebtWithProduct', commandId);

  // 16. ─── Build affectedIds (deduped, deterministic order) ──────────────
  const affectedIds: string[] = [
    settlementId,
    customerId,
    vendorId,
    poId,
    receiptId,
    vendorBillId,
    vendorPaymentRow.id,
    ...createdBatchIds,
    ...ledgerIds,
    ...invoiceIdsTouched,
    ...allocationIds,
  ];
  if (journalId) affectedIds.push(journalId);

  const seen = new Set<string>();
  const dedupedAffected = affectedIds.filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return {
    ok: true,
    commandId,
    affectedIds: dedupedAffected,
    toast: 'Product accepted as payment.',
  };
}

// Re-export internals for tests.
export const __settleDebtWithProductInternals = {
  payloadSchema: settleDebtWithProductPayloadSchema,
};
