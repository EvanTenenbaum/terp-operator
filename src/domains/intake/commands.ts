/**
 * Intake domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.INT.EXTRACT.
 *
 * Circular import note: this module imports helpers and the Payload type from
 * `@/server/services/commandBus`. commandBus.ts in turn re-imports intake
 * command handlers from this module via `@/domains/intake`, which creates a
 * circular import. This is safe under ESM because every reference to those
 * imported bindings lives inside a function body — by the time runCommand()
 * invokes an intake handler, commandBus.ts has fully evaluated and the live
 * bindings are resolved.
 */

import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  batches,
  brands,
  customerSheetSnapshots,
  inventoryMovements,
  items,
  purchaseOrderLines,
  purchaseOrders,
  vendorBills,
  vendors,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult, SessionUser } from '../../shared/types';
import {
  buildCustomerSheetSnapshotRows,
  CUSTOMER_SHEET_MODES,
  type CustomerSheetMode,
} from '../../shared/customerSheetSnapshot';

// Helpers and the Payload type are kept in commandBus.ts for this phase.
import {
  arrivalStatus,
  batchValidationIssues,
  code,
  copyIfPresent,
  dateOrNull,
  decodeShorthand,
  ensureItem,
  ensureTagCatalog,
  ensureVendorBrand,
  moneyScale,
  mulMoney,
  ownership,
  qtyScale,
  requiredId,
  requiredNumber,
  requiredString,
  stringValue,
  subMoneyMin0,
  tagValue,
  type Payload,
} from '@/server/services/commandBus';

// Cross-domain import (P1.PO.EXTRACT moved this to @/domains/purchase-orders).
import { postPurchaseReceipt } from '@/domains/purchase-orders';

// ---------------------------------------------------------------------------
// Per-command payload validation schemas (defined here, originally in commandBus)
// ---------------------------------------------------------------------------

const createBatchPayloadSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  vendorId: z.string().uuid().optional(),
  shorthand: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  brandId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  purchaseOrderLineId: z.string().uuid().optional(),
  sourceCode: z.string().optional(),
  subcategory: z.string().optional(),
  intakeQty: z.coerce.number().optional(),
  availableQty: z.coerce.number().optional(),
  uom: z.string().optional(),
  unitCost: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional(),
  location: z.string().optional(),
  lotCode: z.string().optional(),
  intakeDate: z.string().optional(),
  ticketCost: z.coerce.number().optional(),
  priceRange: z.string().optional(),
  notes: z.string().optional(),
  legacyMarker: z.string().optional(),
  ownershipStatus: z.string().optional(),
  expirationDate: z.string().optional(),
  arrivalConfirmed: z.boolean().optional(),
  arrivalStatus: z.string().optional(),
  mediaStatus: z.string().optional(),
}).passthrough();

const rejectBatchPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  reason: z.string().min(1),
});

const verifyAllIntakePayloadSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

const adjustBatchQuantityPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  deltaQty: z.coerce.number().optional(),
  qtyDelta: z.coerce.number().optional(),
  reason: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Command handlers.
// ---------------------------------------------------------------------------

