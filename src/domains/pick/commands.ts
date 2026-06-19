/**
 * Pick domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.PICK.EXTRACT.
 *
 * Circular import note: this module imports helpers and the Payload type from
 * `@/server/services/commandBus`. commandBus.ts in turn re-imports pick command
 * handlers from this module via `@/domains/pick`, which creates a circular
 * import. This is safe under ESM because every reference to those imported
 * bindings lives inside a function body — by the time runCommand() invokes a
 * pick handler, commandBus.ts has fully evaluated and the live bindings are
 * resolved.
 */

import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  batches,
  fulfillmentLines,
  inventoryMovements,
  pickLists,
  salesOrderLines,
  salesOrders,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult, SessionUser } from '../../shared/types';
import { z } from 'zod';

// Helpers and the Payload type are kept in commandBus.ts for this phase.
import {
  code,
  qtyScale,
  requiredId,
  requiredNumber,
  requiredString,
  stringValue,
  writeBagManifest,
  type Payload,
} from '@/server/services/commandBus';

// ---------------------------------------------------------------------------
// Per-command payload validation schemas (defined here, originally in commandBus)
// ---------------------------------------------------------------------------

const recordWeighAndPackPayloadSchema = z.object({
  fulfillmentLineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  actualQty: z.coerce.number().optional(),
  actualWeight: z.coerce.number().optional(),
  bagCode: z.string().optional(),
});

const releaseLineForPickingPayloadSchema = z.object({
  lineId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Command handlers.
// ---------------------------------------------------------------------------

export async function allocateOrderToFulfillment(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const [existing] = await tx.select().from(pickLists).where(eq(pickLists.orderId, orderId)).limit(1);
  if (existing) return { ok: true, commandId, affectedIds: [existing.id, orderId], toast: `${existing.pickNo} already exists.` };
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  if (order.status !== 'posted') throw new Error(`${order.orderNo} must be posted before fulfillment allocation.`);
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) throw new Error('Order needs lines before fulfillment allocation.');
  const [pick] = await tx
    .insert(pickLists)
    .values({ pickNo: code('PICK'), orderId, assignedTo: userId, status: 'open', unitsPerBag: Math.max(1, Math.floor(Number(payload.unitsPerBag ?? 1))) })
    .returning();
  const affected = [pick.id, orderId];
  for (const line of lines) {
    const [fulfillment] = await tx
      .insert(fulfillmentLines)
      .values({ pickListId: pick.id, orderLineId: line.id, batchId: line.batchId, expectedQty: line.qty, status: 'open' })
      .returning();
    affected.push(fulfillment.id);
  }
  await writeBagManifest(tx, pick.id);
  return { ok: true, commandId, affectedIds: affected, toast: `${pick.pickNo} created.` };
}

export async function recordWeighAndPack(tx: Tx, payload: Payload, commandId: string, toast = 'Weigh and pack recorded.'): Promise<CommandResult> {
  recordWeighAndPackPayloadSchema.parse(payload);
  const lineId = requiredId(payload.fulfillmentLineId ?? payload.id, 'fulfillmentLineId');
  const [line] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.id, lineId)).limit(1);
  if (!line) throw new Error('Fulfillment line not found.');
  const actualQty = payload.actualQty != null ? requiredNumber(payload.actualQty, 'actualQty') : undefined;
  const actualWeight = payload.actualWeight != null ? requiredNumber(payload.actualWeight, 'actualWeight') : undefined;
  const nextQty = actualQty ?? Number(line.actualQty);
  const nextWeight = actualWeight ?? Number(line.actualWeight);
  if (nextQty <= 0) throw new Error('Actual quantity must be greater than zero before packing a fulfillment line.');
  if (nextWeight <= 0) throw new Error('Actual weight must be greater than zero before packing a fulfillment line.');
  const bagCode = stringValue(payload.bagCode) || code('BAG');
  const values: Record<string, unknown> = { bagCode, status: 'packed', updatedAt: new Date() };
  if (actualQty != null) values.actualQty = qtyScale(actualQty);
  if (actualWeight != null) values.actualWeight = qtyScale(actualWeight);
  await tx.update(fulfillmentLines).set(values).where(eq(fulfillmentLines.id, lineId));
  await writeBagManifest(tx, line.pickListId);
  const [pick] = await tx.select({ orderId: pickLists.orderId }).from(pickLists).where(eq(pickLists.id, line.pickListId)).limit(1);
  return { ok: true, commandId, affectedIds: [line.pickListId, lineId], toast, orderId: pick?.orderId };
}

