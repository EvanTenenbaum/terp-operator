/**
 * Purchase Orders domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.PO.EXTRACT.
 *
 * NOTE: this module intentionally imports a number of helpers, schemas, and the
 * `createBatch` handler from `@/server/services/commandBus`. commandBus.ts in
 * turn re-imports the 12 PO command handlers from this module, which creates a
 * circular import. This is safe under ESM because every reference to those
 * imported bindings lives inside a function body — by the time runCommand()
 * invokes a PO handler, commandBus.ts has fully evaluated and the live
 * bindings are resolved.
 *
 * Future cleanup (P2+): hoist the shared helpers to `@/domains/shared/...`
 * and remove the cycle entirely.
 */

import Decimal from 'decimal.js';
import { and, eq, inArray, sql } from 'drizzle-orm';

import {
  batches,
  inventoryMovements,
  photographyQueue,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
  refereeCredits,
  vendorBills,
  vendorPayments,
  vendors,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult } from '../../shared/types';
import { validateCostRange } from '../../shared/priceRange';

// Helpers, schemas, and the Payload type are kept in commandBus.ts for this
// phase (see header comment). createBatch moved to @/domains/intake.
import {
  // Helpers
  addPurchaseOrderLinePayloadSchema,
  approvePurchaseOrderPayloadSchema,
  assertPurchaseOrderEditable,
  batchValidationIssues,
  cancelPurchaseOrderPayloadSchema,
  code,
  copyIfPresent,
  createPurchaseOrderPayloadSchema,
  dateOrNull,
  decodeShorthand,
  ensureItem,
  ensureTagCatalog,
  finalizePurchaseOrderPayloadSchema,
  moneyScale,
  mulMoney,
  ownership,
  // Schemas
  postPurchaseReceiptPayloadSchema,
  purchaseOrderLineIssues,
  qtyScale,
  recalcPurchaseOrder,
  receivePurchaseOrderPayloadSchema,
  recordVendorPrepaymentPayloadSchema,
  removePurchaseOrderLinePayloadSchema,
  requiredId,
  requiredIds,
  requiredNumber,
  stringValue,
  tagValue,
  // Types
  type Payload,
} from '@/server/services/commandBus';

import { createBatch } from '@/domains/intake';

// Referee credit accrual lives in its own module; safe to import directly.
import { accrueRefereeCredit } from '@/server/services/refereeCommands';