export async function createBatch(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  createBatchPayloadSchema.parse(payload);
  // TER-1658: All intake batches must originate from a purchase order.
  // Manual batch creation without a PO line is no longer supported.
  if (!stringValue(payload.purchaseOrderLineId)) {
    throw new Error('All intake batches must originate from a purchase order. Create a PO first.');
  }
  const decoded = decodeShorthand(stringValue(payload.shorthand));
  const name = stringValue(payload.name) || decoded.name;
  const category = stringValue(payload.category) || decoded.category;
  if (!name) throw new Error('Batch name is required.');
  if (!category) throw new Error('Category is required.');
  const vendorId = stringValue(payload.vendorId);
  const tags = tagValue(payload.tags, decoded.tags);
  const itemId = await ensureItem(tx, { ...payload, tags }, name, category);
  await ensureTagCatalog(tx, tags);
  const validationIssues = batchValidationIssues({
    ...payload,
    name,
    category,
    vendorId,
    intakeQty: payload.intakeQty ?? 0,
    unitCost: payload.unitCost ?? 0
  });
  const requestedStatus = stringValue(payload.status) || 'draft';
  const status = requestedStatus === 'ready' && validationIssues.length ? 'needs_fix' : requestedStatus;

  // TER-1585 (CMD-INTAKE auto-brand wiring): resolve brandId from payload or,
  // when a vendor is present, auto-ensure a default brand for that vendor.
  // An explicitly supplied brandId always takes precedence.
  let resolvedBrandId: string | null = stringValue(payload.brandId) || null;
  if (!resolvedBrandId && vendorId) {
    const [vendor] = await tx
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);
    if (vendor) {
      resolvedBrandId = await ensureVendorBrand(tx, vendor.id, vendor.name);
    }
  }

  const [row] = await tx
    .insert(batches)
    .values({
      itemId,
      vendorId: vendorId || null,
      brandId: resolvedBrandId,
      purchaseOrderId: stringValue(payload.purchaseOrderId) || null,
      purchaseOrderLineId: stringValue(payload.purchaseOrderLineId) || null,
      batchCode: code('BATCH'),
      sourceCode: stringValue(payload.sourceCode) || null,
      shorthand: stringValue(payload.shorthand) || null,
      name,
      category,
      subcategory: stringValue(payload.subcategory) || null,
      tags,
      intakeQty: qtyScale(payload.intakeQty ?? 0),
      availableQty: qtyScale(payload.availableQty ?? payload.intakeQty ?? 0),
      uom: stringValue(payload.uom) || 'lb',
      unitCost: moneyScale(payload.unitCost ?? 0),
      unitPrice: moneyScale(payload.unitPrice ?? 0),
      location: stringValue(payload.location) || 'vault',
      lotCode: stringValue(payload.lotCode) || null,
      intakeDate: dateOrNull(payload.intakeDate),
      ticketCost: payload.ticketCost != null ? moneyScale(payload.ticketCost) : null,
      priceRange: stringValue(payload.priceRange) || null,
      notes: stringValue(payload.notes) || null,
      legacyMarker: stringValue(payload.legacyMarker) || stringValue(payload.ownershipStatus) || null,
      expirationDate: dateOrNull(payload.expirationDate),
      ownershipStatus: ownership(payload.ownershipStatus),
      arrivalConfirmed: Boolean(payload.arrivalConfirmed),
      arrivalStatus: arrivalStatus(payload.arrivalStatus, Boolean(payload.arrivalConfirmed)),
      validationIssues,
      mediaStatus: stringValue(payload.mediaStatus) || 'open',
      status
    })
    .returning();
  return { ok: true, commandId, affectedIds: [row.id], toast: validationIssues.length ? `${row.name} draft saved with ${validationIssues.length} issue(s) to fix.` : `${row.name} batch created.` };
}

