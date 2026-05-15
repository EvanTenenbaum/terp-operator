import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { db, pool } from '../db';
import { env } from '../env';
import {
  archiveRuns,
  backupSnapshots,
  batches,
  clientLedgerEntries,
  commandJournal,
  connectorRequests,
  correctionJournalEntries,
  customers,
  customerNeeds,
  fulfillmentLines,
  inventoryMovements,
  invoiceDisputes,
  invoices,
  items,
  matchmakingMatches,
  paymentAllocations,
  payments,
  periodLocks,
  photographyQueue,
  pickLists,
  purchaseReceiptLines,
  purchaseReceipts,
  purchaseOrderLines,
  purchaseOrders,
  salesOrderLines,
  salesOrders,
  tagCatalog,
  transactionTypes,
  vendorBills,
  vendorPayments,
  vendorSupply,
  vendors
} from '../schema';
import { assertCommandAccess } from '../rbac';
import { appendJsonlJournal } from './journal';
import { rowsToCsv, validateBatchCsv } from './csv';
import { getCloseoutSafety } from './closeout';
import { evaluatePrice, resolvePricingProfile } from './pricing';
import { commandInputSchema } from '../../shared/schemas';
import { reversalPolicies } from '../../shared/commandCatalog';
import type { CommandName } from '../../shared/commandCatalog';
import type { CommandResult, SessionUser } from '../../shared/types';
import { normalizeTagSlug, parseTagInput } from '../../shared/tags';
import { validateCostRange, rangeMidpoint } from '../../shared/priceRange';

export type CommandInput = z.infer<typeof commandInputSchema>;

type Tx = any;
type Payload = Record<string, unknown>;

const moneyScale = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
};
const qtyScale = (value: unknown) => Number(value ?? 0).toFixed(3);
const code = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`;
const oneWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

export async function executeCommand(input: CommandInput, user: SessionUser, io: SocketServer): Promise<CommandResult> {
  assertCommandAccess(user, input.name);

  const existing = await db.select().from(commandJournal).where(eq(commandJournal.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing[0]) {
    return existing[0].result as unknown as CommandResult;
  }

  const commandId = randomUUID();
  const beforeSnapshot = await snapshotFromPayload(input.payload);

  try {
    const result = await db.transaction(async (tx) => runCommand(tx, input.name, input.payload, user, commandId, input.reason));
    const afterSnapshot = await snapshotByAffectedIds(result.affectedIds);
    const storedResult = { ...result, toast: result.toast ?? 'Command completed.' };

    await db.insert(commandJournal).values({
      id: commandId,
      commandName: input.name,
      idempotencyKey: input.idempotencyKey,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      reason: input.reason,
      inputPayload: input.payload,
      status: result.ok ? 'ok' : 'failed',
      affectedIds: result.affectedIds,
      beforeSnapshot,
      afterSnapshot,
      result: storedResult
    });

    await appendJsonlJournal({
      id: commandId,
      commandName: input.name,
      actor: user,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      inputPayload: input.payload,
      beforeSnapshot,
      afterSnapshot,
      result: storedResult,
      createdAt: new Date().toISOString()
    });

    io.emit('command:completed', {
      commandId,
      commandName: input.name,
      actorId: user.id,
      affectedIds: result.affectedIds,
      toast: storedResult.toast
    });

    return storedResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed.';
    const failed: CommandResult = { ok: false, commandId, affectedIds: [], toast: message };
    await db.insert(commandJournal).values({
      id: commandId,
      commandName: input.name,
      idempotencyKey: input.idempotencyKey,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      reason: input.reason,
      inputPayload: input.payload,
      status: 'failed',
      affectedIds: [],
      beforeSnapshot,
      afterSnapshot: {},
      result: failed as unknown as Record<string, unknown>,
      error: message
    });
    await appendJsonlJournal({
      id: commandId,
      commandName: input.name,
      actor: user,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      inputPayload: input.payload,
      beforeSnapshot,
      result: failed,
      error: message,
      createdAt: new Date().toISOString()
    });
    io.emit('command:failed', { commandId, commandName: input.name, actorId: user.id, toast: message });
    return failed;
  }
}

async function runCommand(tx: Tx, name: CommandName, payload: Payload, user: SessionUser, commandId: string, reason?: string): Promise<CommandResult> {
  switch (name) {
    case 'createBatch':
      return createBatch(tx, payload, commandId);
    case 'updateBatch':
      return updateBatch(tx, payload, commandId);
    case 'deleteBatch':
      return deleteBatch(tx, payload, commandId);
    case 'postPurchaseReceipt':
      return postPurchaseReceipt(tx, payload, commandId, reason);
    case 'createPurchaseOrder':
      return createPurchaseOrder(tx, payload, user.id, commandId);
    case 'updatePurchaseOrder':
      return updatePurchaseOrder(tx, payload, commandId);
    case 'addPurchaseOrderLine':
      return addPurchaseOrderLine(tx, payload, commandId);
    case 'updatePurchaseOrderLine':
      return updatePurchaseOrderLine(tx, payload, commandId);
    case 'removePurchaseOrderLine':
      return removePurchaseOrderLine(tx, payload, commandId);
    case 'finalizePurchaseOrder':
      return finalizePurchaseOrder(tx, payload, user.id, commandId);
    case 'unfinalizePurchaseOrder':
      return unfinalizePurchaseOrder(tx, payload, commandId);
    case 'approvePurchaseOrder':
      return approvePurchaseOrder(tx, payload, user.id, commandId);
    case 'recordVendorPrepayment':
      return recordVendorPrepayment(tx, payload, commandId);
    case 'receivePurchaseOrder':
      return receivePurchaseOrder(tx, payload, commandId);
    case 'cancelPurchaseOrder':
      return cancelPurchaseOrder(tx, payload, commandId);
    case 'rejectBatch':
      return rejectBatch(tx, payload, commandId);
    case 'flagBatch':
      return flagBatch(tx, payload, commandId);
    case 'verifyAllIntake':
      return verifyAllIntake(tx, payload, commandId, reason);
    case 'adjustBatchQuantity':
      return adjustBatchQuantity(tx, payload, commandId, reason);
    case 'setInventoryStatus':
      return setInventoryStatus(tx, payload, commandId, reason);
    case 'transferInventoryLocation':
      return transferInventoryLocation(tx, payload, commandId, reason);
    case 'transferInventoryOwnership':
      return transferInventoryOwnership(tx, payload, commandId, reason);
    case 'setBatchPrice':
      return updateBatch(tx, { ...payload, unitPrice: requiredNumber(payload.unitPrice, 'unitPrice') }, commandId, 'Batch price updated.');
    case 'setBatchLotInfo':
      return updateBatch(tx, payload, commandId, 'Lot information updated.');
    case 'attachBatchPhoto':
      return attachBatchPhoto(tx, payload, user.id, commandId);
    case 'importBatchesCsv':
      return importBatchesCsv(tx, payload, commandId);
    case 'applyTags':
      return applyTags(tx, payload, commandId);
    case 'createSalesOrder':
      return createSalesOrder(tx, payload, commandId);
    case 'addSalesOrderLine':
      return addSalesOrderLine(tx, payload, commandId);
    case 'updateSalesOrderLine':
      return updateSalesOrderLine(tx, payload, commandId);
    case 'removeSalesOrderLine':
      return removeSalesOrderLine(tx, payload, commandId);
    case 'reserveInventoryForOrder':
      return reserveInventoryForOrder(tx, payload, commandId);
    case 'priceSalesOrder':
      return priceSalesOrder(tx, payload, commandId);
    case 'confirmSalesOrder':
      return confirmSalesOrder(tx, payload, commandId);
    case 'cancelSalesOrder':
      return cancelSalesOrder(tx, payload, commandId);
    case 'postSalesOrder':
      return postSalesOrder(tx, payload, commandId);
    case 'allocateOrderToFulfillment':
    case 'createPickList':
      return allocateOrderToFulfillment(tx, payload, user.id, commandId);
    case 'applyClientCredit':
      return applyClientCredit(tx, payload, commandId);
    case 'setDeliveryWindow':
      return setDeliveryWindow(tx, payload, commandId);
    case 'logPayment':
      return logPayment(tx, payload, commandId);
    case 'allocatePayment':
      return allocatePayment(tx, payload, commandId);
    case 'unallocatePayment':
      return unallocatePayment(tx, payload, commandId);
    case 'refundPayment':
      return refundPayment(tx, payload, commandId);
    case 'applyEarlyPayDiscount':
      return applyEarlyPayDiscount(tx, payload, commandId);
    case 'createVendorBill':
      return createVendorBill(tx, payload, commandId);
    case 'approveVendorBill':
      return updateVendorBillStatus(tx, payload, 'approved', commandId, 'Vendor bill approved.');
    case 'scheduleVendorPayment':
      return scheduleVendorPayment(tx, payload, commandId);
    case 'recordVendorPayment':
      return recordVendorPayment(tx, payload, commandId);
    case 'voidVendorPayment':
      return voidVendorPayment(tx, payload, commandId);
    case 'recordWeighAndPack':
      return recordWeighAndPack(tx, payload, commandId);
    case 'markOrderFulfilled':
      return markOrderFulfilled(tx, payload, commandId);
    case 'printLabels':
      return printLabels(tx, payload, commandId);
    case 'adjustFulfillmentLine':
      return recordWeighAndPack(tx, payload, commandId, 'Fulfillment line adjusted.');
    case 'approveConnectorRequest':
      return reviewConnectorRequest(tx, payload, 'approved', user, commandId);
    case 'rejectConnectorRequest':
      return reviewConnectorRequest(tx, payload, 'rejected', user, commandId);
    case 'routeConnectorRequest':
      return reviewConnectorRequest(tx, payload, 'routed', user, commandId);
    case 'createCorrectionJournalEntry':
      return createCorrectionJournalEntry(tx, payload, commandId);
    case 'postTransactionLedgerRow':
      return postTransactionLedgerRow(tx, payload, user, commandId);
    case 'upsertTransactionType':
      return upsertTransactionType(tx, payload, commandId);
    case 'reverseCommandById':
      return reverseCommandById(tx, payload, commandId);
    case 'restoreFromBackupPoint':
      return restoreFromBackupPoint(tx, payload, commandId);
    case 'repriceOrder':
      return priceSalesOrder(tx, payload, commandId, 'Order repriced.');
    case 'postPeriodAdjustments':
      return postPeriodAdjustments(tx, payload, commandId);
    case 'lockPeriod':
      return lockPeriod(tx, payload, user.id, commandId);
    case 'archivePeriod':
      return archivePeriod(tx, payload, commandId);
    case 'createVendor':
      return createVendor(tx, payload, commandId);
    case 'createCustomerNeed':
      return createCustomerNeed(tx, payload, user.id, commandId);
    case 'updateCustomerNeed':
      return updateCustomerNeed(tx, payload, commandId);
    case 'createVendorSupply':
      return createVendorSupply(tx, payload, commandId);
    case 'updateVendorSupply':
      return updateVendorSupply(tx, payload, commandId);
    case 'acceptMatchmakingMatch':
      return reviewMatchmakingMatch(tx, payload, 'accepted', user.id, commandId);
    case 'dismissMatchmakingMatch':
      return reviewMatchmakingMatch(tx, payload, 'dismissed', user.id, commandId);
    case 'setItemAlias':
      return setItemAlias(tx, payload, commandId);
  }
}

async function createBatch(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
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
  const [row] = await tx
    .insert(batches)
    .values({
      itemId,
      vendorId: vendorId || null,
      purchaseOrderId: stringValue(payload.purchaseOrderId) || null,
      purchaseOrderLineId: stringValue(payload.purchaseOrderLineId) || null,
      batchCode: code('BATCH'),
      sourceCode: stringValue(payload.sourceCode) || null,
      shorthand: stringValue(payload.shorthand) || null,
      name,
      category,
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

async function updateBatch(tx: Tx, payload: Payload, commandId: string, toast = 'Batch updated.'): Promise<CommandResult> {
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

async function deleteBatch(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const batchId = requiredId(payload.id ?? payload.batchId, 'batchId');
  const [current] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!current) throw new Error('Batch not found.');
  if (current.status === 'posted') throw new Error('Posted batches cannot be deleted. Reverse the posting instead.');
  await tx.delete(batches).where(eq(batches.id, batchId));
  return { ok: true, commandId, affectedIds: [batchId], toast: 'Draft batch deleted.' };
}

async function postPurchaseReceipt(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
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

  const total = rows.reduce((sum: number, row: typeof batches.$inferSelect) => sum + Number(row.intakeQty) * Number(row.unitCost), 0);
  const [receipt] = await tx
    .insert(purchaseReceipts)
    .values({ receiptNo: code('RCPT'), vendorId: rows[0].vendorId, purchaseOrderId, total: moneyScale(total), status: 'posted' })
    .returning();

  const affected = [receipt.id, ...batchIds];
  const discrepancyNotes: string[] = [];
  const stamp = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    const subtotal = Number(row.intakeQty) * Number(row.unitCost);
    await tx.insert(purchaseReceiptLines).values({
      receiptId: receipt.id,
      batchId: row.id,
      qty: row.intakeQty,
      unitCost: row.unitCost,
      subtotal: moneyScale(subtotal)
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
        const isMismatch = Number(poLine.qty) !== Number(row.intakeQty);
        if (isMismatch) {
          const detail = `Intake discrepancy: expected ${Number(poLine.qty)} ${poLine.uom}, received ${Number(row.intakeQty)} ${row.uom} on ${stamp} (${row.name})`;
          discrepancyNotes.push(operatorReason ? `${detail} — ${operatorReason}.` : `${detail}.`);
        } else if (operatorReason) {
          discrepancyNotes.push(`Intake note on ${stamp} (${row.name}): ${operatorReason}.`);
        }
        await tx.update(purchaseOrderLines).set({ receivedQty: qtyScale(row.intakeQty), status: 'received', updatedAt: new Date() }).where(eq(purchaseOrderLines.id, poLine.id));
      }
    }
  }
  if (purchaseOrderId) {
    await tx.update(purchaseOrders).set({ status: 'received', receivedAt: new Date(), updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
    if (discrepancyNotes.length) {
      const [poRow] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
      const merged = [stringValue(poRow?.internalNotes), ...discrepancyNotes].filter(Boolean).join('\n');
      await tx.update(purchaseOrders).set({ internalNotes: merged, updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
    }
    const poLineRows = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
    const actualPoTotal = poLineRows.reduce((sum: number, line: typeof purchaseOrderLines.$inferSelect) => sum + Number(line.receivedQty) * Number(line.unitCost), 0);
    await tx.update(purchaseOrders).set({ total: moneyScale(actualPoTotal), updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
  }

  const grouped = new Map<string, number>();
  const reasonsByVendor = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.vendorId) continue;
    const amount = Number(row.intakeQty) * Number(row.unitCost);
    grouped.set(row.vendorId, (grouped.get(row.vendorId) ?? 0) + amount);
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
        amount: moneyScale(amount),
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

async function createPurchaseOrder(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
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

async function createVendor(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const name = requiredString(payload.name, 'name');
  const termsDays = Number(payload.termsDays ?? 14);
  if (!Number.isFinite(termsDays) || termsDays < 0) throw new Error('Vendor payment terms must be zero or more days.');
  const [existing] = await tx.select().from(vendors).where(ilike(vendors.name, name.trim())).limit(1);
  if (existing) return { ok: true, commandId, affectedIds: [existing.id], toast: `${existing.name} already exists.` };
  const [vendor] = await tx
    .insert(vendors)
    .values({
      name: name.trim(),
      termsDays: Math.round(termsDays),
      contact: stringValue(payload.contact) || null,
      notes: stringValue(payload.notes) || null,
      consignmentDefault: Boolean(payload.consignmentDefault)
    })
    .returning();
  return { ok: true, commandId, affectedIds: [vendor.id], toast: `${vendor.name} added to vendors.` };
}

async function updatePurchaseOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
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
    if (!['draft', 'approved', 'ordered', 'partially_received'].includes(nextStatus)) throw new Error('Purchase order status is not valid for manual update.');
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
async function addPurchaseOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  assertPurchaseOrderEditable(order.status);
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
  const hasRange = costRangeLow != null && costRangeHigh != null;

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
      tags,
      qty: qtyScale(qty),
      uom: stringValue(payload.uom) || 'lb',
      unitCost: moneyScale(unitCost),
      unitPrice: moneyScale(unitCost),
      costRangeLow: costRangeLow != null ? moneyScale(costRangeLow) : null,
      costRangeHigh: costRangeHigh != null ? moneyScale(costRangeHigh) : null,
      sourceCode: stringValue(payload.sourceCode) || order.poNo,
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
    toast: status === 'needs_fix' ? `${productName} added; enter unit cost before approving PO.` : `${productName} added to ${order.poNo}.`
  };
}

async function updatePurchaseOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Purchase order line not found.');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, line.purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  assertPurchaseOrderEditable(order.status);

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.productName !== undefined || payload.name !== undefined) values.productName = stringValue(payload.productName ?? payload.name);
  copyIfPresent(values, 'category', payload.category);
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
    const hasRange = newRangeLow != null && newRangeHigh != null;

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
  values.status = Number(nextLine.receivedQty ?? 0) >= Number(nextLine.qty ?? 0) ? 'received' : hasValidCost ? 'planned' : 'needs_fix';
  await tx.update(purchaseOrderLines).set(values).where(eq(purchaseOrderLines.id, lineId));
  await recalcPurchaseOrder(tx, line.purchaseOrderId);
  return { ok: true, commandId, affectedIds: [line.purchaseOrderId, lineId], toast: 'Purchase order line updated.' };
}

async function removePurchaseOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Purchase order line not found.');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, line.purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  assertPurchaseOrderEditable(order.status);
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
async function finalizePurchaseOrder(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
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
async function unfinalizePurchaseOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  if (order.status !== 'finalized') throw new Error('Only finalized purchase orders can be returned to draft.');

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

async function recordVendorPrepayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
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

async function approvePurchaseOrder(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  if (order.status !== 'finalized') throw new Error('Purchase order must be finalized before approval.');
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  if (!lines.length) throw new Error('Add at least one product line before approving this purchase order.');
  const issues = lines.flatMap((line: typeof purchaseOrderLines.$inferSelect) => purchaseOrderLineIssues(line).map((issue) => `${line.productName}: ${issue}`));
  if (issues.length) throw new Error(issues.join(' '));
  await tx.update(purchaseOrderLines).set({ status: 'planned', updatedAt: new Date() }).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  await tx.update(purchaseOrders).set({ status: 'approved', orderedAt: new Date(), orderedBy: userId, updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
  await recalcPurchaseOrder(tx, purchaseOrderId);
  const affected = [purchaseOrderId, ...lines.map((line: typeof purchaseOrderLines.$inferSelect) => line.id)];
  let createdCount = 0;
  if (order.vendorId) {
    const received = await receivePurchaseOrder(tx, { purchaseOrderId }, commandId);
    affected.push(...received.affectedIds);
    createdCount = Math.max(received.affectedIds.length - 1 - lines.length, 0);
  }
  const toast = createdCount
    ? `${order.poNo} approved and ${createdCount} draft intake row(s) created.`
    : `${order.poNo} approved and ready to receive when product arrives.`;
  return { ok: true, commandId, affectedIds: [...new Set(affected)], toast };
}

async function receivePurchaseOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  if (!['approved', 'ordered', 'partially_received'].includes(order.status)) throw new Error('Approve this purchase order before receiving product against it.');
  if (!order.vendorId) throw new Error('Choose a vendor before receiving this purchase order.');
  const selectedLineIds = Array.isArray(payload.lineIds) ? requiredIds(payload.lineIds, 'lineIds') : [];
  const allLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  const lines = selectedLineIds.length ? allLines.filter((line: typeof purchaseOrderLines.$inferSelect) => selectedLineIds.includes(line.id)) : allLines;
  if (!lines.length) throw new Error('No purchase order lines are available to receive.');
  const existingBatches = await tx.select().from(batches).where(eq(batches.purchaseOrderId, purchaseOrderId));
  const linesWithBatches = new Set(
    (existingBatches as Array<typeof batches.$inferSelect>)
      .filter((b) => b.archivedAt == null && b.purchaseOrderLineId)
      .map((b) => b.purchaseOrderLineId as string)
  );
  const affected = [purchaseOrderId];
  let createdCount = 0;
  for (const line of lines as Array<typeof purchaseOrderLines.$inferSelect>) {
    if (linesWithBatches.has(line.id)) continue;
    const remainingQty = Number(line.qty);
    if (remainingQty <= 0) continue;
    const created = await createBatch(
      tx,
      {
        vendorId: order.vendorId,
        purchaseOrderId,
        purchaseOrderLineId: line.id,
        itemId: line.itemId,
        sourceCode: line.sourceCode || order.poNo,
        shorthand: line.shorthand,
        name: line.productName,
        category: line.category,
        tags: line.tags,
        intakeQty: remainingQty,
        availableQty: 0,
        uom: line.uom,
        unitCost: line.unitCost,
        unitPrice: line.unitPrice,
        legacyMarker: line.legacyMarker || line.ownershipStatus,
        ownershipStatus: line.ownershipStatus,
        arrivalConfirmed: true,
        arrivalStatus: 'arrived',
        location: 'Receiving',
        status: 'draft',
        notes: [`Received from ${order.poNo}.`, line.notes].filter(Boolean).join(' ')
      },
      commandId
    );
    affected.push(...created.affectedIds, line.id);
    createdCount += created.affectedIds.length;
  }
  const toast = createdCount
    ? `Materialized ${createdCount} draft intake row(s). Verify actual counts and discrepancy reasons before posting.`
    : 'No new draft intake rows materialized — existing rows are ready for verification.';
  return { ok: true, commandId, affectedIds: [...new Set(affected)], toast };
}

async function cancelPurchaseOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const purchaseOrderId = requiredId(payload.purchaseOrderId ?? payload.id, 'purchaseOrderId');
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).limit(1);
  if (!order) throw new Error('Purchase order not found.');
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  if (lines.some((line: typeof purchaseOrderLines.$inferSelect) => Number(line.receivedQty) > 0)) throw new Error('Purchase orders with received product cannot be cancelled. Use intake reversal/correction.');
  await tx.update(purchaseOrders).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
  await tx.update(purchaseOrderLines).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  return { ok: true, commandId, affectedIds: [purchaseOrderId, ...lines.map((line: typeof purchaseOrderLines.$inferSelect) => line.id)], toast: `${order.poNo} cancelled.` };
}

async function rejectBatch(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
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
    const billRows = await tx.select().from(vendorBills).where(eq(vendorBills.purchaseOrderId, row.purchaseOrderId));
    for (const bill of billRows as Array<typeof vendorBills.$inferSelect>) {
      if (bill.status === 'paid' || bill.status === 'void') continue;
      const next = Math.max(Number(bill.amount) - Number(row.intakeQty) * Number(row.unitCost), 0);
      await tx.update(vendorBills).set({ amount: moneyScale(next), updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
      affected.push(bill.id);
    }
  }
  return { ok: true, commandId, affectedIds: [...new Set(affected)], toast: `${row.batchCode} rejected: ${rejectionReason}` };
}

async function flagBatch(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
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

async function verifyAllIntake(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
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

async function adjustBatchQuantity(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const delta = requiredNumber(payload.deltaQty ?? payload.qtyDelta, 'deltaQty');
  const [row] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!row) throw new Error('Batch not found.');
  if (!reason && !stringValue(payload.reason)) throw new Error('Adjustment reason is required so inventory corrections stay traceable.');
  const nextQty = Number(row.availableQty) + delta;
  if (nextQty < 0) throw new Error('Available quantity cannot go below zero.');
  await tx.update(batches).set({ availableQty: qtyScale(nextQty), updatedAt: new Date() }).where(eq(batches.id, batchId));
  await tx.insert(inventoryMovements).values({ batchId, commandId, kind: 'manual_adjustment', qtyDelta: qtyScale(delta), reason });
  return { ok: true, commandId, affectedIds: [batchId], toast: `Adjusted ${row.name} by ${delta}.` };
}

async function setInventoryStatus(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const status = inventoryStatus(payload.status);
  const movementReason = requiredString(reason || payload.reason, 'reason');
  const [row] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!row) throw new Error('Batch not found.');
  if (!['posted', 'held', 'damaged', 'returned', 'in_transit'].includes(row.status)) {
    throw new Error('Only posted inventory rows can move through inventory state transitions.');
  }
  if (row.status === status) {
    return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} is already ${status}.`, delta: { status, unchanged: true } };
  }
  await tx.update(batches).set({ status, updatedAt: new Date() }).where(eq(batches.id, batchId));
  await tx.insert(inventoryMovements).values({ batchId, commandId, kind: 'status_transfer', qtyDelta: '0.000', reason: `${row.status} -> ${status}: ${movementReason}` });
  return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} moved from ${row.status} to ${status}.`, delta: { fromStatus: row.status, toStatus: status } };
}

async function transferInventoryLocation(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const location = requiredString(payload.location, 'location');
  const movementReason = requiredString(reason || payload.reason, 'reason');
  const [row] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!row) throw new Error('Batch not found.');
  if (row.location === location) {
    return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} is already in ${location}.`, delta: { location, unchanged: true } };
  }
  await tx.update(batches).set({ location, updatedAt: new Date() }).where(eq(batches.id, batchId));
  await tx.insert(inventoryMovements).values({ batchId, commandId, kind: 'location_transfer', qtyDelta: '0.000', reason: `${row.location} -> ${location}: ${movementReason}` });
  return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} moved to ${location}.`, delta: { fromLocation: row.location, toLocation: location } };
}

async function transferInventoryOwnership(tx: Tx, payload: Payload, commandId: string, reason?: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const ownershipStatus = ownership(payload.ownershipStatus);
  const movementReason = requiredString(reason || payload.reason, 'reason');
  const vendorId = payload.vendorId != null ? stringValue(payload.vendorId) || null : undefined;
  const [row] = await tx.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!row) throw new Error('Batch not found.');
  if (ownershipStatus === 'C' && !(vendorId ?? row.vendorId)) throw new Error('Consigned inventory needs a vendor before ownership transfer.');
  if (row.ownershipStatus === ownershipStatus && (vendorId === undefined || row.vendorId === vendorId)) {
    return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} already has ${ownershipStatus} ownership.`, delta: { ownershipStatus, unchanged: true } };
  }
  const values: Record<string, unknown> = { ownershipStatus, updatedAt: new Date() };
  if (vendorId !== undefined) values.vendorId = vendorId;
  await tx.update(batches).set(values).where(eq(batches.id, batchId));
  await tx.insert(inventoryMovements).values({ batchId, commandId, kind: 'ownership_transfer', qtyDelta: '0.000', reason: `${row.ownershipStatus} -> ${ownershipStatus}: ${movementReason}` });
  return { ok: true, commandId, affectedIds: [batchId], toast: `${row.name} ownership moved to ${ownershipStatus}.`, delta: { fromOwnershipStatus: row.ownershipStatus, toOwnershipStatus: ownershipStatus } };
}