export async function postPurchaseReceipt(
  tx: Tx,
  payload: Payload,
  commandId: string,
  reason?: string
): Promise<CommandResult> {
  postPurchaseReceiptPayloadSchema.parse(payload);
  const batchIds = requiredIds(payload.batchIds ?? payload.selectedIds, 'batchIds');
  const rows = await tx.select().from(batches).where(inArray(batches.id, batchIds));
  if (rows.length !== batchIds.length) throw new Error('One or more selected intake rows no longer exist.');
  const unsafe = rows.find((row: typeof batches.$inferSelect) => !['ready', 'draft'].includes(row.status));
  if (unsafe) throw new Error(`${unsafe.name} is ${unsafe.status}. Only Draft or Ready intake rows can be processed.`);
  const missing = rows.find((row: typeof batches.$inferSelect) => batchValidationIssues(row).length > 0);
  if (missing) throw new Error(`${missing.name} needs fixes before processing: ${batchValidationIssues(missing).join(' ')}`);
  const vendorIds = new Set(rows.map((row: typeof batches.$inferSelect) => row.vendorId));
  if (vendorIds.size !== 1) throw new Error('Selected intake rows must share one vendor before generating a vendor receipt.');
  const purchaseOrderIds = new Set<string>(rows.map((row: typeof batches.$inferSelect) => row.purchaseOrderId).filter((value: unknown): value is string => typeof value === 'string' && Boolean(value)));
  if (purchaseOrderIds.size > 1) throw new Error('Selected intake rows can only be receipted against one purchase order at a time.');
  const purchaseOrderId: string | null = [...purchaseOrderIds][0] ?? null;

  const discrepancyInput = (payload.discrepancyNotes && typeof payload.discrepancyNotes === 'object' && !Array.isArray(payload.discrepancyNotes))
    ? (payload.discrepancyNotes as Record<string, unknown>)
    : {};
  const reasonByBatch = new Map<string, string>();
  for (const [batchId, value] of Object.entries(discrepancyInput)) {
    const text = stringValue(value);
    if (text) reasonByBatch.set(batchId, text);
  }

  // Decimal-precise COGS accumulation (TER-1566): summing Number(qty)*Number(cost)
  // across many lines drifts on IEEE 754; use Decimal so the receipt total
  // matches the per-line subtotals exactly.
  const total = (rows as Array<typeof batches.$inferSelect>)
    .reduce(
      (sum: Decimal, row) =>
        sum.plus(new Decimal(String(row.intakeQty)).times(String(row.unitCost))),
      new Decimal(0)
    )
    .toDecimalPlaces(2)
    .toFixed(2);
  const [receipt] = await tx
    .insert(purchaseReceipts)
    .values({ receiptNo: code('RCPT'), vendorId: rows[0].vendorId, purchaseOrderId, total, status: 'posted' })
    .returning();

  const affected = [receipt.id, ...batchIds];
  const discrepancyNotes: string[] = [];
  const stamp = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    // Per-line subtotal uses Decimal so it matches the receipt total to the cent.
    const subtotal = mulMoney(row.intakeQty, row.unitCost);
    await tx.insert(purchaseReceiptLines).values({
      receiptId: receipt.id,
      batchId: row.id,
      qty: row.intakeQty,
      unitCost: row.unitCost,
      subtotal
    });
    const operatorReason = reasonByBatch.get(row.id);
    const batchNotesAddition = operatorReason ? `Discrepancy reason on ${stamp}: ${operatorReason}` : null;
    const nextBatchNotes = batchNotesAddition ? [row.notes, batchNotesAddition].filter(Boolean).join('\n') : row.notes;
    await tx
      .update(batches)
      .set({
        status: 'posted',
        availableQty: row.intakeQty,
        arrivalStatus: 'arrived',
        validationIssues: [],
        postedAt: new Date(),
        notes: nextBatchNotes,
        updatedAt: new Date()
      })
      .where(eq(batches.id, row.id));
    await tx.insert(inventoryMovements).values({ batchId: row.id, commandId, kind: 'intake_posted', qtyDelta: row.intakeQty, reason });
    await tx.insert(photographyQueue).values({ batchId: row.id, status: 'open', notes: `Auto-queued from receipt ${receipt.receiptNo}.` });
    if (row.purchaseOrderLineId) {
      const [poLine] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, row.purchaseOrderLineId)).limit(1);
      if (poLine) {
        // UX-H04 / BE-009 (Execution Decision 5): partial-receive lineage is
        // marked on the line at receive time (status 'partially_received').
        // Partial lines ACCUMULATE receivedQty across receipts and only flip
        // to 'received' once cumulative received covers the ordered qty.
        // Full-receive lines keep the legacy single-batch overwrite semantics
        // exactly (prev receivedQty is always 0 on that path).
        const isPartialLineage = poLine.status === 'partially_received';
        const nextReceived = isPartialLineage
          ? new Decimal(String(poLine.receivedQty ?? 0)).plus(String(row.intakeQty))
          : new Decimal(String(row.intakeQty));
        const lineComplete =
          !isPartialLineage ||
          nextReceived.toDecimalPlaces(3).greaterThanOrEqualTo(new Decimal(String(poLine.qty ?? 0)).toDecimalPlaces(3));
        const isMismatch = isPartialLineage
          ? nextReceived.toDecimalPlaces(3).greaterThan(new Decimal(String(poLine.qty ?? 0)).toDecimalPlaces(3))
          : Number(poLine.qty) !== Number(row.intakeQty);
        if (isMismatch) {
          const detail = isPartialLineage
            ? `Intake discrepancy: cumulative received ${nextReceived.toFixed(3)} ${poLine.uom} exceeds ordered ${Number(poLine.qty)} ${poLine.uom} on ${stamp} (${row.name})`
            : `Intake discrepancy: expected ${Number(poLine.qty)} ${poLine.uom}, received ${Number(row.intakeQty)} ${row.uom} on ${stamp} (${row.name})`;
          discrepancyNotes.push(operatorReason ? `${detail} — ${operatorReason}.` : `${detail}.`);
        } else if (operatorReason) {
          discrepancyNotes.push(`Intake note on ${stamp} (${row.name}): ${operatorReason}.`);
        }
        await tx
          .update(purchaseOrderLines)
          .set({
            receivedQty: qtyScale(nextReceived.toNumber()),
            status: lineComplete ? 'received' : 'partially_received',
            updatedAt: new Date()
          })
          .where(eq(purchaseOrderLines.id, poLine.id));
      }
    }
  }
  if (purchaseOrderId) {
    if (discrepancyNotes.length) {
      const [poRow] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
      const merged = [stringValue(poRow?.internalNotes), ...discrepancyNotes].filter(Boolean).join('\n');
      await tx.update(purchaseOrders).set({ internalNotes: merged, updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
    }
    const poLineRows = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
    // UX-H04 / BE-009 (Execution Decision 5): while any line is mid-partial
    // (status 'partially_received' after the per-line updates above), the PO
    // stays open as 'partially_received' — no receivedAt stamp and the PO
    // total keeps the ordered value until receiving completes. Receipts with
    // no open partial lines preserve the legacy unconditional 'received'
    // transition + received-value total recompute byte-for-byte (partial line
    // statuses are only ever produced by the UX-H04 receive path).
    const hasOpenPartialLine = (poLineRows as Array<typeof purchaseOrderLines.$inferSelect>).some(
      (line) => line.status === 'partially_received'
    );
    if (hasOpenPartialLine) {
      await tx.update(purchaseOrders).set({ status: 'partially_received', updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
    } else {
      await tx.update(purchaseOrders).set({ status: 'received', receivedAt: new Date(), updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
      // Decimal-precise PO total: same drift concern as receipt total above.
      const actualPoTotal = (poLineRows as Array<typeof purchaseOrderLines.$inferSelect>)
        .reduce(
          (sum: Decimal, line) =>
            sum.plus(new Decimal(String(line.receivedQty)).times(String(line.unitCost))),
          new Decimal(0)
        )
        .toDecimalPlaces(2)
        .toFixed(2);
      await tx.update(purchaseOrders).set({ total: actualPoTotal, updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
    }
  }

  const grouped = new Map<string, Decimal>();
  const reasonsByVendor = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.vendorId) continue;
    const amount = new Decimal(String(row.intakeQty ?? 0)).times(String(row.unitCost ?? 0));
    grouped.set(row.vendorId, (grouped.get(row.vendorId) ?? new Decimal(0)).plus(amount));
    const operatorReason = reasonByBatch.get(row.id);
    if (operatorReason) {
      const list = reasonsByVendor.get(row.vendorId) ?? [];
      list.push(`${row.name}: ${operatorReason}`);
      reasonsByVendor.set(row.vendorId, list);
    }
  }
  for (const [vendorId, amount] of grouped) {
    const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
    const vendorReasons = reasonsByVendor.get(vendorId);
    const discrepancyText = vendorReasons && vendorReasons.length ? vendorReasons.join('\n') : null;
    const [bill] = await tx
      .insert(vendorBills)
      .values({
        vendorId,
        purchaseReceiptId: receipt.id,
        purchaseOrderId,
        billNo: code('VBILL'),
        amount: amount.toDecimalPlaces(2).toFixed(2),
        dueDate: new Date(Date.now() + (vendor?.termsDays ?? 14) * 24 * 60 * 60 * 1000),
        termsDays: vendor?.termsDays ?? 14,
        status: 'open',
        dueReason: 'Net terms payable from selected intake receipt',
        discrepancyNotes: discrepancyText
      })
      .returning();
    affected.push(bill.id);
  }

  return {
    ok: true,
    commandId,
    affectedIds: affected,
    toast: `Processed intake receipt ${receipt.receiptNo} for ${rows.length} row(s).`,
    delta: { receiptNo: receipt.receiptNo, total: moneyScale(total) }
  };
}

export async function createPurchaseOrder(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  createPurchaseOrderPayloadSchema.parse(payload);
  const vendorId = requiredId(payload.vendorId, 'vendorId');
  const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new Error('Vendor not found.');
  const [row] = await tx
    .insert(purchaseOrders)
    .values({
      poNo: code('PO'),
      vendorId,
      expectedDate: dateOrNull(payload.expectedDate),
      orderedBy: userId,
      paymentTerms: stringValue(payload.paymentTerms) || 'vendor_terms',
      prepaymentAmount: moneyScale(Number(payload.prepaymentAmount ?? 0)),
      buyerNotes: stringValue(payload.buyerNotes) || null,
      internalNotes: stringValue(payload.internalNotes) || null,
      externalNotes: stringValue(payload.externalNotes) || null,
      status: 'draft'
    })
    .returning();
  return { ok: true, commandId, affectedIds: [row.id], toast: `Started purchase order ${row.poNo} for ${vendor.name}.` };
}

export async function updatePurchaseOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [current] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!current) throw new Error('Purchase order not found.');
  assertPurchaseOrderEditable(current.status);

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.vendorId != null) values.vendorId = stringValue(payload.vendorId) || null;
  if (payload.expectedDate !== undefined) values.expectedDate = dateOrNull(payload.expectedDate);
  if (payload.paymentTerms !== undefined) values.paymentTerms = stringValue(payload.paymentTerms) || 'vendor_terms';
  if (payload.prepaymentAmount !== undefined) values.prepaymentAmount = moneyScale(Number(payload.prepaymentAmount ?? 0));
  if (payload.buyerNotes !== undefined) values.buyerNotes = stringValue(payload.buyerNotes) || null;
  if (payload.internalNotes !== undefined) values.internalNotes = stringValue(payload.internalNotes) || null;
  if (payload.externalNotes !== undefined) values.externalNotes = stringValue(payload.externalNotes) || null;
  if (payload.status !== undefined) {
    const nextStatus = stringValue(payload.status);
    if (nextStatus === 'cancelled') throw new Error('Cancelled purchase orders cannot be edited.');
    values.status = nextStatus;
  }
  await tx.update(purchaseOrders).set(values).where(eq(purchaseOrders.id, purchaseOrderId));
  return { ok: true, commandId, affectedIds: [purchaseOrderId], toast: 'Purchase order updated.' };
}

/**
 * Add a line item to a purchase order.
 *
 * COST MODES (XOR constraint):
 * - Fixed cost: unitCost > 0, costRangeLow/High = NULL
 * - Cost range: unitCost = 0, costRangeLow/High both set (low <= high)
 * - Cannot use both modes simultaneously (enforced by DB constraint + validation)
 *
 * When cost range is used, PO total calculations use the midpoint: (low + high) / 2
 * See: src/shared/priceRange.ts for range validation utilities
 * See: migrations/0010_po_cost_range.sql for DB constraint
 */
export async function addPurchaseOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  addPurchaseOrderLinePayloadSchema.parse(payload);
  const purchaseOrderId = requiredId(payload.purchaseOrderId, 'purchaseOrderId');

  // Lock PO row to prevent concurrent line addition and total recalc races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // columns like `po_no` must be read via bracket notation — camelCase
  // (`order.poNo`) would silently produce `undefined`. See refundPayment for
  // the same pattern.
  const orderRows = await tx.execute(
    sql`SELECT * FROM ${purchaseOrders} WHERE ${purchaseOrders.id} = ${purchaseOrderId} FOR UPDATE`
  );
  const order = orderRows.rows[0];
  if (!order) throw new Error('Purchase order not found.');
  assertPurchaseOrderEditable(order['status'] as string);
  const decoded = decodeShorthand(stringValue(payload.shorthand));
  const productName = stringValue(payload.productName ?? payload.name) || decoded.name;
  const category = stringValue(payload.category) || decoded.category;
  if (!productName) throw new Error('Product name is required.');
  if (!category) throw new Error('Category is required.');
  const tags = tagValue(payload.tags, decoded.tags);
  const qty = requiredNumber(payload.qty, 'qty');
  if (qty <= 0) throw new Error('Quantity must be greater than zero.');

  // Cost validation: either unitCost OR cost range, not both (XOR constraint)
  const unitCost = Number(payload.unitCost ?? 0);
  const costRangeLow = payload.costRangeLow != null ? Number(payload.costRangeLow) : null;
  const costRangeHigh = payload.costRangeHigh != null ? Number(payload.costRangeHigh) : null;

  const hasFixedCost = unitCost > 0;
  // Range is only "present" when both bounds are positive — 0/0 plus a fixed unit cost
  // should not flag as ambiguous (and would not be a real range anyway).
  const hasRange = costRangeLow != null && costRangeHigh != null && costRangeLow > 0 && costRangeHigh > 0;

  if (hasFixedCost && hasRange) {
    throw new Error('Cannot specify both unit cost and cost range.');
  }

  if (hasRange && !validateCostRange(costRangeLow, costRangeHigh)) {
    throw new Error('Invalid cost range: low must be <= high and both must be positive.');
  }

  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Unit cost cannot be negative.');

  const itemId = await ensureItem(tx, { ...payload, tags }, productName, category);
  await ensureTagCatalog(tx, tags);
  const status = (hasFixedCost || hasRange) ? 'planned' : 'needs_fix';
  const [line] = await tx
    .insert(purchaseOrderLines)
    .values({
      purchaseOrderId,
      itemId,
      productName,
      category,
      subcategory: stringValue(payload.subcategory) || null,
      tags,
      qty: qtyScale(qty),
      uom: stringValue(payload.uom) || 'lb',
      unitCost: moneyScale(unitCost),
      unitPrice: moneyScale(unitCost),
      costRangeLow: costRangeLow != null ? moneyScale(costRangeLow) : null,
      costRangeHigh: costRangeHigh != null ? moneyScale(costRangeHigh) : null,
      sourceCode: stringValue(payload.sourceCode) || (order['po_no'] as string),
      shorthand: stringValue(payload.shorthand) || null,
      legacyMarker: stringValue(payload.legacyMarker) || stringValue(payload.ownershipStatus) || null,
      ownershipStatus: ownership(payload.ownershipStatus),
      notes: stringValue(payload.notes) || null,
      internalNotes: stringValue(payload.internalNotes) || null,
      externalNotes: stringValue(payload.externalNotes) || null,
      status
    })
    .returning();
  await recalcPurchaseOrder(tx, purchaseOrderId);
  return {
    ok: true,
    commandId,
    affectedIds: [purchaseOrderId, line.id],
    toast: status === 'needs_fix' ? `${productName} added; enter unit cost before approving PO.` : `${productName} added to ${order['po_no']}.`
  };
}

export async function updatePurchaseOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Purchase order line not found.');

  // Lock PO row to prevent concurrent line update and total recalc races
  const orderRows = await tx.execute(
    sql`SELECT * FROM ${purchaseOrders} WHERE ${purchaseOrders.id} = ${line.purchaseOrderId} FOR UPDATE`
  );
  const order = orderRows.rows[0];
  if (!order) throw new Error('Purchase order not found.');
  assertPurchaseOrderEditable(order['status'] as string);

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.productName !== undefined || payload.name !== undefined) values.productName = stringValue(payload.productName ?? payload.name);
  copyIfPresent(values, 'category', payload.category);
  copyIfPresent(values, 'subcategory', payload.subcategory);
  copyIfPresent(values, 'uom', payload.uom);
  copyIfPresent(values, 'sourceCode', payload.sourceCode);
  copyIfPresent(values, 'shorthand', payload.shorthand);
  copyIfPresent(values, 'legacyMarker', payload.legacyMarker);
  copyIfPresent(values, 'notes', payload.notes);
  copyIfPresent(values, 'internalNotes', payload.internalNotes);
  copyIfPresent(values, 'externalNotes', payload.externalNotes);
  if (payload.tags !== undefined) {
    values.tags = tagValue(payload.tags);
    await ensureTagCatalog(tx, values.tags as string[]);
  }
  if (payload.ownershipStatus !== undefined) values.ownershipStatus = ownership(payload.ownershipStatus);
  if (payload.qty !== undefined) {
    const qty = requiredNumber(payload.qty, 'qty');
    if (qty <= 0) throw new Error('Quantity must be greater than zero.');
    if (qty < Number(line.receivedQty)) throw new Error('Quantity cannot be below already received quantity.');
    values.qty = qtyScale(qty);
  }
  // Handle cost updates (unitCost OR range)
  if (payload.unitCost !== undefined || payload.costRangeLow !== undefined || payload.costRangeHigh !== undefined) {
    const newUnitCost = payload.unitCost !== undefined ? Number(payload.unitCost) : Number(line.unitCost);
    const newRangeLow = payload.costRangeLow !== undefined ? (payload.costRangeLow != null ? Number(payload.costRangeLow) : null) : (line.costRangeLow ? Number(line.costRangeLow) : null);
    const newRangeHigh = payload.costRangeHigh !== undefined ? (payload.costRangeHigh != null ? Number(payload.costRangeHigh) : null) : (line.costRangeHigh ? Number(line.costRangeHigh) : null);

    const hasFixedCost = newUnitCost > 0;
    // Range is only "present" when both bounds are positive; see addPurchaseOrderLine for rationale.
    const hasRange = newRangeLow != null && newRangeHigh != null && newRangeLow > 0 && newRangeHigh > 0;

    if (hasFixedCost && hasRange) {
      throw new Error('Cannot specify both unit cost and cost range.');
    }

    if (hasRange && !validateCostRange(newRangeLow, newRangeHigh)) {
      throw new Error('Invalid cost range: low must be <= high and both must be positive.');
    }

    if (payload.unitCost !== undefined) {
      if (newUnitCost < 0) throw new Error('Unit cost cannot be negative.');
      values.unitCost = moneyScale(newUnitCost);
      values.unitPrice = values.unitCost;
      // Clear range if setting fixed cost
      if (newUnitCost > 0) {
        values.costRangeLow = null;
        values.costRangeHigh = null;
      }
    }

    if (payload.costRangeLow !== undefined) values.costRangeLow = newRangeLow != null ? moneyScale(newRangeLow) : null;
    if (payload.costRangeHigh !== undefined) values.costRangeHigh = newRangeHigh != null ? moneyScale(newRangeHigh) : null;

    // Clear unitCost if setting range
    if (hasRange && !hasFixedCost) {
      values.unitCost = moneyScale(0);
      values.unitPrice = moneyScale(0);
    }
  }

  const nextLine = { ...line, ...values } as Record<string, unknown>;
  const hasValidCost = Number(nextLine.unitCost ?? 0) > 0 || (nextLine.costRangeLow != null && nextLine.costRangeHigh != null);
  // UX-H04 / BE-009: a mid-partial line (status 'partially_received', set by
  // the partial receive path) keeps its lineage marker on edits — flipping it
  // back to 'planned' would make the next posted receipt overwrite (instead
  // of accumulate) receivedQty. Legacy lines never carry this status.
  values.status =
    Number(nextLine.receivedQty ?? 0) >= Number(nextLine.qty ?? 0)
      ? 'received'
      : line.status === 'partially_received'
        ? 'partially_received'
        : hasValidCost
          ? 'planned'
          : 'needs_fix';
  await tx.update(purchaseOrderLines).set(values).where(eq(purchaseOrderLines.id, lineId));
  await recalcPurchaseOrder(tx, line.purchaseOrderId);
  return { ok: true, commandId, affectedIds: [line.purchaseOrderId, lineId], toast: 'Purchase order line updated.' };
}