export async function updateBatch(tx: Tx, payload: Payload, commandId: string, toast = 'Batch updated.'): Promise<CommandResult> {
  const batchId = requiredId(payload.id ?? payload.batchId, 'batchId');
  const [current] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!current) throw new Error('Batch not found.');
  if (current.status === 'posted' && payload.intakeQty != null && Number(payload.intakeQty) !== Number(current.intakeQty)) {
    throw new Error('intake_qty is immutable after posting. Use adjustBatchQuantity for corrections.');
  }
  if (current.status === 'posted' && payload.status != null && stringValue(payload.status) !== 'posted') {
    throw new Error('Posted batches cannot be moved back to Draft or Ready. Reverse the posting or create an adjustment.');
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  copyIfPresent(values, 'name', payload.name);
  copyIfPresent(values, 'category', payload.category);
  copyIfPresent(values, 'subcategory', payload.subcategory);
  copyIfPresent(values, 'location', payload.location);
  copyIfPresent(values, 'lotCode', payload.lotCode);
  copyIfPresent(values, 'status', payload.status);
  copyIfPresent(values, 'shorthand', payload.shorthand);
  copyIfPresent(values, 'sourceCode', payload.sourceCode);
  copyIfPresent(values, 'priceRange', payload.priceRange);
  copyIfPresent(values, 'notes', payload.notes);
  copyIfPresent(values, 'legacyMarker', payload.legacyMarker);
  copyIfPresent(values, 'mediaStatus', payload.mediaStatus);
  if (payload.vendorId != null) values.vendorId = stringValue(payload.vendorId) || null;
  if (payload.purchaseOrderId != null) values.purchaseOrderId = stringValue(payload.purchaseOrderId) || null;
  if (payload.purchaseOrderLineId != null) values.purchaseOrderLineId = stringValue(payload.purchaseOrderLineId) || null;
  if (payload.tags != null) {
    values.tags = tagValue(payload.tags);
    await ensureTagCatalog(tx, values.tags as string[]);
  }
  if (payload.intakeQty != null) values.intakeQty = qtyScale(payload.intakeQty);
  if (payload.availableQty != null) values.availableQty = qtyScale(payload.availableQty);
  if (payload.unitCost != null) values.unitCost = moneyScale(payload.unitCost);
  if (payload.unitPrice != null) values.unitPrice = moneyScale(payload.unitPrice);
  if (payload.ticketCost != null) values.ticketCost = moneyScale(payload.ticketCost);
  if (payload.arrivalConfirmed != null) values.arrivalConfirmed = Boolean(payload.arrivalConfirmed);
  if (payload.arrivalStatus != null) values.arrivalStatus = arrivalStatus(payload.arrivalStatus, Boolean(payload.arrivalConfirmed ?? current.arrivalConfirmed));
  if (payload.ownershipStatus != null) values.ownershipStatus = ownership(payload.ownershipStatus);
  if (payload.intakeDate != null) values.intakeDate = dateOrNull(payload.intakeDate);
  if (payload.expirationDate != null) values.expirationDate = dateOrNull(payload.expirationDate);

  const nextRow = { ...current, ...values } as Record<string, unknown>;
  const validationIssues = batchValidationIssues(nextRow);
  values.validationIssues = validationIssues;
  if (stringValue(payload.status) === 'ready' && validationIssues.length) {
    values.status = 'needs_fix';
    toast = `Cannot mark Ready yet: ${validationIssues.join(' ')}`;
  }

  await tx.update(batches).set(values).where(eq(batches.id, batchId));
  return { ok: true, commandId, affectedIds: [batchId], toast };
}

export async function deleteBatch(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const batchId = requiredId(payload.id ?? payload.batchId, 'batchId');
  const [current] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!current) throw new Error('Batch not found.');
  if (current.status === 'posted') throw new Error('Posted batches cannot be deleted. Reverse the posting instead.');
  await tx.delete(batches).where(eq(batches.id, batchId));
  return { ok: true, commandId, affectedIds: [batchId], toast: 'Draft batch deleted.' };
}