async function attachBatchPhoto(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const photoUrl = requiredString(payload.photoUrl, 'photoUrl');
  await tx.update(batches).set({ photoUrl, mediaStatus: 'done', updatedAt: new Date() }).where(eq(batches.id, batchId));
  await tx.insert(photographyQueue).values({ batchId, requestedBy: userId, status: 'done', notes: stringValue(payload.notes) || null });
  return { ok: true, commandId, affectedIds: [batchId], toast: 'Batch photo attached.' };
}

async function importBatchesCsv(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const csv = requiredString(payload.csv, 'csv');
  const validateOnly = payload.validateOnly !== false;
  const validation = validateBatchCsv(csv);
  if (validateOnly) {
    return {
      ok: validation.valid,
      commandId,
      affectedIds: [],
      toast: validation.valid ? `CSV is valid for ${validation.rows.length} batch row(s).` : `${validation.errors.length} CSV issue(s) found.`,
      delta: validation as unknown as Record<string, unknown>
    };
  }
  if (!validation.valid) throw new Error(`${validation.errors.length} CSV issue(s) must be fixed before import.`);

  const affected: string[] = [];
  for (const row of validation.rows) {
    const vendorId = await ensureVendor(tx, row.values.vendor);
    const created = await createBatch(
      tx,
      {
        vendorId,
        name: row.values.name,
        category: row.values.category,
        tags: row.values.tags ? row.values.tags.split('|').map((tag) => tag.trim()) : [],
        intakeQty: Number(row.values.intake_qty),
        unitCost: Number(row.values.unit_cost),
        unitPrice: 0,
        sourceCode: row.values.source_code,
        intakeDate: row.values.intake_date,
        ticketCost: row.values.ticket_cost,
        priceRange: row.values.price_range,
        notes: row.values.notes,
        legacyMarker: row.values.legacy_marker || row.values.ownership_status || null,
        ownershipStatus: row.values.ownership_status || 'UNKNOWN',
        arrivalStatus: row.values.arrival_status || 'pending',
        status: 'draft'
      },
      commandId
    );
    affected.push(...created.affectedIds);
  }
  return { ok: true, commandId, affectedIds: affected, toast: `Imported ${affected.length} batch row(s).` };
}

async function applyTags(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const entityType = requiredString(payload.entityType, 'entityType');
  const entityId = requiredId(payload.entityId ?? payload.id, 'entityId');
  const incoming = tagValue(payload.tags);
  const mode = stringValue(payload.mode) || 'replace';
  if (!['add', 'remove', 'replace'].includes(mode)) throw new Error('Tag mode must be add, remove, or replace.');
  if (!incoming.length && mode !== 'replace') throw new Error('Enter at least one tag.');

  const current = await taggedEntity(tx, entityType, entityId);
  const currentTags = tagValue(current.tags);
  const nextTags =
    mode === 'add'
      ? [...new Set([...currentTags, ...incoming])]
      : mode === 'remove'
        ? currentTags.filter((tag) => !incoming.includes(tag))
        : incoming;

  await ensureTagCatalog(tx, nextTags);
  await updateTaggedEntity(tx, entityType, entityId, nextTags);
  if (entityType === 'customerNeed') await rebuildMatchesForNeed(tx, entityId);
  if (entityType === 'vendorSupply') await rebuildMatchesForSupply(tx, entityId);

  return {
    ok: true,
    commandId,
    affectedIds: [entityId],
    toast: nextTags.length ? `Tags updated: ${nextTags.join(', ')}.` : 'Tags cleared.',
    delta: { entityType, entityId, tags: nextTags }
  };
}

