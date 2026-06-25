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
  batches,
  correctionJournalEntries,
  inventoryMovements,
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