export async function removePurchaseOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  removePurchaseOrderLinePayloadSchema.parse(payload);
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Purchase order line not found.');

  // Lock PO row to prevent concurrent line removal and total recalc races
  const orderRows = await tx.execute(
    sql`SELECT * FROM ${purchaseOrders} WHERE ${purchaseOrders.id} = ${line.purchaseOrderId} FOR UPDATE`
  );
  const order = orderRows.rows[0];
  if (!order) throw new Error('Purchase order not found.');
  assertPurchaseOrderEditable(order['status'] as string);
  if (Number(line.receivedQty) > 0) throw new Error('Received purchase order lines cannot be removed. Use intake correction/reversal.');
  await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.id, lineId));
  await recalcPurchaseOrder(tx, line.purchaseOrderId);
  return { ok: true, commandId, affectedIds: [line.purchaseOrderId, lineId], toast: 'Purchase order line removed.' };
}

/**
 * Finalize a draft purchase order, making it ready for approval.
 *
 * WORKFLOW: draft → finalized → approved → ordered → received
 *                     ↑ (you are here)
 *
 * BREAKING CHANGE (May 2026): approvePurchaseOrder now REQUIRES finalized status.
 * Previously, POs could go directly from draft → approved. Now there is a mandatory
 * finalization step that validates the PO before approval.
 *
 * Validation: Same as approve - lines must exist, have valid costs (fixed OR range), and qty > 0
 * See: migrations/0013_po_finalization.sql
 */