async function setItemAlias(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const itemId = requiredId(payload.itemId ?? payload.id, 'itemId');
  const [item] = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!item) throw new Error('Item not found.');
  const rawAlias = payload.alias;
  const trimmed = typeof rawAlias === 'string' ? rawAlias.trim() : '';
  if (trimmed.length > 120) throw new Error('Alias must be 120 characters or fewer.');
  const nextAlias = trimmed.length ? trimmed : null;
  if ((item.alias ?? null) === nextAlias) {
    return { ok: true, commandId, affectedIds: [itemId], toast: nextAlias ? `${item.name} alias already set to ${nextAlias}.` : `${item.name} has no alias.`, delta: { alias: nextAlias, unchanged: true } };
  }
  await tx.update(items).set({ alias: nextAlias, updatedAt: new Date() }).where(eq(items.id, itemId));
  const toast = nextAlias ? `${item.name} alias set to ${nextAlias}.` : `${item.name} alias cleared.`;
  return { ok: true, commandId, affectedIds: [itemId], toast, delta: { previousAlias: item.alias ?? null, alias: nextAlias } };
}

async function resolveItemAlias(tx: Tx, itemId: string | null | undefined): Promise<string | null> {
  if (!itemId) return null;
  const [row] = await tx.select({ alias: items.alias }).from(items).where(eq(items.id, itemId)).limit(1);
  return row?.alias ?? null;
}

async function createSalesOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  const [order] = await tx.insert(salesOrders).values({ orderNo: code('SO'), customerId, status: 'draft', notes: stringValue(payload.notes) || null, validationIssues: [] }).returning();
  return { ok: true, commandId, affectedIds: [order.id], toast: `${order.orderNo} created for ${customer.name}.` };
}

async function addSalesOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const batchId = stringValue(payload.batchId);
  const qty = requiredNumber(payload.qty ?? 1, 'qty');
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  if (!['draft', 'confirmed'].includes(order.status)) throw new Error('Only draft or confirmed orders can be edited.');
  const unresolvedSourceText = stringValue(payload.unresolvedSourceText ?? payload.itemName ?? payload.sourceRowKey);
  const [batch] = batchId ? await tx.select().from(batches).where(eq(batches.id, requiredId(batchId, 'batchId'))).limit(1) : [];
  if (batchId && (!batch || batch.status !== 'posted')) throw new Error('Selected batch is not available for sale.');
  if (batch && Number(batch.availableQty) - Number(batch.reservedQty) < qty) throw new Error(`${batch.name} does not have enough available quantity.`);
  const itemName = batch?.name || stringValue(payload.itemName) || unresolvedSourceText;
  if (!itemName) throw new Error('Item name or source text is required for a draft sale line.');
  const unitPrice = payload.unitPrice != null ? requiredNumber(payload.unitPrice, 'unitPrice') : Number(batch?.unitPrice ?? 0);
  const validationIssues = salesLineValidationIssues({ ...payload, batchId: batch?.id ?? null, itemName, qty, unitPrice });
  const displayName = batch?.itemId ? (await resolveItemAlias(tx, batch.itemId)) ?? itemName : itemName;
  const [line] = await tx
    .insert(salesOrderLines)
    .values({
      orderId,
      batchId: batch?.id ?? null,
      itemName,
      displayName,
      qty: qtyScale(qty),
      unitPrice: moneyScale(unitPrice),
      unitCost: batch?.unitCost ?? moneyScale(0),
      sourceRowKey: stringValue(payload.sourceRowKey) || batch?.batchCode || null,
      unresolvedSourceText: unresolvedSourceText || null,
      legacyStatusMarker: stringValue(payload.legacyStatusMarker) || null,
      validationIssues,
      status: validationIssues.length ? 'needs_fix' : 'draft'
    })
    .returning();
  await recalcOrder(tx, orderId);
  return { ok: true, commandId, affectedIds: [orderId, line.id, ...(batch?.id ? [batch.id] : [])], toast: validationIssues.length ? `${itemName} draft line saved; resolve ${validationIssues.length} issue(s).` : `${itemName} added to order.` };
}

async function updateSalesOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  if (!payload.lineId && !payload.id && payload.orderId) {
    const orderId = requiredId(payload.orderId, 'orderId');
    const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
    if (!order) throw new Error('Sales order not found.');
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.deliveryWindow != null) values.deliveryWindow = stringValue(payload.deliveryWindow) || null;
    if (payload.notes != null) values.notes = stringValue(payload.notes) || null;
    if (payload.legacyStatusMarkers != null) values.legacyStatusMarkers = stringValue(payload.legacyStatusMarkers) || null;
    if (payload.packed != null) values.packed = Boolean(payload.packed);
    if (payload.inventoryPosted != null) values.inventoryPosted = Boolean(payload.inventoryPosted);
    if (payload.paymentFollowup != null) values.paymentFollowup = Boolean(payload.paymentFollowup);
    await tx.update(salesOrders).set(values).where(eq(salesOrders.id, orderId));
    const lineValues: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.packed != null) lineValues.packed = Boolean(payload.packed);
    if (payload.inventoryPosted != null) lineValues.inventoryPosted = Boolean(payload.inventoryPosted);
    if (payload.paymentFollowup != null) lineValues.paymentFollowup = Boolean(payload.paymentFollowup);
    if (Object.keys(lineValues).length > 1) await tx.update(salesOrderLines).set(lineValues).where(eq(salesOrderLines.orderId, orderId));
    return { ok: true, commandId, affectedIds: [orderId], toast: 'Order closeout fields updated.' };
  }
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Sales line not found.');
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.batchId != null) {
    const batchId = stringValue(payload.batchId);
    if (batchId) {
      const [batch] = await tx.select().from(batches).where(eq(batches.id, requiredId(batchId, 'batchId'))).limit(1);
      if (!batch || batch.status !== 'posted') throw new Error('Selected batch is not available for sale.');
      values.batchId = batch.id;
      values.itemName = batch.name;
      values.displayName = batch.itemId ? (await resolveItemAlias(tx, batch.itemId)) ?? batch.name : batch.name;
      values.unitCost = batch.unitCost;
      values.sourceRowKey = stringValue(payload.sourceRowKey) || batch.batchCode;
      values.unresolvedSourceText = null;
    } else {
      values.batchId = null;
    }
  }
  copyIfPresent(values, 'itemName', payload.itemName);
  if (payload.qty != null) values.qty = qtyScale(payload.qty);
  if (payload.unitPrice != null) values.unitPrice = moneyScale(payload.unitPrice);
  if (payload.status != null) values.status = stringValue(payload.status);
  if (payload.sourceRowKey != null) values.sourceRowKey = stringValue(payload.sourceRowKey) || null;
  if (payload.unresolvedSourceText != null) values.unresolvedSourceText = stringValue(payload.unresolvedSourceText) || null;
  if (payload.legacyStatusMarker != null) values.legacyStatusMarker = stringValue(payload.legacyStatusMarker) || null;
  if (payload.packed != null) values.packed = Boolean(payload.packed);
  if (payload.inventoryPosted != null) values.inventoryPosted = Boolean(payload.inventoryPosted);
  if (payload.paymentFollowup != null) values.paymentFollowup = Boolean(payload.paymentFollowup);
  const nextLine = { ...line, ...values } as Record<string, unknown>;
  const validationIssues = salesLineValidationIssues(nextLine);
  values.validationIssues = validationIssues;
  if (validationIssues.length && (payload.status === 'ready' || payload.status === 'confirmed')) values.status = 'needs_fix';
  await tx.update(salesOrderLines).set(values).where(eq(salesOrderLines.id, lineId));
  await recalcOrder(tx, line.orderId);
  return { ok: true, commandId, affectedIds: [line.orderId, lineId], toast: 'Sales line updated.' };
}

async function removeSalesOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Sales line not found.');
  await tx.delete(salesOrderLines).where(eq(salesOrderLines.id, lineId));
  await recalcOrder(tx, line.orderId);
  return { ok: true, commandId, affectedIds: [line.orderId, lineId], toast: 'Sales line removed.' };
}

async function reserveInventoryForOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) throw new Error('Order needs at least one line before reserving inventory.');
  const affected = [orderId];
  for (const line of lines) {
    if (!line.batchId || line.status === 'reserved') continue;
    const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
    if (!batch) throw new Error(`${line.itemName} batch no longer exists.`);
    if (Number(batch.availableQty) - Number(batch.reservedQty) < Number(line.qty)) throw new Error(`${line.itemName} is short on available quantity.`);
    await tx.update(batches).set({ reservedQty: qtyScale(Number(batch.reservedQty) + Number(line.qty)), updatedAt: new Date() }).where(eq(batches.id, batch.id));
    await tx.update(salesOrderLines).set({ status: 'reserved', updatedAt: new Date() }).where(eq(salesOrderLines.id, line.id));
    affected.push(batch.id, line.id);
  }
  return { ok: true, commandId, affectedIds: affected, toast: 'Inventory reserved for order.' };
}

async function priceSalesOrder(tx: Tx, payload: Payload, commandId: string, toast = 'Sales order priced.'): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const strategy = stringValue(payload.strategy) || 'standard';
  const multiplier = strategy === 'premium' ? 1.08 : strategy === 'clearance' ? 0.92 : 1;
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  const [customer] = order.customerId ? await tx.select().from(customers).where(eq(customers.id, order.customerId)).limit(1) : [];
  const profile = resolvePricingProfile(strategy, customer?.tags ?? []);
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  const guardrailHits: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    const base = Number(line.unitPrice);
    const evaluated = evaluatePrice({
      unitCost: Number(line.unitCost),
      basisUnitPrice: base,
      candidateUnitPrice: base * multiplier,
      profile
    });
    if (evaluated.adjusted) guardrailHits.push({ lineId: line.id, itemName: line.itemName, guardrails: evaluated.guardrails, minimumUnitPrice: moneyScale(evaluated.minimumUnitPrice) });
    await tx.update(salesOrderLines).set({ unitPrice: moneyScale(evaluated.unitPrice), updatedAt: new Date() }).where(eq(salesOrderLines.id, line.id));
  }
  await recalcOrder(tx, orderId, strategy);
  return {
    ok: true,
    commandId,
    affectedIds: [orderId, ...lines.map((line: typeof salesOrderLines.$inferSelect) => line.id)],
    toast: guardrailHits.length ? `${toast} ${guardrailHits.length} line(s) were lifted to pricing guardrails.` : toast,
    delta: { strategy, pricingProfile: profile, guardrails: guardrailHits }
  };
}

async function confirmSalesOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  await recalcOrder(tx, orderId);
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) throw new Error('Order needs at least one line.');
  const unresolved = lines.find((line: typeof salesOrderLines.$inferSelect) => salesLineValidationIssues(line).length);
  if (unresolved) throw new Error(`${unresolved.itemName} needs resolution before confirming: ${salesLineValidationIssues(unresolved).join(' ')} ${await candidateSourceText(tx, unresolved)}`);
  const [customer] = await tx.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  if (Number(customer.balance) + Number(order.total) > Number(customer.creditLimit)) {
    throw new Error(`${customer.name} would exceed credit limit. Request a credit override before confirming.`);
  }
  const pricingSnapshot = buildPricingSnapshot(lines, order.pricingStrategy, customer.tags);
  const belowGuardrail = pricingSnapshot.lines.find((line) => line.guardrails.length > 0);
  if (belowGuardrail) throw new Error(`${belowGuardrail.itemName} is below pricing guardrails. Reprice before confirming.`);
  await tx.update(salesOrders).set({ status: 'confirmed', updatedAt: new Date() }).where(eq(salesOrders.id, orderId));
  return { ok: true, commandId, affectedIds: [orderId], toast: `${order.orderNo} confirmed.`, delta: { pricingSnapshot } };
}

async function cancelSalesOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  for (const line of lines) {
    if (!line.batchId || line.status !== 'reserved') continue;
    const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
    if (batch) await tx.update(batches).set({ reservedQty: qtyScale(Math.max(0, Number(batch.reservedQty) - Number(line.qty))), updatedAt: new Date() }).where(eq(batches.id, batch.id));
  }
  await tx.update(salesOrders).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(salesOrders.id, orderId));
  return { ok: true, commandId, affectedIds: [orderId, ...lines.map((line: typeof salesOrderLines.$inferSelect) => line.id)], toast: 'Sales order cancelled and reservations released.' };
}

async function postSalesOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  if (order.status === 'posted') throw new Error(`${order.orderNo} is already posted.`);
  if (order.status !== 'confirmed') throw new Error(`${order.orderNo} must be confirmed before posting.`);
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) throw new Error('Order needs lines before posting.');
  const unresolved = lines.find((line: typeof salesOrderLines.$inferSelect) => salesLineValidationIssues(line).length);
  if (unresolved) throw new Error(`${unresolved.itemName} needs resolution before posting: ${salesLineValidationIssues(unresolved).join(' ')} ${await candidateSourceText(tx, unresolved)}`);
  const sourceKeys = new Set<string>();
  for (const line of lines) {
    const sourceKey = line.sourceRowKey || line.batchId;
    if (!sourceKey) continue;
    if (sourceKeys.has(sourceKey)) {
      throw new Error(`${line.itemName} appears more than once from the same source row. Split the source or remove the duplicate before posting.`);
    }
    sourceKeys.add(sourceKey);
  }

  for (const line of lines) {
    if (!line.batchId) throw new Error(`${line.itemName} needs a source batch.`);
    const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
    if (!batch || Number(batch.availableQty) < Number(line.qty)) throw new Error(`${line.itemName} does not have enough available quantity.`);
  }

  await recalcOrder(tx, orderId);
  const [freshOrder] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  const [customer] = await tx.select().from(customers).where(eq(customers.id, freshOrder.customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  if (Number(customer.balance) + Number(freshOrder.total) > Number(customer.creditLimit)) {
    throw new Error(`${customer.name} would exceed credit limit. Request a credit override before posting.`);
  }

  const affected = [orderId];
  for (const line of lines) {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId!)).limit(1);
    const nextAvailable = Number(batch.availableQty) - Number(line.qty);
    const nextReserved = Math.max(0, Number(batch.reservedQty) - Number(line.qty));
    await tx.update(batches).set({ availableQty: qtyScale(nextAvailable), reservedQty: qtyScale(nextReserved), updatedAt: new Date() }).where(eq(batches.id, batch.id));
    if (batch.ownershipStatus === 'C' && nextAvailable <= 0 && batch.vendorId) {
      const [bill] = await tx
        .select()
        .from(vendorBills)
        .where(sql`${vendorBills.vendorId} = ${batch.vendorId} and ${vendorBills.status} in ('open','approved','scheduled','partial')`)
        .orderBy(vendorBills.createdAt)
        .limit(1);
      if (bill) {
        await tx
          .update(vendorBills)
          .set({ consignmentTriggered: true, status: bill.status === 'open' ? 'approved' : bill.status, dueReason: 'Due because consigned inventory depleted', updatedAt: new Date() })
          .where(eq(vendorBills.id, bill.id));
        affected.push(bill.id);
      } else {
        const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, batch.vendorId)).limit(1);
        const [createdBill] = await tx
          .insert(vendorBills)
          .values({
            vendorId: batch.vendorId,
            billNo: code('VBILL-CONSIGN'),
            amount: moneyScale(Number(line.qty) * Number(batch.unitCost)),
            dueDate: new Date(Date.now() + (vendor?.termsDays ?? 14) * 24 * 60 * 60 * 1000),
            termsDays: vendor?.termsDays ?? 14,
            status: 'approved',
            consignmentTriggered: true,
            dueReason: 'Due because consigned inventory depleted'
          })
          .returning();
        affected.push(createdBill.id);
      }
    }
    await tx.update(salesOrderLines).set({ status: 'posted', inventoryPosted: true, validationIssues: [], updatedAt: new Date() }).where(eq(salesOrderLines.id, line.id));
    await tx.insert(inventoryMovements).values({ batchId: batch.id, commandId, kind: 'sale_posted', qtyDelta: qtyScale(-Number(line.qty)), reason: order.orderNo });
    affected.push(batch.id, line.id);
  }

  const [invoice] = await tx
    .insert(invoices)
    .values({ invoiceNo: code('INV'), customerId: freshOrder.customerId, orderId, total: freshOrder.total, dueDate: oneWeek(), status: 'open' })
    .returning();
  const nextBalance = Number(customer.balance) + Number(freshOrder.total);
  await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, customer.id));
  await tx.insert(clientLedgerEntries).values({ customerId: customer.id, invoiceId: invoice.id, kind: 'invoice', amount: freshOrder.total, balanceAfter: moneyScale(nextBalance), note: freshOrder.orderNo });
  await tx.update(salesOrders).set({ status: 'posted', inventoryPosted: true, postedAt: new Date(), updatedAt: new Date() }).where(eq(salesOrders.id, orderId));
  affected.push(invoice.id, customer.id);

  return { ok: true, commandId, affectedIds: affected, toast: `${freshOrder.orderNo} posted and invoice ${invoice.invoiceNo} created.` };
}