export async function rejectBatch(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  rejectBatchPayloadSchema.parse(payload);
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const rejectionReason = requiredString(payload.reason, 'reason');
  const [row] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!row) throw new Error('Batch not found.');
  if (row.status === 'posted') throw new Error('Posted batches cannot be rejected. Use a reversal/correction instead.');
  const stamp = new Date().toISOString();
  const validationIssues = Array.isArray(row.validationIssues) ? [...row.validationIssues] : [];
  validationIssues.push(`Rejected on ${stamp.slice(0, 10)}: ${rejectionReason}`);
  await tx
    .update(batches)
    .set({ status: 'returned', validationIssues, availableQty: '0.000', notes: [row.notes, `Rejected on ${stamp.slice(0, 10)}: ${rejectionReason}`].filter(Boolean).join('\n'), updatedAt: new Date() })
    .where(eq(batches.id, batchId));

  const affected: string[] = [batchId];
  if (row.purchaseOrderId) {
    const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, row.purchaseOrderId)).limit(1);
    if (order) {
      const merged = [stringValue(order.internalNotes), `Rejected lot ${row.batchCode}: ${rejectionReason}`].filter(Boolean).join('\n');
      await tx.update(purchaseOrders).set({ internalNotes: merged, updatedAt: new Date() }).where(eq(purchaseOrders.id, row.purchaseOrderId));
      affected.push(order.id);
    }
    if (row.purchaseOrderLineId) {
      const [poLine] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, row.purchaseOrderLineId)).limit(1);
      if (poLine) {
        const receivedDelta = Math.max(Number(poLine.receivedQty) - Number(row.intakeQty), 0);
        await tx.update(purchaseOrderLines).set({ receivedQty: qtyScale(receivedDelta), updatedAt: new Date() }).where(eq(purchaseOrderLines.id, poLine.id));
        affected.push(poLine.id);
      }
    }
    // Lock vendor bill rows to prevent concurrent bill-amount adjustment races during rejection
    const billResult = await tx.execute(
      sql`SELECT * FROM ${vendorBills} WHERE ${vendorBills.purchaseOrderId} = ${row.purchaseOrderId} FOR UPDATE`
    );
    for (const bill of billResult.rows) {
      if (bill.status === 'paid' || bill.status === 'void') continue;
      // TER-1566: Decimal-precise rejection adjustment — bill.amount minus qty*cost.
      const next = subMoneyMin0(bill.amount, mulMoney(row.intakeQty, row.unitCost));
      await tx.update(vendorBills).set({ amount: next, updatedAt: new Date() }).where(eq(vendorBills.id, bill.id as string));
      affected.push(bill.id as string);
    }
  }
  return { ok: true, commandId, affectedIds: [...new Set(affected)], toast: `${row.batchCode} rejected: ${rejectionReason}` };
}

export async function flagBatch(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const flagReason = requiredString(payload.reason, 'reason');
  const [row] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!row) throw new Error('Batch not found.');
  const stamp = new Date().toISOString();
  const validationIssues = Array.isArray(row.validationIssues) ? [...row.validationIssues] : [];
  validationIssues.push(`Flagged on ${stamp.slice(0, 10)}: ${flagReason}`);
  await tx.update(batches).set({ validationIssues, updatedAt: new Date() }).where(eq(batches.id, batchId));
  const affected: string[] = [batchId];
  if (row.purchaseOrderId) {
    const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, row.purchaseOrderId)).limit(1);
    if (order) {
      const merged = [stringValue(order.internalNotes), `Flagged lot ${row.batchCode}: ${flagReason}`].filter(Boolean).join('\n');
      await tx.update(purchaseOrders).set({ internalNotes: merged, updatedAt: new Date() }).where(eq(purchaseOrders.id, row.purchaseOrderId));
      affected.push(order.id);
    }
  }
  return { ok: true, commandId, affectedIds: [...new Set(affected)], toast: `${row.batchCode} flagged: ${flagReason}` };
}