export async function finalizePurchaseOrder(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  finalizePurchaseOrderPayloadSchema.parse(payload);
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  if (order.status !== 'draft') throw new Error('Only draft purchase orders can be finalized.');

  // Same validation as approve
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  if (!lines.length) throw new Error('Add at least one product line before finalizing.');
  const issues = lines.flatMap((line: typeof purchaseOrderLines.$inferSelect) =>
    purchaseOrderLineIssues(line).map((issue) => `${line.productName}: ${issue}`)
  );
  if (issues.length) throw new Error(issues.join('; '));

  await tx.update(purchaseOrders).set({
    status: 'finalized',
    finalizedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(purchaseOrders.id, purchaseOrderId));

  return {
    ok: true,
    commandId,
    affectedIds: [purchaseOrderId],
    toast: `${order.poNo} finalized and ready for approval.`
  };
}

/**
 * Return a finalized purchase order to draft status for editing.
 *
 * WORKFLOW: draft ← finalized (you are here) ← approved ← ordered ← received
 *
 * Use case: After finalization, operator realizes they need to edit cost, quantity, or add lines.
 * This command allows returning to draft state WITHOUT losing entered data.
 *
 * UI: "Unfinalize" button in More tray (only visible when status = 'finalized')
 */
export async function unfinalizePurchaseOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  if (order.status === 'draft') {
    // Idempotent no-op: a PO already in draft with no active snapshot
    // (e.g. a legacy PO from before the receipt-snapshot system) safely
    // succeeds without touching state.
    return {
      ok: true,
      commandId,
      affectedIds: [purchaseOrderId],
      toast: `${order.poNo} is already in draft.`
    };
  }
  if (order.status !== 'finalized') {
    throw new Error('Only finalized purchase orders can be returned to draft.');
  }

  await tx.update(purchaseOrders).set({
    status: 'draft',
    finalizedAt: null,
    updatedAt: new Date()
  }).where(eq(purchaseOrders.id, purchaseOrderId));

  return {
    ok: true,
    commandId,
    affectedIds: [purchaseOrderId],
    toast: `${order.poNo} returned to draft.`
  };
}