async function allocateOrderToFulfillment(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
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

async function applyClientCredit(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const amount = requiredNumber(payload.amount, 'amount');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  const nextBalance = Number(customer.balance) - amount;
  await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, customerId));
  const [entry] = await tx.insert(clientLedgerEntries).values({ customerId, kind: 'credit', amount: moneyScale(-amount), balanceAfter: moneyScale(nextBalance), note: stringValue(payload.reason) || 'Client credit applied' }).returning();
  return { ok: true, commandId, affectedIds: [customerId, entry.id], toast: `Applied ${moneyScale(amount)} credit to ${customer.name}.` };
}

async function setDeliveryWindow(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const deliveryWindow = requiredString(payload.deliveryWindow, 'deliveryWindow');
  await tx.update(salesOrders).set({ deliveryWindow, updatedAt: new Date() }).where(eq(salesOrders.id, orderId));
  return { ok: true, commandId, affectedIds: [orderId], toast: 'Delivery window updated.' };
}

async function logPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const amount = requiredNumber(payload.amount, 'amount');
  if (amount === 0) throw new Error('Payment amount cannot be zero.');
  const method = stringValue(payload.method) || 'cash';
  const transactionDate = dateOrNull(payload.date ?? payload.createdAt) ?? new Date();
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  const [payment] = await tx
    .insert(payments)
    .values({
      customerId,
      method,
      amount: moneyScale(amount),
      unappliedAmount: moneyScale(Math.max(0, amount)),
      reference: stringValue(payload.reference) || null,
      locationBucket: stringValue(payload.locationBucket) || null,
      notes: stringValue(payload.notes) || null,
      direction: stringValue(payload.direction) || (amount < 0 ? 'buyer_credit' : 'money_in'),
      category: stringValue(payload.category) || (amount < 0 ? 'buyer_credit' : 'client_payment'),
      allocationIntent: stringValue(payload.allocationIntent) || (payload.invoiceId ? 'selected_invoice' : 'fifo'),
      impactPreview: paymentImpactPreview(amount, stringValue(payload.allocationIntent) || (payload.invoiceId ? 'selected_invoice' : 'fifo')),
      status: 'posted',
      createdAt: transactionDate,
      updatedAt: transactionDate
    })
    .returning();

  const affected = [payment.id, customerId];
  if (amount < 0) {
    const credit = Math.abs(amount);
    const nextBalance = Number(customer.balance) - credit;
    await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, customerId));
    const [entry] = await tx.insert(clientLedgerEntries).values({ customerId, paymentId: payment.id, kind: 'down_payment', amount: moneyScale(-credit), balanceAfter: moneyScale(nextBalance), note: 'Negative payment recorded as buyer credit', createdAt: transactionDate }).returning();
    affected.push(entry.id);
  }
  return { ok: true, commandId, affectedIds: affected, toast: `Payment logged for ${customer.name}.` };
}

async function allocatePayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const paymentId = requiredId(payload.paymentId, 'paymentId');
  const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) throw new Error('Payment not found.');
  if (Number(payment.unappliedAmount) <= 0) throw new Error('Payment has no unapplied amount.');
  const invoicesToPay = payload.invoiceId
    ? await tx.select().from(invoices).where(eq(invoices.id, requiredId(payload.invoiceId, 'invoiceId')))
    : await tx.select().from(invoices).where(and(eq(invoices.customerId, payment.customerId), sql`${invoices.status} in ('open', 'partial')`)).orderBy(invoices.createdAt);
  if (!invoicesToPay.length) throw new Error('No open invoice found for allocation.');
  let remaining = Number(payment.unappliedAmount);
  const affected = [paymentId];
  for (const invoice of invoicesToPay) {
    if (remaining <= 0) break;
    const open = Number(invoice.total) - Number(invoice.amountPaid);
    const allocationAmount = Math.min(open, remaining, payload.amount != null ? Number(payload.amount) : remaining);
    if (allocationAmount <= 0) continue;
    const [allocation] = await tx.insert(paymentAllocations).values({ paymentId, invoiceId: invoice.id, amount: moneyScale(allocationAmount) }).returning();
    const invoicePaid = Number(invoice.amountPaid) + allocationAmount;
    await tx.update(invoices).set({ amountPaid: moneyScale(invoicePaid), status: invoicePaid >= Number(invoice.total) ? 'paid' : 'partial', updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
    remaining -= allocationAmount;
    affected.push(invoice.id, allocation.id);
  }
  await tx.update(payments).set({ unappliedAmount: moneyScale(remaining), updatedAt: new Date() }).where(eq(payments.id, paymentId));
  const totalAllocated = Number(payment.unappliedAmount) - remaining;
  if (payment.customerId && totalAllocated > 0) {
    const [customer] = await tx.select().from(customers).where(eq(customers.id, payment.customerId)).limit(1);
    const nextBalance = Number(customer.balance) - totalAllocated;
    await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, payment.customerId));
    const [entry] = await tx.insert(clientLedgerEntries).values({ customerId: payment.customerId, paymentId, kind: 'payment_allocation', amount: moneyScale(-totalAllocated), balanceAfter: moneyScale(nextBalance), note: 'Auto-applied to oldest open invoices' }).returning();
    affected.push(payment.customerId, entry.id);
  }
  return { ok: true, commandId, affectedIds: affected, toast: `Allocated ${moneyScale(totalAllocated)} to oldest open invoices.` };
}

async function unallocatePayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const allocationId = requiredId(payload.allocationId, 'allocationId');
  const [allocation] = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.id, allocationId)).limit(1);
  if (!allocation) throw new Error('Allocation not found.');
  const [payment] = await tx.select().from(payments).where(eq(payments.id, allocation.paymentId)).limit(1);
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, allocation.invoiceId)).limit(1);
  await tx.delete(paymentAllocations).where(eq(paymentAllocations.id, allocationId));
  await tx.update(payments).set({ unappliedAmount: moneyScale(Number(payment.unappliedAmount) + Number(allocation.amount)), updatedAt: new Date() }).where(eq(payments.id, payment.id));
  const paid = Math.max(0, Number(invoice.amountPaid) - Number(allocation.amount));
  await tx.update(invoices).set({ amountPaid: moneyScale(paid), status: paid <= 0 ? 'open' : 'partial', updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
  return { ok: true, commandId, affectedIds: [allocationId, payment.id, invoice.id], toast: 'Payment allocation reversed.' };
}

async function refundPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const paymentId = requiredId(payload.paymentId, 'paymentId');
  const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) throw new Error('Payment not found.');
  await tx.update(payments).set({ status: 'refunded', unappliedAmount: '0.00', updatedAt: new Date() }).where(eq(payments.id, paymentId));
  return { ok: true, commandId, affectedIds: [paymentId], toast: 'Payment refunded.' };
}

async function applyEarlyPayDiscount(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const invoiceId = requiredId(payload.invoiceId, 'invoiceId');
  const amount = requiredNumber(payload.amount, 'amount');
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new Error('Invoice not found.');
  const nextTotal = Math.max(0, Number(invoice.total) - amount);
  await tx.update(invoices).set({ total: moneyScale(nextTotal), status: Number(invoice.amountPaid) >= nextTotal ? 'paid' : invoice.status, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
  return { ok: true, commandId, affectedIds: [invoiceId], toast: 'Early-pay discount applied.' };
}

async function createVendorBill(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const vendorId = requiredId(payload.vendorId, 'vendorId');
  const amount = requiredNumber(payload.amount, 'amount');
  const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new Error('Vendor not found.');
  const dueReason = stringValue(payload.dueReason) || 'Net terms payable';
  const [bill] = await tx
    .insert(vendorBills)
    .values({ vendorId, billNo: code('VBILL'), amount: moneyScale(amount), dueDate: dateOrNull(payload.dueDate) ?? new Date(Date.now() + vendor.termsDays * 24 * 60 * 60 * 1000), termsDays: vendor.termsDays, dueReason })
    .returning();
  return { ok: true, commandId, affectedIds: [bill.id], toast: `Vendor bill created for ${vendor.name}.` };
}

async function updateVendorBillStatus(tx: Tx, payload: Payload, status: string, commandId: string, toast: string): Promise<CommandResult> {
  const billId = requiredId(payload.vendorBillId ?? payload.id, 'vendorBillId');
  await tx.update(vendorBills).set({ status, updatedAt: new Date() }).where(eq(vendorBills.id, billId));
  return { ok: true, commandId, affectedIds: [billId], toast };
}

async function scheduleVendorPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const billId = requiredId(payload.vendorBillId ?? payload.id, 'vendorBillId');
  const scheduledFor = dateOrNull(payload.scheduledFor) ?? oneWeek();
  await tx.update(vendorBills).set({ status: 'scheduled', scheduledFor, dueReason: 'Scheduled payment event exists', updatedAt: new Date() }).where(eq(vendorBills.id, billId));
  return { ok: true, commandId, affectedIds: [billId], toast: 'Vendor payment scheduled with an actual due event.' };
}

async function recordVendorPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const billId = requiredId(payload.vendorBillId ?? payload.id, 'vendorBillId');
  const [bill] = await tx.select().from(vendorBills).where(eq(vendorBills.id, billId)).limit(1);
  if (!bill) throw new Error('Vendor bill not found.');
  if (bill.status !== 'scheduled' && payload.overrideUnscheduled !== true) {
    throw new Error('Schedule this vendor payment before recording payment. Scheduled means a real appointment/payment event exists.');
  }
  const amount = payload.amount != null ? requiredNumber(payload.amount, 'amount') : Number(bill.amount) - Number(bill.amountPaid);
  if (amount <= 0) throw new Error('Vendor payout amount must be greater than zero.');
  if (Number(bill.amountPaid) + amount > Number(bill.amount)) throw new Error('Vendor payout cannot exceed the open bill balance.');
  const transactionDate = dateOrNull(payload.date ?? payload.createdAt) ?? new Date();
  const [payment] = await tx.insert(vendorPayments).values({ vendorBillId: billId, amount: moneyScale(amount), method: stringValue(payload.method) || 'cash', reference: stringValue(payload.reference) || null, createdAt: transactionDate }).returning();
  const paid = Number(bill.amountPaid) + amount;
  await tx.update(vendorBills).set({ amountPaid: moneyScale(paid), status: paid >= Number(bill.amount) ? 'paid' : 'partial', dueReason: paid >= Number(bill.amount) ? 'Paid in full' : 'Partially paid vendor payable', updatedAt: new Date() }).where(eq(vendorBills.id, billId));
  return { ok: true, commandId, affectedIds: [billId, payment.id], toast: 'Vendor payout recorded and traceable.' };
}

async function voidVendorPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const paymentId = requiredId(payload.vendorPaymentId ?? payload.id, 'vendorPaymentId');
  const [payment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.id, paymentId)).limit(1);
  if (!payment) throw new Error('Vendor payment not found.');
  await tx.update(vendorPayments).set({ status: 'void' }).where(eq(vendorPayments.id, paymentId));
  const [bill] = await tx.select().from(vendorBills).where(eq(vendorBills.id, payment.vendorBillId)).limit(1);
  await tx.update(vendorBills).set({ amountPaid: moneyScale(Math.max(0, Number(bill.amountPaid) - Number(payment.amount))), status: 'approved', dueReason: bill.consignmentTriggered ? 'Due because consigned inventory depleted' : 'Approved vendor payable', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
  return { ok: true, commandId, affectedIds: [paymentId, bill.id], toast: 'Vendor payout voided.' };
}

async function recordWeighAndPack(tx: Tx, payload: Payload, commandId: string, toast = 'Weigh and pack recorded.'): Promise<CommandResult> {
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
  return { ok: true, commandId, affectedIds: [line.pickListId, lineId], toast };
}

async function markOrderFulfilled(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  if (order.status !== 'posted') throw new Error(`${order.orderNo} must be posted before fulfillment.`);
  const [pick] = await tx.select().from(pickLists).where(eq(pickLists.orderId, orderId)).limit(1);
  if (!pick) throw new Error('Create a pick list before marking fulfilled.');
  const lines = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.pickListId, pick.id));
  const unpacked = lines.find((line: typeof fulfillmentLines.$inferSelect) => Number(line.actualQty) <= 0);
  if (unpacked) throw new Error('Every fulfillment line needs an actual quantity before fulfillment.');
  await tx.update(pickLists).set({ status: 'fulfilled', tracking: stringValue(payload.tracking) || pick.tracking, updatedAt: new Date() }).where(eq(pickLists.id, pick.id));
  await tx.update(salesOrders).set({ status: 'fulfilled', packed: true, fulfilledAt: new Date(), updatedAt: new Date() }).where(eq(salesOrders.id, orderId));
  await tx.update(salesOrderLines).set({ packed: true, updatedAt: new Date() }).where(eq(salesOrderLines.orderId, orderId));
  await writeBagManifest(tx, pick.id);
  return { ok: true, commandId, affectedIds: [orderId, pick.id, ...lines.map((line: typeof fulfillmentLines.$inferSelect) => line.id)], toast: 'Order fulfilled.' };
}

async function printLabels(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const pickListId = requiredId(payload.pickListId ?? payload.id, 'pickListId');
  const labelFormat = stringValue(payload.labelFormat) || '4x6';
  await tx.update(pickLists).set({ labelsPrinted: true, labelFormat, updatedAt: new Date() }).where(eq(pickLists.id, pickListId));
  await writeBagManifest(tx, pickListId);
  return { ok: true, commandId, affectedIds: [pickListId], toast: `${labelFormat} labels marked printed.` };
}

async function reviewConnectorRequest(tx: Tx, payload: Payload, status: string, user: SessionUser, commandId: string): Promise<CommandResult> {
  const requestId = requiredId(payload.requestId ?? payload.id, 'requestId');
  const [request] = await tx.select().from(connectorRequests).where(eq(connectorRequests.id, requestId)).limit(1);
  if (!request) throw new Error('Connector request not found.');
  const history = [
    ...(Array.isArray(request.reviewHistory) ? request.reviewHistory : []),
    { status, actorId: user.id, actorName: user.name, at: new Date().toISOString(), note: stringValue(payload.operatorNotes ?? payload.reason), routedTo: stringValue(payload.routedTo) }
  ];
  const routedTo = status === 'routed' ? requiredString(payload.routedTo, 'routedTo') : status === 'approved' ? stringValue(payload.routedTo) || request.routedTo || routeFromRequest(request.requestType) : request.routedTo;
  await tx
    .update(connectorRequests)
    .set({
      status,
      routedTo,
      operatorNotes: stringValue(payload.operatorNotes ?? payload.reason) || request.operatorNotes,
      reviewHistory: history,
      updatedAt: new Date()
    })
    .where(eq(connectorRequests.id, requestId));
  return { ok: true, commandId, affectedIds: [requestId], toast: `Connector request ${status}.` };
}