export async function verifyAllIntake(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  verifyAllIntakePayloadSchema.parse(payload);
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  const linkedBatches = await tx.select().from(batches).where(eq(batches.purchaseOrderId, purchaseOrderId));
  const pending = (linkedBatches as Array<typeof batches.$inferSelect>).filter((row) => ['draft', 'ready', 'needs_fix'].includes(row.status));
  if (!pending.length) throw new Error('No pending intake rows on this purchase order to verify.');
  const affected: string[] = [purchaseOrderId];
  for (const row of pending) {
    if (row.purchaseOrderLineId) {
      const [poLine] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, row.purchaseOrderLineId)).limit(1);
      if (poLine && Number(poLine.qty) !== Number(row.intakeQty)) {
        await tx.update(batches).set({ intakeQty: qtyScale(poLine.qty), availableQty: qtyScale(poLine.qty), validationIssues: [], updatedAt: new Date() }).where(eq(batches.id, row.id));
      } else {
        await tx.update(batches).set({ validationIssues: [], updatedAt: new Date() }).where(eq(batches.id, row.id));
      }
    } else {
      await tx.update(batches).set({ validationIssues: [], updatedAt: new Date() }).where(eq(batches.id, row.id));
    }
    affected.push(row.id);
  }
  const refreshed = await tx.select().from(batches).where(inArray(batches.id, pending.map((row) => row.id)));
  const postResult = await postPurchaseReceipt(tx, { batchIds: refreshed.map((row: typeof batches.$inferSelect) => row.id) }, commandId, reason);
  affected.push(...postResult.affectedIds);
  const stamp = new Date().toISOString().slice(0, 10);
  const merged = [stringValue(order.internalNotes), `Intake verified on ${stamp} — all items accepted as expected.`].filter(Boolean).join('\n');
  await tx.update(purchaseOrders).set({ internalNotes: merged, updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
  return { ok: true, commandId, affectedIds: [...new Set(affected)], toast: `${order.poNo}: ${pending.length} intake row(s) verified and posted.` };
}

export async function adjustBatchQuantity(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  adjustBatchQuantityPayloadSchema.parse(payload);
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const delta = requiredNumber(payload.deltaQty ?? payload.qtyDelta, 'deltaQty');

  // Lock batch row to prevent concurrent quantity adjustment races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // columns like `available_qty` must be read via bracket notation — camelCase
  // access would silently produce `undefined` → NaN → corrupt inventory.
  const batchRows = await tx.execute(
    sql`SELECT * FROM ${batches} WHERE ${batches.id} = ${batchId} FOR UPDATE`
  );
  const row = batchRows.rows[0];
  if (!row) throw new Error('Batch not found.');
  if (!reason && !stringValue(payload.reason)) throw new Error('Adjustment reason is required so inventory corrections stay traceable.');
  const nextQty = Number(row['available_qty']) + delta;
  if (nextQty < 0) throw new Error('Available quantity cannot go below zero.');
  await tx.update(batches).set({ availableQty: qtyScale(nextQty), updatedAt: new Date() }).where(eq(batches.id, batchId));
  await tx.insert(inventoryMovements).values({ batchId, commandId, kind: 'manual_adjustment', qtyDelta: qtyScale(delta), reason });
  return { ok: true, commandId, affectedIds: [batchId], toast: `Adjusted ${row.name} by ${delta}.` };
}

// setBatchPrice is a thin wrapper around updateBatch that enforces unitPrice.
export async function setBatchPrice(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  return updateBatch(tx, { ...payload, unitPrice: requiredNumber(payload.unitPrice, 'unitPrice') }, commandId, 'Batch price updated.');
}

// setBatchLotInfo is a thin wrapper around updateBatch for lot information.
export async function setBatchLotInfo(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  return updateBatch(tx, payload, commandId, 'Lot information updated.');
}

// importBatchesCsv is deactivated per TER-1658.
export async function importBatchesCsv(_tx: Tx, _payload: Payload, _commandId: string): Promise<CommandResult> {
  // TER-1658: CSV import is no longer part of the MVP intake flow.
  // All batches must originate from a purchase order via receivePurchaseOrder.
  throw new Error('CSV import is not available. Create a purchase order and use receivePurchaseOrder instead.');
}

export async function createCustomerSheetSnapshot(
  tx: Tx,
  payload: Payload,
  user: SessionUser,
  commandId: string
): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const rawMode = stringValue(payload.mode) || 'internal';
  if (!(CUSTOMER_SHEET_MODES as readonly string[]).includes(rawMode)) {
    throw new Error(`Sheet mode must be one of: ${CUSTOMER_SHEET_MODES.join(', ')}.`);
  }
  const mode = rawMode as CustomerSheetMode;
  const inputRows = Array.isArray(payload.rows) ? (payload.rows as Array<Record<string, unknown>>) : [];
  if (inputRows.length === 0) {
    throw new Error('Cannot snapshot an empty sheet.');
  }
  const sanitized = buildCustomerSheetSnapshotRows(inputRows, mode);
  const notes = stringValue(payload.notes) || null;
  const [row] = await tx
    .insert(customerSheetSnapshots)
    .values({
      customerId,
      mode,
      actorId: user.id,
      actorName: user.name,
      itemCount: sanitized.length,
      rowsJson: sanitized,
      notes
    })
    .returning();
  return {
    ok: true,
    commandId,
    affectedIds: [row.id, customerId],
    toast: `Saved ${sanitized.length} item sheet snapshot${mode === 'catalog' ? ' (customer-safe)' : ''}.`
  };
}