export async function recordVendorPrepayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  recordVendorPrepaymentPayloadSchema.parse(payload);
  const purchaseOrderId = requiredId(payload.purchaseOrderId, 'purchaseOrderId');
  const amount = requiredNumber(payload.amount, 'amount');
  if (amount <= 0) throw new Error('Prepayment amount must be greater than zero.');

  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!po) throw new Error('Purchase order not found.');
  if (po.status !== 'approved') throw new Error('Prepayment can only be recorded on approved purchase orders.');
  if (amount > Number(po.prepaymentAmount)) {
    throw new Error(`Prepayment amount cannot exceed ${po.prepaymentAmount}.`);
  }

  // Check if prepayment already recorded
  const [existing] = await tx.select().from(vendorPayments)
    .where(eq(vendorPayments.purchaseOrderId, purchaseOrderId))
    .limit(1);

  if (existing) throw new Error('Prepayment already recorded for this purchase order.');

  // Create vendor payment record
  const [payment] = await tx.insert(vendorPayments).values({
    vendorBillId: null as unknown as string, // Will be linked when bill is created
    purchaseOrderId,
    amount: moneyScale(amount),
    method: stringValue(payload.method) || 'cash',
    reference: stringValue(payload.reference) || `PO ${po.poNo} prepayment`,
    status: 'posted',
    createdAt: new Date()
  }).returning();

  return {
    ok: true,
    commandId,
    affectedIds: [purchaseOrderId, payment.id],
    toast: `Prepayment of $${amount} recorded for PO ${po.poNo}.`
  };
}