async function createCorrectionJournalEntry(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const period = periodValue(payload.period);
  const amount = requiredNumber(payload.amount, 'amount');
  const memo = requiredString(payload.memo, 'memo');
  const transactionDate = dateOrNull(payload.date ?? payload.createdAt) ?? new Date();
  const [entry] = await tx.insert(correctionJournalEntries).values({ period, amount: moneyScale(amount), memo, createdAt: transactionDate }).returning();
  const affected = [entry.id];
  if (payload.findReplace && typeof payload.findReplace === 'object') {
    affected.push(...(await applyFindReplace(tx, payload.findReplace as Payload)));
  }
  if (payload.invoiceId) {
    const [dispute] = await tx
      .insert(invoiceDisputes)
      .values({ invoiceId: requiredId(payload.invoiceId, 'invoiceId'), reason: stringValue(payload.reason) || memo, status: 'open' })
      .returning();
    affected.push(dispute.id);
  }
  return { ok: true, commandId, affectedIds: affected, toast: payload.invoiceId ? 'Correction journal and invoice dispute posted.' : 'Correction journal entry posted.' };
}

async function postTransactionLedgerRow(tx: Tx, payload: Payload, user: SessionUser, commandId: string): Promise<CommandResult> {
  const direction = requiredString(payload.direction, 'direction');
  const entityType = requiredString(payload.entityType, 'entityType');
  const transactionType = requiredString(payload.transactionType, 'transactionType');
  const amount = requiredNumber(payload.amount, 'amount');
  if (amount === 0) throw new Error('Transaction amount cannot be zero.');
  const transactionDate = dateOrNull(payload.date) ?? new Date();
  const method = stringValue(payload.method) || 'cash';
  const reference = stringValue(payload.reference) || null;
  const notes = stringValue(payload.notes);
  const allocationTargetType = stringValue(payload.allocationTargetType);
  const allocationIntent = stringValue(payload.allocationIntent) || allocationTargetType || 'fifo';
  const targetId = stringValue(payload.allocationTargetId);

  if (entityType === 'customer' && direction === 'receiving') {
    const signedAmount = ['buyer_credit', 'down_payment', 'customer_down_payment'].includes(transactionType) ? -Math.abs(amount) : amount;
    let clientAllocationIntent = allocationTargetType === 'selected_invoice' ? 'selected' : allocationIntent;
    const customerId = requiredId(payload.entityId, 'entityId');
    if (signedAmount > 0 && clientAllocationIntent === 'fifo') {
      const [openInvoice] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.customerId, customerId), sql`${invoices.status} in ('open', 'partial')`))
        .limit(1);
      if (!openInvoice) clientAllocationIntent = 'unapplied';
    }
    const logged = await logPayment(
      tx,
      {
        customerId,
        amount: signedAmount,
        method,
        reference,
        locationBucket: stringValue(payload.bucket) || 'cash-file-a',
        notes,
        direction: 'money_in',
        category: signedAmount < 0 ? 'buyer_credit' : transactionType,
        allocationIntent: clientAllocationIntent,
        invoiceId: targetId && clientAllocationIntent === 'selected' ? targetId : undefined,
        date: transactionDate
      },
      commandId
    );
    if (logged.ok && signedAmount > 0 && clientAllocationIntent !== 'unapplied') {
      const allocated = await allocatePayment(tx, { paymentId: logged.affectedIds[0], invoiceId: clientAllocationIntent === 'selected' ? targetId || undefined : undefined }, commandId);
      return { ...logged, affectedIds: [...logged.affectedIds, ...allocated.affectedIds], toast: `${logged.toast} ${allocated.toast}` };
    }
    return logged;
  }

  if (entityType === 'vendor' && direction === 'paying') {
    if (!['owner', 'manager'].includes(user.role)) throw new Error('Vendor payouts require manager access.');
    return postVendorLedgerPayment(tx, payload, transactionDate, commandId);
  }

  const entityLabel = stringValue(payload.entityName) || entityType;
  const signedAmount = direction === 'paying' ? -Math.abs(amount) : Math.abs(amount);
  return createCorrectionJournalEntry(
    tx,
    {
      period: transactionDate.toISOString().slice(0, 7),
      amount: signedAmount,
      memo: [labelFromToken(transactionType), entityLabel, notes || reference].filter(Boolean).join(' / '),
      date: transactionDate
    },
    commandId
  );
}

async function postVendorLedgerPayment(tx: Tx, payload: Payload, transactionDate: Date, commandId: string): Promise<CommandResult> {
  const vendorId = requiredId(payload.entityId, 'entityId');
  const amount = Math.abs(requiredNumber(payload.amount, 'amount'));
  const transactionType = requiredString(payload.transactionType, 'transactionType');
  const method = stringValue(payload.method) || 'cash';
  const reference = stringValue(payload.reference) || null;
  const notes = stringValue(payload.notes);
  const allocationTargetType = stringValue(payload.allocationTargetType) || stringValue(payload.allocationIntent) || 'unapplied';
  const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new Error('Vendor not found.');

  if (allocationTargetType === 'selected_bill' && payload.allocationTargetId) {
    return recordVendorPayment(tx, { vendorBillId: requiredId(payload.allocationTargetId, 'allocationTargetId'), amount, method, reference, overrideUnscheduled: true, date: transactionDate }, commandId);
  }

  let purchaseOrderId: string | null = null;
  let purchaseOrderLabel = '';
  if (['vendor_product_payment', 'product_payment', 'vendor_down_payment'].includes(transactionType)) {
    const targetId = stringValue(payload.allocationTargetId);
    const purchaseOrderRows = targetId && allocationTargetType === 'selected_po'
      ? await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, targetId), eq(purchaseOrders.vendorId, vendorId))).limit(1)
      : await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.vendorId, vendorId), sql`${purchaseOrders.status} not in ('cancelled')`)).orderBy(purchaseOrders.createdAt).limit(1);
    const [po] = purchaseOrderRows;
    if (!po) throw new Error('No open purchase order found for this vendor payment.');
    purchaseOrderId = po.id;
    purchaseOrderLabel = po.poNo;
  }

  const dueReason = [
    labelFromToken(transactionType),
    purchaseOrderLabel ? `against ${purchaseOrderLabel}` : 'manual ledger row',
    notes
  ].filter(Boolean).join(' / ');
  const [bill] = await tx
    .insert(vendorBills)
    .values({
      vendorId,
      purchaseOrderId,
      billNo: code('VBILL'),
      amount: moneyScale(amount),
      amountPaid: moneyScale(amount),
      dueDate: transactionDate,
      scheduledFor: transactionDate,
      termsDays: vendor.termsDays,
      status: 'paid',
      dueReason,
      createdAt: transactionDate,
      updatedAt: transactionDate
    })
    .returning();
  const [payment] = await tx
    .insert(vendorPayments)
    .values({
      vendorBillId: bill.id,
      amount: moneyScale(amount),
      method,
      reference: reference || purchaseOrderLabel || labelFromToken(transactionType),
      status: 'posted',
      createdAt: transactionDate
    })
    .returning();
  return { ok: true, commandId, affectedIds: [bill.id, payment.id, ...(purchaseOrderId ? [purchaseOrderId] : [])], toast: `Paying ledger row posted for ${vendor.name}.` };
}

async function upsertTransactionType(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const label = requiredString(payload.label, 'label');
  const slug = stringValue(payload.slug) || slugFromLabel(label);
  const direction = requiredString(payload.direction, 'direction');
  const allowedEntityTypes = Array.isArray(payload.allowedEntityTypes) ? payload.allowedEntityTypes.map(String).filter(Boolean) : [requiredString(payload.entityType ?? 'other', 'entityType')];
  const values = {
    slug,
    label,
    direction,
    allowedEntityTypes,
    defaultMethod: stringValue(payload.defaultMethod) || 'cash',
    defaultBucket: stringValue(payload.defaultBucket) || (direction === 'paying' ? 'accounting' : 'cash-file-a'),
    defaultAllocationIntent: stringValue(payload.defaultAllocationIntent) || 'unapplied',
    requiresApproval: Boolean(payload.requiresApproval),
    isSystem: false,
    isActive: payload.isActive !== false,
    updatedAt: new Date()
  };
  const [row] = await tx
    .insert(transactionTypes)
    .values(values)
    .onConflictDoUpdate({
      target: transactionTypes.slug,
      set: values
    })
    .returning();
  return { ok: true, commandId, affectedIds: [row.id], toast: `Transaction type ${row.label} saved.` };
}