// CAP-030 (TER-1485): Release sales order line to the warehouse pick queue.
// Stamps pick_released_at/by on the sales order line, lazy-creates a pick list
// for the order if needed, and ensures a fulfillment line exists for the order line.
// Idempotent: if the line is already released, returns ok without mutating.
export async function releaseLineForPicking(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  releaseLineForPickingPayloadSchema.parse(payload);
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Sales order line not found.');
  // Idempotency: already released → no-op.
  if (line.pickReleasedAt) {
    return { ok: true, commandId, affectedIds: [lineId], toast: 'Line already released for picking.' };
  }
  // Eligibility checks (mirror releaseEligibility query reasons).
  if (!line.itemName) throw new Error('Line must have an item before releasing for picking.');
  if (!line.batchId) throw new Error('Line must have a batch assigned before releasing for picking.');
  if (Number(line.qty) <= 0) throw new Error('Line quantity must be greater than zero before releasing for picking.');
  const issues = Array.isArray(line.validationIssues) ? (line.validationIssues as string[]) : [];
  const fatalIssues = issues.filter((issue: string) => !issue.startsWith('Pick landed COGS')); // range-priced is not fatal for release
  if (fatalIssues.length) throw new Error(`Resolve validation issues before releasing: ${fatalIssues.join('; ')}`);
  // Verify batch has reserved quantity covering this line.
  const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
  if (!batch) throw new Error('Batch not found.');
  if (Number(batch.reservedQty) < Number(line.qty)) {
    throw new Error(`${line.itemName} does not have sufficient reservation. Reserve inventory first.`);
  }
  // Stamp the line.
  await tx.update(salesOrderLines)
    .set({ pickReleasedAt: new Date(), pickReleasedBy: userId, updatedAt: new Date() })
    .where(eq(salesOrderLines.id, lineId));
  // Lazy-create pick list for the order if not present.
  const [existingPick] = await tx.select().from(pickLists).where(eq(pickLists.orderId, line.orderId)).limit(1);
  let pickId: string;
  if (existingPick) {
    pickId = existingPick.id;
  } else {
    const [newPick] = await tx.insert(pickLists)
      .values({ pickNo: code('PICK'), orderId: line.orderId, status: 'open' })
      .returning();
    pickId = newPick.id;
  }
  // Insert fulfillment line (idempotent: skip if one already exists for this order line).
  const [existingFl] = await tx.select().from(fulfillmentLines)
    .where(eq(fulfillmentLines.orderLineId, lineId)).limit(1);
  let fulfillmentLineId: string;
  if (existingFl) {
    fulfillmentLineId = existingFl.id;
  } else {
    const [fl] = await tx.insert(fulfillmentLines)
      .values({ pickListId: pickId, orderLineId: lineId, batchId: line.batchId, expectedQty: line.qty, status: 'open' })
      .returning();
    fulfillmentLineId = fl.id;
  }
  return {
    ok: true,
    commandId,
    affectedIds: [lineId, pickId, fulfillmentLineId, line.orderId],
    toast: `${line.itemName || 'Line'} released for picking.`,
    orderId: line.orderId
  };
}