export async function approvePurchaseOrder(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  approvePurchaseOrderPayloadSchema.parse(payload);
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');

  // Lock PO row to prevent concurrent approval races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // columns like `vendor_id` and `po_no` must be read via bracket notation —
  // camelCase access would silently produce `undefined`. See refundPayment for
  // the same pattern.
  const orderRows = await tx.execute(
    sql`SELECT * FROM ${purchaseOrders} WHERE ${purchaseOrders.id} = ${purchaseOrderId} FOR UPDATE`
  );
  const order = orderRows.rows[0];
  if (!order) throw new Error('Purchase order not found.');
  if (order.status !== 'finalized') throw new Error('Purchase order must be finalized before approval.');
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  if (!lines.length) throw new Error('Add at least one product line before approving this purchase order.');
  const issues = lines.flatMap((line: typeof purchaseOrderLines.$inferSelect) => purchaseOrderLineIssues(line).map((issue) => `${line.productName}: ${issue}`));
  if (issues.length) throw new Error(issues.join(' '));
  await tx.update(purchaseOrderLines).set({ status: 'planned', updatedAt: new Date() }).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  await tx.update(purchaseOrders).set({ status: 'approved', orderedAt: new Date(), orderedBy: userId, updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
  await recalcPurchaseOrder(tx, purchaseOrderId);

  // Fetch refreshed order with total
  const [freshOrder] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);

  // Accrue referee credit if relationship specified
  if (payload.refereeRelationshipId && payload.logRefereeCredit !== false && freshOrder) {
    const { creditAmount } = await accrueRefereeCredit(tx, {
      refereeRelationshipId: String(payload.refereeRelationshipId),
      transactionType: 'purchase_order',
      transactionId: freshOrder.id,
      transactionNo: freshOrder.poNo,
      transactionTotal: Number(freshOrder.total),
      commandId
    });

    await tx.update(purchaseOrders).set({
      refereeRelationshipId: String(payload.refereeRelationshipId),
      refereeCreditAmount: creditAmount.toFixed(2)
    }).where(eq(purchaseOrders.id, purchaseOrderId));
  }

  const affected = [purchaseOrderId, ...lines.map((line: typeof purchaseOrderLines.$inferSelect) => line.id)];
  const toast = `${order['po_no']} approved. Receive this purchase order when product arrives.`;
  return { ok: true, commandId, affectedIds: [...new Set(affected)], toast };
}

/**
 * Shared draft-intake batch payload for receiving a PO line. Extracted from
 * the original receivePurchaseOrder inline literal so the UX-H04 partial path
 * materializes batches with byte-identical semantics to the full path
 * (ownership inference, arrival flags, location, draft status).
 */
function receiveBatchPayloadForLine(
  order: typeof purchaseOrders.$inferSelect,
  line: typeof purchaseOrderLines.$inferSelect,
  intakeQty: number,
  notes: string
): Payload {
  return {
    vendorId: order.vendorId,
    purchaseOrderId: order.id,
    purchaseOrderLineId: line.id,
    itemId: line.itemId,
    sourceCode: line.sourceCode || order.poNo,
    shorthand: line.shorthand,
    name: line.productName,
    category: line.category,
    subcategory: line.subcategory,
    tags: line.tags,
    intakeQty,
    availableQty: 0,
    uom: line.uom,
    unitCost: line.unitCost,
    unitPrice: line.unitPrice,
    legacyMarker: line.legacyMarker || line.ownershipStatus,
    ownershipStatus: (() => {
      // Respect an explicit line-level override if it's already classified
      if (line.ownershipStatus !== 'UNKNOWN') {
        return line.ownershipStatus;
      }
      // Infer from payment terms: operator-pays terms → office owns
      const terms = order.paymentTerms ?? '';
      if (terms === 'cod' || terms === 'prepay' || terms.startsWith('net_')) {
        return 'OFC';
      }
      // Consignment: vendor retains ownership
      if (terms === 'consignment') {
        return 'C';
      }
      // vendor_terms or unknown: leave as-is
      return line.ownershipStatus;
    })(),
    arrivalConfirmed: true,
    arrivalStatus: 'arrived',
    location: 'Receiving',
    status: 'draft',
    notes
  };
}

export async function receivePurchaseOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  receivePurchaseOrderPayloadSchema.parse(payload);
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  if (!['approved', 'ordered', 'partially_received'].includes(order.status)) throw new Error('Approve this purchase order before receiving product against it.');
  if (!order.vendorId) throw new Error('Choose a vendor before receiving this purchase order.');
  const selectedLineIds = Array.isArray(payload.lineIds) ? requiredIds(payload.lineIds, 'lineIds') : [];
  const allLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));

  // UX-H04 / BE-009 — Execution Decision 5 (2026-06-12): partial PO receiving.
  // When payload.lineQuantities is present, the receive set is its keys and
  // each line materializes a draft intake batch for the REQUESTED qty (capped
  // by validation at the line's outstanding qty). When absent, the legacy
  // full-receive path below runs unchanged.
  const rawLineQuantities =
    payload.lineQuantities && typeof payload.lineQuantities === 'object' && !Array.isArray(payload.lineQuantities)
      ? (payload.lineQuantities as Record<string, unknown>)
      : null;
  const partialQtyByLine = new Map<string, number>();
  if (rawLineQuantities) {
    for (const [lineId, rawQty] of Object.entries(rawLineQuantities)) {
      requiredId(lineId, 'lineQuantities key');
      const qty = Number(rawQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('Partial receive quantities must be positive numbers.');
      partialQtyByLine.set(lineId, qty);
    }
  }
  const isPartialReceive = partialQtyByLine.size > 0;

  const lines = isPartialReceive
    ? allLines.filter((line: typeof purchaseOrderLines.$inferSelect) => partialQtyByLine.has(line.id))
    : selectedLineIds.length
      ? allLines.filter((line: typeof purchaseOrderLines.$inferSelect) => selectedLineIds.includes(line.id))
      : allLines;
  if (isPartialReceive && lines.length !== partialQtyByLine.size) {
    throw new Error('One or more lines in the partial receive no longer exist on this purchase order.');
  }
  if (!lines.length) throw new Error('No purchase order lines are available to receive.');
  const existingBatches = await tx.select().from(batches).where(eq(batches.purchaseOrderId, purchaseOrderId));
  const linesWithBatches = new Set(
    (existingBatches as Array<typeof batches.$inferSelect>)
      .filter((b) => b.archivedAt == null && b.purchaseOrderLineId)
      .map((b) => b.purchaseOrderLineId as string)
  );
  // UX-H04: unposted (draft/ready) intake already drafted against a line
  // claims outstanding qty — partial receives may not double-draft it.
  // Posted intake is accounted via purchaseOrderLines.receivedQty.
  const pendingQtyByLine = new Map<string, Decimal>();
  for (const b of existingBatches as Array<typeof batches.$inferSelect>) {
    if (b.archivedAt != null || !b.purchaseOrderLineId) continue;
    if (!['draft', 'ready'].includes(b.status)) continue;
    pendingQtyByLine.set(
      b.purchaseOrderLineId,
      (pendingQtyByLine.get(b.purchaseOrderLineId) ?? new Decimal(0)).plus(String(b.intakeQty ?? 0))
    );
  }
  const affected = [purchaseOrderId];
  let createdCount = 0;
  for (const line of lines as Array<typeof purchaseOrderLines.$inferSelect>) {
    if (isPartialReceive) {
      // UX-H04 partial path: cap at outstanding (ordered − posted − pending
      // drafts), conservative — over-asks are rejected, never silently capped.
      const requested = partialQtyByLine.get(line.id) as number;
      const ordered = new Decimal(String(line.qty ?? 0));
      const alreadyReceived = new Decimal(String(line.receivedQty ?? 0));
      const pending = pendingQtyByLine.get(line.id) ?? new Decimal(0);
      const outstanding = Decimal.max(ordered.minus(alreadyReceived).minus(pending), new Decimal(0));
      if (new Decimal(requested).toDecimalPlaces(3).greaterThan(outstanding.toDecimalPlaces(3))) {
        throw new Error(
          `Receive qty ${requested} exceeds outstanding ${outstanding.toFixed(3)} ${line.uom} for ${line.productName} ` +
            `(${Number(line.qty)} ordered, ${Number(line.receivedQty)} received, ${pending.toFixed(3)} already drafted).`
        );
      }
      const created = await createBatch(
        tx,
        receiveBatchPayloadForLine(
          order,
          line,
          requested,
          [`Partial receive (${requested} of ${Number(line.qty)} ${line.uom}) from ${order.poNo}.`, line.notes].filter(Boolean).join(' ')
        ),
        commandId
      );
      // Mark partial lineage on the line so postPurchaseReceipt ACCUMULATES
      // receivedQty for it instead of the legacy single-batch overwrite.
      // Reversal restores the prior line status from beforeSnapshot.
      await tx.update(purchaseOrderLines).set({ status: 'partially_received', updatedAt: new Date() }).where(eq(purchaseOrderLines.id, line.id));
      affected.push(...created.affectedIds, line.id);
      createdCount += created.affectedIds.length;
      continue;
    }
    if (linesWithBatches.has(line.id)) continue;
    const remainingQty = Number(line.qty);
    if (remainingQty <= 0) continue;
    const created = await createBatch(
      tx,
      receiveBatchPayloadForLine(order, line, remainingQty, [`Received from ${order.poNo}.`, line.notes].filter(Boolean).join(' ')),
      commandId
    );
    affected.push(...created.affectedIds, line.id);
    createdCount += created.affectedIds.length;
  }
  const toast = createdCount
    ? isPartialReceive
      ? `Materialized ${createdCount} draft intake row(s) for the requested partial quantities. Verify actual counts and discrepancy reasons before posting.`
      : `Materialized ${createdCount} draft intake row(s). Verify actual counts and discrepancy reasons before posting.`
    : 'No new draft intake rows materialized — existing rows are ready for verification.';
  return { ok: true, commandId, affectedIds: [...new Set(affected)], toast };
}

export async function cancelPurchaseOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  cancelPurchaseOrderPayloadSchema.parse(payload);
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  if (lines.some((line: typeof purchaseOrderLines.$inferSelect) => Number(line.receivedQty) > 0)) throw new Error('Purchase orders with received product cannot be cancelled. Use intake reversal/correction.');
  // Void any referee credits tied to this purchase order
  const credits = await tx.select().from(refereeCredits).where(
    and(eq(refereeCredits.transactionId, purchaseOrderId), eq(refereeCredits.transactionType, 'purchase_order'), eq(refereeCredits.status, 'accrued'))
  );
  for (const credit of credits) {
    await tx.update(refereeCredits).set({ status: 'voided', voidedAt: new Date(), voidedReason: 'PO cancelled' }).where(eq(refereeCredits.id, credit.id));
  }

  await tx.update(purchaseOrders).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
  await tx.update(purchaseOrderLines).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  return { ok: true, commandId, affectedIds: [purchaseOrderId, ...lines.map((line: typeof purchaseOrderLines.$inferSelect) => line.id)], toast: `${order.poNo} cancelled.` };
}