async function applyFindReplace(tx: Tx, payload: Payload) {
  const table = requiredString(payload.table, 'table');
  const find = requiredString(payload.find, 'find');
  const replacement = stringValue(payload.replacement);
  const pattern = `%${find}%`;
  const replace = (column: unknown) => sql`replace(coalesce(${column}, ''), ${find}, ${replacement})`;

  if (table === 'batches') {
    const rows = await tx
      .select({ id: batches.id })
      .from(batches)
      .where(or(ilike(batches.name, pattern), ilike(batches.sourceCode, pattern), ilike(batches.shorthand, pattern), ilike(batches.legacyMarker, pattern), ilike(batches.notes, pattern)));
    if (!rows.length) return [];
    await tx
      .update(batches)
      .set({ name: replace(batches.name), sourceCode: replace(batches.sourceCode), shorthand: replace(batches.shorthand), legacyMarker: replace(batches.legacyMarker), notes: replace(batches.notes), updatedAt: new Date() })
      .where(inArray(batches.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  if (table === 'customers') {
    const rows = await tx.select({ id: customers.id }).from(customers).where(or(ilike(customers.name, pattern), ilike(customers.notes, pattern)));
    if (!rows.length) return [];
    await tx.update(customers).set({ name: replace(customers.name), notes: replace(customers.notes), updatedAt: new Date() }).where(inArray(customers.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  if (table === 'vendors') {
    const rows = await tx.select({ id: vendors.id }).from(vendors).where(or(ilike(vendors.name, pattern), ilike(vendors.notes, pattern)));
    if (!rows.length) return [];
    await tx.update(vendors).set({ name: replace(vendors.name), notes: replace(vendors.notes), updatedAt: new Date() }).where(inArray(vendors.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  if (table === 'sales_orders') {
    const rows = await tx.select({ id: salesOrders.id }).from(salesOrders).where(or(ilike(salesOrders.deliveryWindow, pattern), ilike(salesOrders.legacyStatusMarkers, pattern), ilike(salesOrders.notes, pattern)));
    if (!rows.length) return [];
    await tx
      .update(salesOrders)
      .set({ deliveryWindow: replace(salesOrders.deliveryWindow), legacyStatusMarkers: replace(salesOrders.legacyStatusMarkers), notes: replace(salesOrders.notes), updatedAt: new Date() })
      .where(inArray(salesOrders.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  if (table === 'connector_requests') {
    const rows = await tx.select({ id: connectorRequests.id }).from(connectorRequests).where(ilike(connectorRequests.operatorNotes, pattern));
    if (!rows.length) return [];
    await tx.update(connectorRequests).set({ operatorNotes: replace(connectorRequests.operatorNotes), updatedAt: new Date() }).where(inArray(connectorRequests.id, rows.map((row: { id: string }) => row.id)));
    return rows.map((row: { id: string }) => row.id);
  }

  throw new Error('Find and replace is only available for approved text fields.');
}

async function reverseCommandById(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const originalId = requiredId(payload.commandId, 'commandId');
  const [original] = await tx.select().from(commandJournal).where(eq(commandJournal.id, originalId)).limit(1);
  if (!original) throw new Error('Original command not found.');
  if (original.reversedByCommandId) throw new Error('That command has already been reversed.');
  if (original.status !== 'ok') throw new Error('Only successful commands can be reversed.');

  const affected = [originalId];
  const snapshot = original.afterSnapshot as Record<string, any>;
  const beforeSnapshot = original.beforeSnapshot as Record<string, any>;
  const policy = reversalPolicies[original.commandName as CommandName];

  if (original.commandName === 'postSalesOrder') {
    for (const line of snapshot.salesOrderLines ?? []) {
      if (!line.batchId) continue;
      const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
      if (batch) {
        await tx.update(batches).set({ availableQty: qtyScale(Number(batch.availableQty) + Number(line.qty)), updatedAt: new Date() }).where(eq(batches.id, batch.id));
        affected.push(batch.id);
      }
    }
    for (const invoice of snapshot.invoices ?? []) {
      const [currentInvoice] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
      if (currentInvoice && Number(currentInvoice.amountPaid) > 0) throw new Error('Reverse payment allocations before reversing this sale.');
      await tx.update(invoices).set({ status: 'reversed', updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
      if (invoice.customerId) {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
        if (customer) {
          const nextBalance = Number(customer.balance) - Number(invoice.total);
          await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, customer.id));
          const [entry] = await tx
            .insert(clientLedgerEntries)
            .values({ customerId: customer.id, invoiceId: invoice.id, kind: 'sale_reversal', amount: moneyScale(-Number(invoice.total)), balanceAfter: moneyScale(nextBalance), note: `Reversal of ${original.commandName}` })
            .returning();
          affected.push(customer.id, entry.id);
        }
      }
      affected.push(invoice.id);
    }
    for (const order of snapshot.salesOrders ?? []) {
      await tx.update(salesOrders).set({ status: 'reversed', updatedAt: new Date() }).where(eq(salesOrders.id, order.id));
      affected.push(order.id);
    }
  } else if (original.commandName === 'approvePurchaseOrder') {
    for (const order of snapshot.purchaseOrders ?? []) {
      await tx.update(purchaseOrders).set({ status: 'draft', orderedAt: null, updatedAt: new Date() }).where(eq(purchaseOrders.id, order.id));
      affected.push(order.id);
    }
    for (const line of snapshot.purchaseOrderLines ?? []) {
      const status = purchaseOrderLineIssues(line).length ? 'needs_fix' : 'planned';
      await tx.update(purchaseOrderLines).set({ status, updatedAt: new Date() }).where(eq(purchaseOrderLines.id, line.id));
      affected.push(line.id);
    }
  } else if (original.commandName === 'receivePurchaseOrder') {
    for (const batch of snapshot.batches ?? []) {
      if (batch.status === 'posted') throw new Error('Reverse the posted purchase receipt before reversing PO receiving.');
      await tx.update(batches).set({ status: 'reversed', availableQty: '0.000', updatedAt: new Date() }).where(eq(batches.id, batch.id));
      affected.push(batch.id);
    }
    for (const line of snapshot.purchaseOrderLines ?? []) {
      await tx.update(purchaseOrderLines).set({ receivedQty: '0.000', status: 'planned', updatedAt: new Date() }).where(eq(purchaseOrderLines.id, line.id));
      affected.push(line.id);
    }
    for (const order of snapshot.purchaseOrders ?? []) {
      await tx.update(purchaseOrders).set({ status: 'approved', receivedAt: null, updatedAt: new Date() }).where(eq(purchaseOrders.id, order.id));
      affected.push(order.id);
    }
  } else if (original.commandName === 'postPurchaseReceipt') {
    for (const batch of snapshot.batches ?? []) {
      await tx.update(batches).set({ status: 'reversed', availableQty: '0.000', updatedAt: new Date() }).where(eq(batches.id, batch.id));
      affected.push(batch.id);
    }
    for (const bill of snapshot.vendorBills ?? []) {
      await tx.update(vendorBills).set({ status: 'reversed', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
      affected.push(bill.id);
    }
    for (const receipt of snapshot.purchaseReceipts ?? []) {
      await tx.update(purchaseReceipts).set({ status: 'reversed', updatedAt: new Date() }).where(eq(purchaseReceipts.id, receipt.id));
      affected.push(receipt.id);
    }
  } else if (original.commandName === 'setItemAlias') {
    for (const item of beforeSnapshot.items ?? []) {
      const priorAlias = (item as Record<string, unknown>).alias ?? null;
      await tx.update(items).set({ alias: priorAlias, updatedAt: new Date() }).where(eq(items.id, (item as { id: string }).id));
      affected.push((item as { id: string }).id);
    }
  } else if (['setInventoryStatus', 'transferInventoryLocation', 'transferInventoryOwnership'].includes(original.commandName)) {
    for (const batch of beforeSnapshot.batches ?? []) {
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (original.commandName === 'setInventoryStatus' && batch.status != null) values.status = batch.status;
      if (original.commandName === 'transferInventoryLocation' && batch.location != null) values.location = batch.location;
      if (original.commandName === 'transferInventoryOwnership') {
        if (batch.ownershipStatus != null) values.ownershipStatus = batch.ownershipStatus;
        if ('vendorId' in batch) values.vendorId = batch.vendorId;
      }
      await tx.update(batches).set(values).where(eq(batches.id, batch.id));
      await tx.insert(inventoryMovements).values({
        batchId: batch.id,
        commandId,
        kind: 'inventory_transfer_reversal',
        qtyDelta: '0.000',
        reason: `Reversal of ${original.commandName}`
      });
      affected.push(batch.id);
    }
  } else if (original.commandName === 'logPayment') {
    for (const payment of snapshot.payments ?? []) {
      const [currentPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
      if (!currentPayment) continue;
      if (Number(currentPayment.unappliedAmount) !== Math.max(0, Number(currentPayment.amount))) {
        throw new Error('Unallocate this payment before reversing the payment log.');
      }
      await tx.update(payments).set({ status: 'reversed', unappliedAmount: '0.00', updatedAt: new Date() }).where(eq(payments.id, currentPayment.id));
      affected.push(currentPayment.id);
      if (Number(currentPayment.amount) < 0 && currentPayment.customerId) {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, currentPayment.customerId)).limit(1);
        if (customer) {
          const nextBalance = Number(customer.balance) + Math.abs(Number(currentPayment.amount));
          await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, customer.id));
          const [entry] = await tx
            .insert(clientLedgerEntries)
            .values({ customerId: customer.id, paymentId: currentPayment.id, kind: 'payment_reversal', amount: moneyScale(Math.abs(Number(currentPayment.amount))), balanceAfter: moneyScale(nextBalance), note: 'Buyer credit reversal' })
            .returning();
          affected.push(customer.id, entry.id);
        }
      }
    }
  } else if (original.commandName === 'allocatePayment') {
    for (const allocation of snapshot.paymentAllocations ?? []) {
      const [currentAllocation] = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.id, allocation.id)).limit(1);
      if (!currentAllocation) continue;
      const [payment] = await tx.select().from(payments).where(eq(payments.id, currentAllocation.paymentId)).limit(1);
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, currentAllocation.invoiceId)).limit(1);
      await tx.delete(paymentAllocations).where(eq(paymentAllocations.id, currentAllocation.id));
      if (payment) await tx.update(payments).set({ unappliedAmount: moneyScale(Number(payment.unappliedAmount) + Number(currentAllocation.amount)), updatedAt: new Date() }).where(eq(payments.id, payment.id));
      if (invoice) {
        const paid = Math.max(0, Number(invoice.amountPaid) - Number(currentAllocation.amount));
        await tx.update(invoices).set({ amountPaid: moneyScale(paid), status: paid <= 0 ? 'open' : 'partial', updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
        if (invoice.customerId) {
          const [customer] = await tx.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
          if (customer) {
            const nextBalance = Number(customer.balance) + Number(currentAllocation.amount);
            await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, customer.id));
            const [entry] = await tx
              .insert(clientLedgerEntries)
              .values({ customerId: customer.id, invoiceId: invoice.id, paymentId: payment?.id, kind: 'allocation_reversal', amount: moneyScale(Number(currentAllocation.amount)), balanceAfter: moneyScale(nextBalance), note: 'Payment allocation reversal' })
              .returning();
            affected.push(customer.id, entry.id);
          }
        }
      }
      affected.push(currentAllocation.id, currentAllocation.paymentId, currentAllocation.invoiceId);
    }
  } else if (original.commandName === 'postTransactionLedgerRow') {
    for (const payment of snapshot.payments ?? []) {
      const [currentPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
      if (!currentPayment) continue;
      const currentAllocations = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, currentPayment.id));
      for (const allocation of currentAllocations) {
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, allocation.invoiceId)).limit(1);
        await tx.delete(paymentAllocations).where(eq(paymentAllocations.id, allocation.id));
        if (invoice) {
          const paid = Math.max(0, Number(invoice.amountPaid) - Number(allocation.amount));
          await tx.update(invoices).set({ amountPaid: moneyScale(paid), status: paid <= 0 ? 'open' : 'partial', updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
          if (invoice.customerId) {
            const [customer] = await tx.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
            if (customer) {
              const nextBalance = Number(customer.balance) + Number(allocation.amount);
              await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, customer.id));
              const [entry] = await tx
                .insert(clientLedgerEntries)
                .values({ customerId: customer.id, invoiceId: invoice.id, paymentId: currentPayment.id, kind: 'allocation_reversal', amount: moneyScale(Number(allocation.amount)), balanceAfter: moneyScale(nextBalance), note: 'Transaction ledger allocation reversal' })
                .returning();
              affected.push(customer.id, entry.id);
            }
          }
          affected.push(invoice.id);
        }
        affected.push(allocation.id);
      }
      if (Number(currentPayment.amount) < 0 && currentPayment.customerId) {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, currentPayment.customerId)).limit(1);
        if (customer) {
          const nextBalance = Number(customer.balance) + Math.abs(Number(currentPayment.amount));
          await tx.update(customers).set({ balance: moneyScale(nextBalance), updatedAt: new Date() }).where(eq(customers.id, customer.id));
          const [entry] = await tx
            .insert(clientLedgerEntries)
            .values({ customerId: customer.id, paymentId: currentPayment.id, kind: 'payment_reversal', amount: moneyScale(Math.abs(Number(currentPayment.amount))), balanceAfter: moneyScale(nextBalance), note: 'Transaction ledger buyer credit reversal' })
            .returning();
          affected.push(customer.id, entry.id);
        }
      }
      await tx.update(payments).set({ status: 'reversed', unappliedAmount: '0.00', updatedAt: new Date() }).where(eq(payments.id, currentPayment.id));
      affected.push(currentPayment.id);
    }

    const beforeBills = new Map((beforeSnapshot.vendorBills ?? []).map((bill: Record<string, unknown>) => [bill.id, bill]));
    for (const payment of snapshot.vendorPayments ?? []) {
      const [currentPayment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.id, payment.id)).limit(1);
      if (!currentPayment) continue;
      await tx.update(vendorPayments).set({ status: 'void' }).where(eq(vendorPayments.id, currentPayment.id));
      const [bill] = await tx.select().from(vendorBills).where(eq(vendorBills.id, currentPayment.vendorBillId)).limit(1);
      if (bill) {
        const beforeBill = beforeBills.get(bill.id) as Record<string, unknown> | undefined;
        if (beforeBill) {
          await tx
            .update(vendorBills)
            .set({
              amountPaid: moneyScale(beforeBill.amountPaid),
              status: String(beforeBill.status ?? 'approved'),
              scheduledFor: beforeBill.scheduledFor ? new Date(String(beforeBill.scheduledFor)) : null,
              dueReason: stringValue(beforeBill.dueReason) || null,
              updatedAt: new Date()
            })
            .where(eq(vendorBills.id, bill.id));
        } else {
          await tx.update(vendorBills).set({ amountPaid: '0.00', status: 'reversed', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
        }
        affected.push(bill.id);
      }
      affected.push(currentPayment.id);
    }
    for (const bill of snapshot.vendorBills ?? []) {
      if (beforeBills.has(bill.id) || affected.includes(bill.id)) continue;
      await tx.update(vendorBills).set({ amountPaid: '0.00', status: 'reversed', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
      affected.push(bill.id);
    }
    for (const entry of snapshot.correctionJournalEntries ?? []) {
      await tx.update(correctionJournalEntries).set({ status: 'reversed' }).where(eq(correctionJournalEntries.id, entry.id));
      affected.push(entry.id);
    }
  } else if (original.commandName === 'createVendorBill') {
    for (const bill of snapshot.vendorBills ?? []) {
      await tx.update(vendorBills).set({ status: 'reversed', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id));
      affected.push(bill.id);
    }
  } else if (original.commandName === 'recordVendorPayment') {
    for (const payment of snapshot.vendorPayments ?? []) {
      const [currentPayment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.id, payment.id)).limit(1);
      if (!currentPayment) continue;
      await tx.update(vendorPayments).set({ status: 'void' }).where(eq(vendorPayments.id, currentPayment.id));
      const [bill] = await tx.select().from(vendorBills).where(eq(vendorBills.id, currentPayment.vendorBillId)).limit(1);
      if (bill) {
        const amountPaid = Math.max(0, Number(bill.amountPaid) - Number(currentPayment.amount));
        await tx
          .update(vendorBills)
          .set({ amountPaid: moneyScale(amountPaid), status: bill.scheduledFor ? 'scheduled' : 'approved', updatedAt: new Date() })
          .where(eq(vendorBills.id, bill.id));
        affected.push(bill.id);
      }
      affected.push(currentPayment.id);
    }
  } else if (original.commandName === 'markOrderFulfilled') {
    for (const pick of snapshot.pickLists ?? []) {
      await tx.update(pickLists).set({ status: 'open', updatedAt: new Date() }).where(eq(pickLists.id, pick.id));
      affected.push(pick.id);
    }
    for (const order of snapshot.salesOrders ?? []) {
      await tx.update(salesOrders).set({ status: 'posted', fulfilledAt: null, updatedAt: new Date() }).where(eq(salesOrders.id, order.id));
      affected.push(order.id);
    }
  } else if (['approveConnectorRequest', 'routeConnectorRequest'].includes(original.commandName)) {
    for (const request of snapshot.connectorRequests ?? []) {
      await tx.update(connectorRequests).set({ status: 'open', routedTo: null, updatedAt: new Date() }).where(eq(connectorRequests.id, request.id));
      affected.push(request.id);
    }
  } else if (['createCorrectionJournalEntry', 'postPeriodAdjustments'].includes(original.commandName)) {
    for (const entry of snapshot.correctionJournalEntries ?? []) {
      await tx.update(correctionJournalEntries).set({ status: 'reversed' }).where(eq(correctionJournalEntries.id, entry.id));
      affected.push(entry.id);
    }
  } else {
    throw new Error(`${original.commandName} is ${policy?.disposition ?? 'not'} reversible: ${policy?.guidance ?? 'No reversal policy is registered.'}`);
  }

  await tx.update(commandJournal).set({ reversedByCommandId: commandId }).where(eq(commandJournal.id, originalId));
  return { ok: true, commandId, affectedIds: affected, toast: `Reversed ${original.commandName}.` };
}

async function restoreFromBackupPoint(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const backupId = requiredId(payload.backupId, 'backupId');
  const [backup] = await tx.select().from(backupSnapshots).where(eq(backupSnapshots.id, backupId)).limit(1);
  if (!backup) throw new Error('Backup snapshot not found.');
  return {
    ok: true,
    commandId,
    affectedIds: [backupId],
    toast: 'Restore preview generated. No ledgers were changed.',
    delta: { readOnly: true, label: backup.label, snapshot: backup.snapshot }
  };
}

async function postPeriodAdjustments(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const period = periodValue(payload.period);
  const adjustments = Array.isArray(payload.adjustments) ? payload.adjustments : [{ amount: payload.amount, memo: payload.memo }];
  const affected: string[] = [];
  for (const adjustment of adjustments as Array<Record<string, unknown>>) {
    const [entry] = await tx.insert(correctionJournalEntries).values({ period, amount: moneyScale(requiredNumber(adjustment.amount, 'amount')), memo: requiredString(adjustment.memo, 'memo') }).returning();
    affected.push(entry.id);
  }
  return { ok: true, commandId, affectedIds: affected, toast: `${affected.length} period adjustment(s) posted.` };
}

// Serializes lockPeriod/archivePeriod for the same period by acquiring a
// transaction-scoped Postgres advisory lock keyed on hashtext(period). Released
// automatically on commit or rollback.
async function acquirePeriodCloseoutLock(tx: Tx, period: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${period})::bigint)`);
}

async function lockPeriod(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const period = periodValue(payload.period);
  await acquirePeriodCloseoutLock(tx, period);
  const [existing] = await tx.select().from(periodLocks).where(eq(periodLocks.period, period)).limit(1);
  if (existing) return { ok: true, commandId, affectedIds: [existing.id], toast: `${period} is already locked.` };
  const safety = await getCloseoutSafety(tx, period);
  if (safety.openWorkCount > 0) {
    throw new Error(`${period} cannot be locked yet: ${safety.blockers.map((blocker) => `${blocker.count} ${blocker.label.toLowerCase()}`).join(', ')}.`);
  }
  const recheck = await getCloseoutSafety(tx, period);
  if (recheck.openWorkCount > 0) {
    throw new Error(`${period} cannot be locked: unsafe work appeared during the lock attempt. Please retry.`);
  }
  const [lock] = await tx.insert(periodLocks).values({ period, lockedBy: userId, status: 'locked' }).returning();
  return { ok: true, commandId, affectedIds: [lock.id], toast: `${period} locked.` };
}

async function archivePeriod(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const period = periodValue(payload.period);
  await acquirePeriodCloseoutLock(tx, period);
  const safety = await getCloseoutSafety(tx, period);
  if (!safety.locked) throw new Error(`${period} must be locked before archiving.`);
  if (!safety.eligible) {
    throw new Error(`${period} cannot be archived: ${safety.blockers.map((blocker) => `${blocker.count} ${blocker.label.toLowerCase()}`).join(', ')}.`);
  }

  await fs.mkdir(env.ARCHIVE_DIR, { recursive: true });
  const archiveBase = path.join(env.ARCHIVE_DIR, period);
  const batchRows = await tx.select().from(batches).where(sql`to_char(${batches.createdAt}, 'YYYY-MM') = ${period}`);
  const journalRows = await tx.select().from(commandJournal).where(sql`to_char(${commandJournal.createdAt}, 'YYYY-MM') = ${period}`).orderBy(commandJournal.createdAt);
  const controlTotals = safety.controlTotals;

  const csvPath = `${archiveBase}-batches.csv`;
  const jsonlPath = `${archiveBase}-commands.jsonl`;
  const pdfPath = `${archiveBase}-summary.pdf`;
  await fs.writeFile(csvPath, rowsToCsv(batchRows as unknown as Array<Record<string, unknown>>, ['id', 'batchCode', 'name', 'category', 'intakeQty', 'availableQty', 'status']), 'utf8');
  await fs.writeFile(jsonlPath, journalRows.map((row: typeof commandJournal.$inferSelect) => JSON.stringify(row)).join('\n'), 'utf8');
  await writeArchivePdf(pdfPath, period, controlTotals);
  const [archive] = await tx.insert(archiveRuns).values({ period, controlTotals, csvPath, jsonlPath, pdfPath, status: 'archived' }).returning();
  await tx.update(batches).set({ archivedAt: new Date() }).where(sql`to_char(${batches.createdAt}, 'YYYY-MM') = ${period}`);
  await tx.update(salesOrders).set({ archivedAt: new Date() }).where(sql`to_char(${salesOrders.createdAt}, 'YYYY-MM') = ${period}`);
  return { ok: true, commandId, affectedIds: [archive.id], toast: `${period} archived with matching control totals.`, delta: { controlTotals, csvPath, jsonlPath, pdfPath } };
}

async function createCustomerNeed(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  const productName = requiredString(payload.productName ?? payload.name, 'productName');
  const category = requiredString(payload.category, 'category');
  const qtyMin = Math.max(0, requiredNumber(payload.qtyMin ?? payload.qty ?? 1, 'qtyMin'));
  if (qtyMin <= 0) throw new Error('Need quantity must be greater than zero.');
  const qtyMaxValue = isBlankValue(payload.qtyMax) ? null : requiredNumber(payload.qtyMax, 'qtyMax');
  if (qtyMaxValue != null && qtyMaxValue < qtyMin) throw new Error('Need max quantity cannot be below min quantity.');
  const tags = tagValue(payload.tags);
  await ensureTagCatalog(tx, tags);
  const [row] = await tx
    .insert(customerNeeds)
    .values({
      needCode: code('NEED'),
      customerId,
      productName,
      category,
      tags,
      qtyMin: qtyScale(qtyMin),
      qtyMax: qtyMaxValue == null ? null : qtyScale(qtyMaxValue),
      targetPrice: isBlankValue(payload.targetPrice) ? null : moneyScale(payload.targetPrice),
      neededBy: dateOrNull(payload.neededBy),
      urgency: urgencyValue(payload.urgency),
      ownerId: userId,
      notes: stringValue(payload.notes) || null,
      status: statusValue(payload.status, ['open', 'matched', 'accepted', 'dismissed', 'closed'], 'open')
    })
    .returning();
  const matchIds = await rebuildMatchesForNeed(tx, row.id);
  return { ok: true, commandId, affectedIds: [row.id, ...matchIds], toast: `Customer need added for ${customer.name}.`, delta: { matchCount: matchIds.length } };
}

async function updateCustomerNeed(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const needId = requiredId(payload.customerNeedId ?? payload.id, 'customerNeedId');
  const [current] = await tx.select().from(customerNeeds).where(eq(customerNeeds.id, needId)).limit(1);
  if (!current) throw new Error('Customer need not found.');
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.customerId !== undefined) values.customerId = stringValue(payload.customerId) ? requiredId(payload.customerId, 'customerId') : null;
  if (payload.productName !== undefined || payload.name !== undefined) values.productName = requiredString(payload.productName ?? payload.name, 'productName');
  if (payload.category !== undefined) values.category = requiredString(payload.category, 'category');
  if (payload.tags !== undefined) {
    values.tags = tagValue(payload.tags);
    await ensureTagCatalog(tx, values.tags as string[]);
  }
  if (payload.qtyMin !== undefined || payload.qty !== undefined) {
    const qtyMin = requiredNumber(payload.qtyMin ?? payload.qty, 'qtyMin');
    if (qtyMin <= 0) throw new Error('Need quantity must be greater than zero.');
    values.qtyMin = qtyScale(qtyMin);
  }
  if (payload.qtyMax !== undefined) values.qtyMax = isBlankValue(payload.qtyMax) ? null : qtyScale(requiredNumber(payload.qtyMax, 'qtyMax'));
  if (payload.targetPrice !== undefined) values.targetPrice = isBlankValue(payload.targetPrice) ? null : moneyScale(payload.targetPrice);
  if (payload.neededBy !== undefined) values.neededBy = dateOrNull(payload.neededBy);
  if (payload.urgency !== undefined) values.urgency = urgencyValue(payload.urgency);
  if (payload.notes !== undefined) values.notes = stringValue(payload.notes) || null;
  if (payload.status !== undefined) values.status = statusValue(payload.status, ['open', 'matched', 'accepted', 'dismissed', 'closed'], 'open');
  const nextQtyMin = Number(values.qtyMin ?? current.qtyMin);
  const nextQtyMax = values.qtyMax == null ? null : Number(values.qtyMax);
  if (nextQtyMax != null && nextQtyMax < nextQtyMin) throw new Error('Need max quantity cannot be below min quantity.');
  await tx.update(customerNeeds).set(values).where(eq(customerNeeds.id, needId));
  const matchIds = await rebuildMatchesForNeed(tx, needId);
  return { ok: true, commandId, affectedIds: [needId, ...matchIds], toast: 'Customer need updated.', delta: { matchCount: matchIds.length } };
}

async function createVendorSupply(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const vendorId = requiredId(payload.vendorId, 'vendorId');
  const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new Error('Vendor not found.');
  const productName = requiredString(payload.productName ?? payload.name, 'productName');
  const category = requiredString(payload.category, 'category');
  const availableQty = requiredNumber(payload.availableQty ?? payload.qty ?? 1, 'availableQty');
  if (availableQty <= 0) throw new Error('Vendor stock quantity must be greater than zero.');
  const tags = tagValue(payload.tags);
  await ensureTagCatalog(tx, tags);
  const [row] = await tx
    .insert(vendorSupply)
    .values({
      supplyCode: code('VS'),
      vendorId,
      productName,
      category,
      tags,
      availableQty: qtyScale(availableQty),
      askingPrice: isBlankValue(payload.askingPrice) ? null : moneyScale(payload.askingPrice),
      availableDate: dateOrNull(payload.availableDate),
      location: stringValue(payload.location) || null,
      grade: stringValue(payload.grade) || null,
      terms: stringValue(payload.terms) || null,
      notes: stringValue(payload.notes) || null,
      status: statusValue(payload.status, ['open', 'held_for_match', 'accepted', 'dismissed', 'closed'], 'open')
    })
    .returning();
  const matchIds = await rebuildMatchesForSupply(tx, row.id);
  return { ok: true, commandId, affectedIds: [row.id, ...matchIds], toast: `Vendor stock added for ${vendor.name}.`, delta: { matchCount: matchIds.length } };
}

async function updateVendorSupply(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const supplyId = requiredId(payload.vendorSupplyId ?? payload.id, 'vendorSupplyId');
  const [current] = await tx.select().from(vendorSupply).where(eq(vendorSupply.id, supplyId)).limit(1);
  if (!current) throw new Error('Vendor stock row not found.');
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.vendorId !== undefined) values.vendorId = stringValue(payload.vendorId) ? requiredId(payload.vendorId, 'vendorId') : null;
  if (payload.productName !== undefined || payload.name !== undefined) values.productName = requiredString(payload.productName ?? payload.name, 'productName');
  if (payload.category !== undefined) values.category = requiredString(payload.category, 'category');
  if (payload.tags !== undefined) {
    values.tags = tagValue(payload.tags);
    await ensureTagCatalog(tx, values.tags as string[]);
  }
  if (payload.availableQty !== undefined || payload.qty !== undefined) {
    const availableQty = requiredNumber(payload.availableQty ?? payload.qty, 'availableQty');
    if (availableQty <= 0) throw new Error('Vendor stock quantity must be greater than zero.');
    values.availableQty = qtyScale(availableQty);
  }
  if (payload.askingPrice !== undefined) values.askingPrice = isBlankValue(payload.askingPrice) ? null : moneyScale(payload.askingPrice);
  if (payload.availableDate !== undefined) values.availableDate = dateOrNull(payload.availableDate);
  if (payload.location !== undefined) values.location = stringValue(payload.location) || null;
  if (payload.grade !== undefined) values.grade = stringValue(payload.grade) || null;
  if (payload.terms !== undefined) values.terms = stringValue(payload.terms) || null;
  if (payload.notes !== undefined) values.notes = stringValue(payload.notes) || null;
  if (payload.status !== undefined) values.status = statusValue(payload.status, ['open', 'held_for_match', 'accepted', 'dismissed', 'closed'], 'open');
  await tx.update(vendorSupply).set(values).where(eq(vendorSupply.id, supplyId));
  const matchIds = await rebuildMatchesForSupply(tx, supplyId);
  return { ok: true, commandId, affectedIds: [supplyId, ...matchIds], toast: 'Vendor stock updated.', delta: { matchCount: matchIds.length } };
}

async function reviewMatchmakingMatch(tx: Tx, payload: Payload, status: 'accepted' | 'dismissed', userId: string, commandId: string): Promise<CommandResult> {
  const matchId = requiredId(payload.matchId ?? payload.id, 'matchId');
  const [match] = await tx.select().from(matchmakingMatches).where(eq(matchmakingMatches.id, matchId)).limit(1);
  if (!match) throw new Error('Match not found.');
  await tx.update(matchmakingMatches).set({ status, reviewedBy: userId, updatedAt: new Date() }).where(eq(matchmakingMatches.id, matchId));
  const affected = new Set([matchId, match.customerNeedId, match.vendorSupplyId]);
  if (status === 'accepted') {
    const siblingMatches = await tx
      .update(matchmakingMatches)
      .set({ status: 'dismissed', reviewedBy: userId, updatedAt: new Date() })
      .where(
        and(
          eq(matchmakingMatches.status, 'open'),
          or(eq(matchmakingMatches.customerNeedId, match.customerNeedId), eq(matchmakingMatches.vendorSupplyId, match.vendorSupplyId)),
          sql`${matchmakingMatches.id} <> ${matchId}`
        )
      )
      .returning({ id: matchmakingMatches.id });
    for (const row of siblingMatches) affected.add(row.id);
    await tx.update(customerNeeds).set({ status: 'matched', updatedAt: new Date() }).where(eq(customerNeeds.id, match.customerNeedId));
    await tx.update(vendorSupply).set({ status: 'held_for_match', updatedAt: new Date() }).where(eq(vendorSupply.id, match.vendorSupplyId));
  }
  return { ok: true, commandId, affectedIds: [...affected], toast: status === 'accepted' ? 'Match accepted. Use existing PO, intake, and sales workspaces for consequences.' : 'Match dismissed.' };
}

async function recalcOrder(tx: Tx, orderId: string, strategy?: string) {
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  const total = lines.reduce((sum: number, line: typeof salesOrderLines.$inferSelect) => sum + Number(line.qty) * Number(line.unitPrice), 0);
  const cost = lines.reduce((sum: number, line: typeof salesOrderLines.$inferSelect) => sum + Number(line.qty) * Number(line.unitCost), 0);
  const values: Record<string, unknown> = { total: moneyScale(total), internalMargin: moneyScale(total - cost), updatedAt: new Date() };
  if (strategy) values.pricingStrategy = strategy;
  await tx.update(salesOrders).set(values).where(eq(salesOrders.id, orderId));
}

function buildPricingSnapshot(lines: Array<typeof salesOrderLines.$inferSelect>, strategy: string, customerTags: string[]) {
  const profile = resolvePricingProfile(strategy, customerTags);
  return {
    strategy,
    profile,
    capturedAt: new Date().toISOString(),
    lines: lines.map((line) => {
      const evaluated = evaluatePrice({
        unitCost: Number(line.unitCost),
        basisUnitPrice: Number(line.unitPrice),
        candidateUnitPrice: Number(line.unitPrice),
        profile
      });
      return {
        lineId: line.id,
        itemName: line.itemName,
        qty: line.qty,
        unitCost: line.unitCost,
        unitPrice: line.unitPrice,
        minimumUnitPrice: moneyScale(evaluated.minimumUnitPrice),
        marginPct: evaluated.marginPct,
        guardrails: evaluated.guardrails
      };
    })
  };
}

async function recalcPurchaseOrder(tx: Tx, purchaseOrderId: string) {
  const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  const total = lines.reduce((sum: number, line: typeof purchaseOrderLines.$inferSelect) => {
    const qty = Number(line.qty);
    let cost = Number(line.unitCost);

    // If line has cost range instead of fixed cost, use midpoint for estimate
    if (cost === 0 && line.costRangeLow != null && line.costRangeHigh != null) {
      const midpoint = rangeMidpoint(Number(line.costRangeLow), Number(line.costRangeHigh));
      cost = midpoint ?? 0;
    }

    return sum + qty * cost;
  }, 0);
  await tx.update(purchaseOrders).set({ total: moneyScale(total), updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
}

function assertPurchaseOrderEditable(status: string) {
  if (['received', 'cancelled'].includes(status)) throw new Error('Received or cancelled purchase orders cannot be edited.');
}

function purchaseOrderLineIssues(line: Record<string, unknown>) {
  const issues: string[] = [];
  if (!stringValue(line.productName)) issues.push('enter product name.');
  if (!stringValue(line.category)) issues.push('enter category.');
  if (Number(line.qty ?? 0) <= 0) issues.push('enter quantity above zero.');

  // Check for either unitCost or valid cost range
  const hasFixedCost = Number(line.unitCost ?? 0) > 0;
  const hasRange = line.costRangeLow != null && line.costRangeHigh != null && Number(line.costRangeLow) > 0 && Number(line.costRangeHigh) > 0;

  if (!hasFixedCost && !hasRange) {
    issues.push('enter unit cost or cost range.');
  }

  return issues;
}

async function ensureVendor(tx: Tx, name: string) {
  const vendorName = name.trim();
  const [existing] = await tx.select().from(vendors).where(eq(vendors.name, vendorName)).limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(vendors).values({ name: vendorName, termsDays: 14 }).returning();
  return created.id;
}

async function ensureItem(tx: Tx, payload: Payload, name: string, category: string) {
  const itemId = stringValue(payload.itemId);
  if (itemId) return itemId;
  const sku = `${category.slice(0, 3).toUpperCase()}-${name.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}-${Math.floor(Math.random() * 999)}`;
  const tags = tagValue(payload.tags);
  await ensureTagCatalog(tx, tags);
  const [created] = await tx.insert(items).values({ sku, name, category, tags }).returning();
  return created.id;
}

async function ensureTagCatalog(tx: Tx, tags: string[]) {
  const unique = [...new Set(tags.map(normalizeTagSlug).filter(Boolean))];
  for (const slug of unique) {
    await tx
      .insert(tagCatalog)
      .values({ slug, label: tagLabel(slug), color: tagColor(slug) })
      .onConflictDoUpdate({
        target: tagCatalog.slug,
        set: { label: tagLabel(slug), updatedAt: new Date(), isActive: true }
      });
  }
}

async function taggedEntity(tx: Tx, entityType: string, entityId: string) {
  const table = taggedTable(entityType);
  const [row] = await tx.select().from(table).where(eq(table.id, entityId)).limit(1);
  if (!row) throw new Error(`${taggedEntityLabel(entityType)} not found.`);
  return row as Record<string, unknown>;
}

async function updateTaggedEntity(tx: Tx, entityType: string, entityId: string, tags: string[]) {
  const table = taggedTable(entityType);
  await tx.update(table).set({ tags, updatedAt: new Date() }).where(eq(table.id, entityId));
}

function taggedTable(entityType: string) {
  switch (entityType) {
    case 'batch':
      return batches as any;
    case 'purchaseOrderLine':
      return purchaseOrderLines as any;
    case 'item':
      return items as any;
    case 'customer':
      return customers as any;
    case 'customerNeed':
      return customerNeeds as any;
    case 'vendorSupply':
      return vendorSupply as any;
    default:
      throw new Error('Tags can be applied to item, purchaseOrderLine, batch, customer, customerNeed, or vendorSupply.');
  }
}

function taggedEntityLabel(entityType: string) {
  return entityType.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

async function rebuildMatchesForNeed(tx: Tx, needId: string) {
  const [need] = await tx.select().from(customerNeeds).where(eq(customerNeeds.id, needId)).limit(1);
  if (!need) throw new Error('Customer need not found.');
  await tx.delete(matchmakingMatches).where(and(eq(matchmakingMatches.customerNeedId, needId), eq(matchmakingMatches.status, 'open')));
  if (need.status !== 'open') return [];
  const supplies = await tx.select().from(vendorSupply).where(eq(vendorSupply.status, 'open'));
  return createBestMatches(tx, need, supplies);
}

async function rebuildMatchesForSupply(tx: Tx, supplyId: string) {
  const [supply] = await tx.select().from(vendorSupply).where(eq(vendorSupply.id, supplyId)).limit(1);
  if (!supply) throw new Error('Vendor stock row not found.');
  await tx.delete(matchmakingMatches).where(and(eq(matchmakingMatches.vendorSupplyId, supplyId), eq(matchmakingMatches.status, 'open')));
  if (supply.status !== 'open') return [];
  const needs = await tx.select().from(customerNeeds).where(eq(customerNeeds.status, 'open'));
  return createBestMatchesForSupply(tx, supply, needs);
}

async function createBestMatches(tx: Tx, need: typeof customerNeeds.$inferSelect, supplies: Array<typeof vendorSupply.$inferSelect>) {
  const chosen = bestSupplyMatchesForNeed(need, supplies);
  if (!chosen.length) return [];
  const existingRows = await tx.select().from(matchmakingMatches).where(eq(matchmakingMatches.customerNeedId, need.id));
  const existingBySupply = new Map<string, typeof matchmakingMatches.$inferSelect>(
    (existingRows as Array<typeof matchmakingMatches.$inferSelect>).map((row) => [row.vendorSupplyId, row])
  );
  const affected: string[] = [];
  for (const match of chosen) {
    const existing = existingBySupply.get(match.supply.id);
    if (existing && existing.status !== 'open') continue;
    if (existing) {
      await tx
        .update(matchmakingMatches)
        .set({ score: Math.min(100, match.score), reasons: match.reasons, status: 'open', updatedAt: new Date() })
        .where(eq(matchmakingMatches.id, existing.id));
      affected.push(existing.id);
    } else {
      const [row] = await tx.insert(matchmakingMatches).values({
        customerNeedId: need.id,
        vendorSupplyId: match.supply.id,
        score: Math.min(100, match.score),
        reasons: match.reasons,
        status: 'open'
      }).returning();
      affected.push(row.id);
    }
  }
  return affected;
}

async function createBestMatchesForSupply(tx: Tx, supply: typeof vendorSupply.$inferSelect, needs: Array<typeof customerNeeds.$inferSelect>) {
  const chosen = needs
    .map((need) => ({ need, ...scoreMatch(need, supply) }))
    .filter((match) => match.score > 0);
  if (!chosen.length) return [];
  const existingRows = await tx.select().from(matchmakingMatches).where(eq(matchmakingMatches.vendorSupplyId, supply.id));
  const existingByNeed = new Map<string, typeof matchmakingMatches.$inferSelect>(
    (existingRows as Array<typeof matchmakingMatches.$inferSelect>).map((row) => [row.customerNeedId, row])
  );
  const affected: string[] = [];
  for (const match of chosen) {
    const existing = existingByNeed.get(match.need.id);
    if (existing && existing.status !== 'open') continue;
    if (existing) {
      await tx
        .update(matchmakingMatches)
        .set({ score: Math.min(100, match.score), reasons: match.reasons, status: 'open', updatedAt: new Date() })
        .where(eq(matchmakingMatches.id, existing.id));
      affected.push(existing.id);
    } else {
      const [row] = await tx.insert(matchmakingMatches).values({
        customerNeedId: match.need.id,
        vendorSupplyId: supply.id,
        score: Math.min(100, match.score),
        reasons: match.reasons,
        status: 'open'
      }).returning();
      affected.push(row.id);
    }
  }
  return affected;
}

function bestSupplyMatchesForNeed(need: typeof customerNeeds.$inferSelect, supplies: Array<typeof vendorSupply.$inferSelect>) {
  const scored = supplies
    .map((supply) => ({ supply, ...scoreMatch(need, supply) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
  const candidates = scored.filter((match) => match.score >= 35);
  return candidates.length ? candidates : scored.slice(0, 1);
}

function scoreMatch(need: typeof customerNeeds.$inferSelect, supply: typeof vendorSupply.$inferSelect) {
  let score = 0;
  const reasons: string[] = [];
  if (need.category.toLowerCase() === supply.category.toLowerCase()) {
    score += 35;
    reasons.push('Category match');
  }
  const overlap = tagValue(need.tags).filter((tag) => tagValue(supply.tags).includes(tag));
  if (overlap.length) {
    score += Math.min(24, overlap.length * 8);
    reasons.push(`Tags: ${overlap.join(', ')}`);
  }
  if (tokenOverlap(need.productName, supply.productName)) {
    score += 10;
    reasons.push('Product wording overlaps');
  }
  if (Number(supply.availableQty) >= Number(need.qtyMin)) {
    score += 12;
    reasons.push('Quantity covers minimum');
  }
  if (need.targetPrice != null && supply.askingPrice != null && Number(supply.askingPrice) <= Number(need.targetPrice)) {
    score += 12;
    reasons.push('Ask is within target');
  }
  if (need.neededBy && supply.availableDate && new Date(supply.availableDate).getTime() <= new Date(need.neededBy).getTime()) {
    score += 7;
    reasons.push('Available before needed-by');
  }
  return { score, reasons };
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(left.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  return right
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => token.length > 2 && leftTokens.has(token));
}

async function snapshotFromPayload(payload: Payload) {
  const ids = collectIds(payload);
  return snapshotByAffectedIds(ids);
}

async function snapshotByAffectedIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const snapshot: Record<string, unknown> = {};
  const tablePairs = [
    ['batches', batches],
    ['salesOrders', salesOrders],
    ['salesOrderLines', salesOrderLines],
    ['invoices', invoices],
    ['payments', payments],
    ['vendorBills', vendorBills],
    ['vendorPayments', vendorPayments],
    ['purchaseOrders', purchaseOrders],
    ['purchaseOrderLines', purchaseOrderLines],
    ['purchaseReceipts', purchaseReceipts],
    ['pickLists', pickLists],
    ['fulfillmentLines', fulfillmentLines],
    ['connectorRequests', connectorRequests],
    ['customerNeeds', customerNeeds],
    ['vendorSupply', vendorSupply],
    ['matchmakingMatches', matchmakingMatches],
    ['tagCatalog', tagCatalog],
    ['transactionTypes', transactionTypes],
    ['customers', customers],
    ['paymentAllocations', paymentAllocations],
    ['clientLedgerEntries', clientLedgerEntries],
    ['correctionJournalEntries', correctionJournalEntries],
    ['items', items]
  ] as const;

  for (const [name, table] of tablePairs) {
    const rows = await db.select().from(table as any).where(inArray((table as any).id, unique));
    if (rows.length) snapshot[name] = rows;
  }
  return snapshot;
}

async function writeBagManifest(tx: Tx, pickListId: string) {
  const [pick] = await tx.select().from(pickLists).where(eq(pickLists.id, pickListId)).limit(1);
  if (!pick) throw new Error('Pick list not found.');
  const lines = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.pickListId, pickListId));
  const manifestDir = path.join(env.ARCHIVE_DIR, 'bag-manifests');
  await fs.mkdir(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, `${pick.pickNo}.csv`);
  const rows = lines.map((line: typeof fulfillmentLines.$inferSelect) => ({
    pickNo: pick.pickNo,
    fulfillmentLineId: line.id,
    orderLineId: line.orderLineId,
    batchId: line.batchId,
    expectedQty: line.expectedQty,
    actualQty: line.actualQty,
    actualWeight: line.actualWeight,
    bagCode: line.bagCode,
    unitsPerBag: pick.unitsPerBag,
    labelFormat: pick.labelFormat,
    labelsPrinted: pick.labelsPrinted,
    tracking: pick.tracking,
    status: line.status
  }));
  await fs.writeFile(
    manifestPath,
    rowsToCsv(rows as unknown as Array<Record<string, unknown>>, [
      'pickNo',
      'fulfillmentLineId',
      'orderLineId',
      'batchId',
      'expectedQty',
      'actualQty',
      'actualWeight',
      'bagCode',
      'unitsPerBag',
      'labelFormat',
      'labelsPrinted',
      'tracking',
      'status'
    ]),
    'utf8'
  );
  await tx.update(pickLists).set({ manifestPath, updatedAt: new Date() }).where(eq(pickLists.id, pickListId));
  return manifestPath;
}

function collectIds(payload: Payload) {
  const values = [
    payload.id,
    payload.batchId,
    payload.orderId,
    payload.lineId,
    payload.customerId,
    payload.vendorId,
    payload.purchaseOrderId,
    payload.purchaseOrderLineId,
    payload.invoiceId,
    payload.paymentId,
    payload.vendorBillId,
    payload.vendorPaymentId,
    payload.pickListId,
    payload.fulfillmentLineId,
    payload.requestId,
    payload.customerNeedId,
    payload.vendorSupplyId,
    payload.matchId,
    payload.entityId,
    payload.allocationTargetId,
    payload.commandId,
    payload.backupId,
    payload.itemId,
    ...(Array.isArray(payload.batchIds) ? payload.batchIds : []),
    ...(Array.isArray(payload.lineIds) ? payload.lineIds : []),
    ...(Array.isArray(payload.selectedIds) ? payload.selectedIds : [])
  ];
  return values.filter((value): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value));
}

async function writeArchivePdf(filePath: string, period: string, totals: Record<string, unknown>) {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const stream = doc.pipe(createWriteStream(filePath));
    doc.fontSize(18).text(`TERP Agro Closeout ${period}`);
    doc.moveDown();
    doc.fontSize(11).text('Control totals');
    for (const [key, value] of Object.entries(totals)) doc.text(`${key}: ${value}`);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function decodeShorthand(input?: string) {
  if (!input) return { name: '', category: '', tags: [] as string[] };
  const [prefix, rawName] = input.split('/');
  const categoryMap: Record<string, string> = {
    Ins: 'Infused',
    Flw: 'Flower',
    Ext: 'Extract',
    Prl: 'Pre-roll',
    Vap: 'Vape'
  };
  return {
    name: rawName ? rawName.replace(/[-_]/g, ' ') : input,
    category: categoryMap[prefix] ?? prefix,
    tags: [prefix.toLowerCase(), rawName?.toLowerCase()].filter(Boolean) as string[]
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isBlankValue(value: unknown) {
  return value == null || (typeof value === 'string' && !value.trim());
}

function requiredString(value: unknown, name: string) {
  const text = stringValue(value);
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

function labelFromToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugFromLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function requiredId(value: unknown, name: string) {
  const id = requiredString(value, name);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`${name} must be a valid ID.`);
  return id;
}

function requiredIds(value: unknown, name: string) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${name} must include at least one row.`);
  return value.map((item) => requiredId(item, name));
}

function requiredNumber(value: unknown, name: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number.`);
  return number;
}

function tagValue(value: unknown, fallback: string[] = []) {
  return parseTagInput(value, fallback);
}

function tagLabel(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function tagColor(slug: string) {
  const map: Record<string, string> = {
    infused: 'purple',
    candy: 'orange',
    premium: 'green',
    flower: 'green',
    value: 'gray',
    extract: 'blue',
    live: 'blue',
    vape: 'yellow',
    'pre-roll': 'gray'
  };
  return map[slug] ?? 'gray';
}

function statusValue(value: unknown, allowed: string[], fallback: string) {
  const text = stringValue(value);
  return allowed.includes(text) ? text : fallback;
}

function urgencyValue(value: unknown) {
  return statusValue(value, ['watch', 'normal', 'high'], 'normal');
}

function ownership(value: unknown) {
  const text = stringValue(value);
  return ['C', 'OFC', 'UNKNOWN'].includes(text) ? text : 'UNKNOWN';
}

function inventoryStatus(value: unknown) {
  const text = stringValue(value);
  if (['posted', 'held', 'damaged', 'returned', 'in_transit'].includes(text)) return text;
  throw new Error('Inventory status must be posted, held, damaged, returned, or in_transit.');
}

function arrivalStatus(value: unknown, arrivalConfirmed = false) {
  const text = stringValue(value);
  if (['pending', 'arrived', 'cancelled'].includes(text)) return text;
  return arrivalConfirmed ? 'arrived' : 'pending';
}

function batchValidationIssues(row: Record<string, unknown>) {
  const issues: string[] = [];
  if (!stringValue(row.vendorId)) issues.push('Choose a vendor.');
  if (!stringValue(row.name)) issues.push('Enter product name.');
  if (!stringValue(row.category)) issues.push('Enter category.');
  if (Number(row.intakeQty ?? 0) <= 0) issues.push('Enter intake quantity above zero.');
  if (Number(row.unitCost ?? 0) <= 0) issues.push('Enter unit cost above zero.');
  if (Number(row.unitPrice ?? 0) < 0) issues.push('Price cannot be negative.');
  if (stringValue(row.status) === 'ready' && stringValue(row.arrivalStatus) === 'pending' && !Boolean(row.arrivalConfirmed)) issues.push('Confirm arrival or leave row Draft.');
  return issues;
}

function salesLineValidationIssues(row: Record<string, unknown>) {
  const issues: string[] = [];
  if (!stringValue(row.itemName)) issues.push('Enter item name.');
  if (Number(row.qty ?? 0) <= 0) issues.push('Enter quantity above zero.');
  if (Number(row.unitPrice ?? 0) < 0) issues.push('Price cannot be negative.');
  if (!stringValue(row.batchId)) issues.push('Choose exact inventory source row.');
  return issues;
}

async function candidateSourceText(tx: Tx, line: Record<string, unknown>) {
  const raw = stringValue(line.unresolvedSourceText) || stringValue(line.itemName);
  if (!raw) return 'No source candidates found.';
  const terms = raw.split(/\s+/).map((term) => term.trim()).filter(Boolean).slice(0, 4);
  if (!terms.length) return 'No source candidates found.';
  const candidates = await tx
    .select({ batchCode: batches.batchCode, name: batches.name, sourceCode: batches.sourceCode })
    .from(batches)
    .where(
      and(
        eq(batches.status, 'posted'),
        or(
          ...terms.map((term) =>
            or(
              ilike(batches.batchCode, `%${term}%`),
              ilike(batches.sourceCode, `%${term}%`),
              ilike(batches.shorthand, `%${term}%`),
              ilike(batches.name, `%${term}%`),
              ilike(batches.notes, `%${term}%`),
              ilike(batches.legacyMarker, `%${term}%`)
            )
          )
        )
      )
    )
    .limit(5);
  if (!candidates.length) return 'No source candidates found.';
  return `Candidate source rows: ${candidates.map((row: { batchCode: string; name: string; sourceCode?: string | null }) => `${row.batchCode}/${row.sourceCode ?? 'no-code'} ${row.name}`).join('; ')}.`;
}

function paymentImpactPreview(amount: number, allocationIntent: string) {
  if (amount < 0) return 'Buyer credit/down payment; customer balance decreases before invoice allocation.';
  if (allocationIntent === 'selected_invoice') return 'Payment will be ready for selected invoice allocation.';
  if (allocationIntent === 'unapplied') return 'Payment will stay unapplied as buyer credit until allocated.';
  return 'Payment will be available for oldest-open-invoice allocation.';
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function periodValue(value: unknown) {
  const period = requiredString(value, 'period');
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Period must use YYYY-MM format.');
  return period;
}

function routeFromRequest(requestType: string) {
  const text = requestType.toLowerCase();
  if (text.includes('payment')) return 'payments';
  if (text.includes('fulfillment') || text.includes('bag') || text.includes('scan')) return 'fulfillment';
  if (text.includes('intake') || text.includes('vendor')) return 'intake';
  return 'sales';
}

function copyIfPresent(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) target[key] = value;
}