// CAP-030 (TER-1485): Bulk release. Sequentially releases each line and aggregates affected ids.
export async function releaseLinesForPicking(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const lineIds = Array.isArray(payload.lineIds)
    ? (payload.lineIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  if (!lineIds.length) throw new Error('lineIds must be a non-empty array.');
  const affected: string[] = [];
  let firstOrderId: string | undefined;
  for (const lineId of lineIds) {
    const result = await releaseLineForPicking(tx, { ...payload, lineId }, userId, commandId);
    for (const id of result.affectedIds) if (!affected.includes(id)) affected.push(id);
    if (result.orderId && !firstOrderId) firstOrderId = result.orderId;
  }
  return { ok: true, commandId, affectedIds: affected, toast: `${lineIds.length} line(s) released for picking.`, orderId: firstOrderId };
}

// CAP-030 (TER-1485): Recall a released line from picking.
// Two paths depending on pick progress:
//   • actualQty = 0 (nothing picked): deletes the fulfillment line; if the pick list
//     is then empty, deletes it too. Always clears pickReleasedAt/By on the SOL.
//   • actualQty > 0 (line picked or packed): does NOT delete the FL. Instead sets
//     statusExtended = 'recall_pending' and appends a warehouse alert so the picker
//     must acknowledge before the line can be re-packed. pickReleasedAt is still
//     cleared on the SOL so a subsequent releaseLineForPicking call can re-enter
//     the line into the queue (reusing the existing FL, which retains its alerts
//     until acknowledged by the picker).
export async function recallLineFromPicking(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Sales order line not found.');
  if (!line.pickReleasedAt) {
    return { ok: true, commandId, affectedIds: [lineId], toast: 'Line is not released for picking.', orderId: line.orderId };
  }
  const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.orderLineId, lineId)).limit(1);
  if (fl) {
    if (Number(fl.actualQty) > 0) {
      // Line has been picked/packed — cannot safely delete the FL.
      // Set recall_pending status and add a warehouse alert so the picker
      // must acknowledge before proceeding.
      const existingAlerts = Array.isArray(fl.warehouseAlerts)
        ? (fl.warehouseAlerts as Array<Record<string, unknown>>)
        : [];
      const recallAlert = {
        id: `recall-${randomBytes(4).toString('hex')}`,
        type: 'recall',
        message: 'Recalled by sales — verify quantity with operator before completing this line.',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await tx.update(fulfillmentLines)
        .set({
          warehouseAlerts: [...existingAlerts, recallAlert],
          statusExtended: 'recall_pending',
          updatedAt: new Date(),
        })
        .where(eq(fulfillmentLines.id, fl.id));
    } else {
      // actualQty = 0: FL is effectively unstarted. We previously also checked
      // fl.status !== 'open' but any non-open/zero-qty state is not reachable
      // in practice (open/zero is the only valid unstarted state).
      await tx.delete(fulfillmentLines).where(eq(fulfillmentLines.id, fl.id));
      const remaining = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.pickListId, fl.pickListId));
      if (!remaining.length) {
        await tx.delete(pickLists).where(eq(pickLists.id, fl.pickListId));
      }
    }
  }
  // Clear the SOL release stamp even when the FL survives. This allows the sales
  // operator to re-release the line via releaseLineForPicking, which will reuse
  // the existing FL. The FL's recall_pending statusExtended and warehouse alerts
  // remain until the picker acknowledges — this is intentional per spec.
  await tx.update(salesOrderLines)
    .set({ pickReleasedAt: null, pickReleasedBy: null, updatedAt: new Date() })
    .where(eq(salesOrderLines.id, lineId));
  const affected: string[] = [lineId];
  if (fl) affected.push(fl.id, fl.pickListId);
  return { ok: true, commandId, affectedIds: affected, toast: 'Line recalled from picking.', orderId: line.orderId };
}

// CAP-030 (TER-1488): Return picked units. Decrements actual_qty, restores available
// and reserved quantities on the batch, and writes an inventory_movements row of
// kind='pick_return'. Cannot return more than has been picked.
export async function returnPickedUnits(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const fulfillmentLineId = requiredId(payload.fulfillmentLineId ?? payload.id, 'fulfillmentLineId');
  const qty = requiredNumber(payload.qty, 'qty');
  if (qty <= 0) throw new Error('Return quantity must be greater than zero.');
  const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.id, fulfillmentLineId)).limit(1);
  if (!fl) throw new Error('Fulfillment line not found.');
  if (qty > Number(fl.actualQty)) {
    throw new Error(`Cannot return ${qty} — only ${fl.actualQty} units were picked.`);
  }
  const nextQty = Number(fl.actualQty) - qty;
  await tx.update(fulfillmentLines)
    .set({ actualQty: qtyScale(nextQty), updatedAt: new Date() })
    .where(eq(fulfillmentLines.id, fulfillmentLineId));
  const affected: string[] = [fulfillmentLineId, fl.pickListId];
  if (fl.batchId) {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, fl.batchId)).limit(1);
    if (batch) {
      const nextAvailable = Number(batch.availableQty) + qty;
      const nextReserved = Math.max(0, Number(batch.reservedQty) - qty);
      await tx.update(batches)
        .set({ availableQty: qtyScale(nextAvailable), reservedQty: qtyScale(nextReserved), updatedAt: new Date() })
        .where(eq(batches.id, fl.batchId));
    }
    await tx.insert(inventoryMovements).values({
      batchId: fl.batchId,
      commandId,
      kind: 'pick_return',
      qtyDelta: qtyScale(qty),
      reason: stringValue(payload.reason) || 'Picked units returned'
    });
    affected.push(fl.batchId);
  }
  const [returnPick] = await tx.select({ orderId: pickLists.orderId }).from(pickLists).where(eq(pickLists.id, fl.pickListId)).limit(1);
  return { ok: true, commandId, affectedIds: affected, toast: `Returned ${qty} unit(s).`, orderId: returnPick?.orderId };
}

export async function printLabels(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const pickListId = requiredId(payload.pickListId ?? payload.id, 'pickListId');
  const labelFormat = stringValue(payload.labelFormat) || '4x6';
  await tx.update(pickLists).set({ labelsPrinted: true, labelFormat, updatedAt: new Date() }).where(eq(pickLists.id, pickListId));
  await writeBagManifest(tx, pickListId);
  return { ok: true, commandId, affectedIds: [pickListId], toast: `${labelFormat} labels marked printed.` };
}
