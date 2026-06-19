/**
 * Vendor Management domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.VM.EXTRACT.
 *
 * NOTE: this module intentionally imports helpers and schemas from
 * `@/server/services/commandBus`. commandBus.ts in turn re-imports the exported
 * vendor management handlers from this module, which creates a circular import.
 * This is safe under ESM because every reference to those imported bindings
 * lives inside a function body — by the time runCommand() invokes a vendor
 * handler, commandBus.ts has fully evaluated and the live bindings are
 * resolved (same pattern as P1.PO.EXTRACT, P1.SAL.EXTRACT, P1.PAY.EXTRACT).
 *
 * Future cleanup (P2+): hoist the shared helpers to @/domains/shared/
 * and remove the cycle entirely.
 */

import { and, eq, ilike, sql } from 'drizzle-orm';

import {
  brands,
  paymentProcessors,
  purchaseOrders,
  vendorBills,
  vendorPayments,
  vendors,
  vendorSupply,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult } from '../../shared/types';

// Helpers, schemas, and the Payload type are kept in commandBus.ts for this
// phase (see header comment).
import {
  assertValidSupplyStatusTransition,
  code,
  dateOrNull,
  ensureTagCatalog,
  moneyScale,
  qtyScale,
  requiredId,
  requiredNumber,
  requiredString,
  stringValue,
  tagValue,
  // Schemas
  createVendorBillPayloadSchema,
  // Types
  type Payload,
} from '@/server/services/commandBus';

// Schemas that live in shared/schemas (imported via commandBus re-exports or
// shared/schemas directly). We import what we need from the original source.
import {
  updateVendorPayloadSchema,
  updateProcessorPayloadSchema,
} from '../../shared/schemas';

// createVendorPayloadSchema is defined locally in commandBus, not shared/schemas.
import {
  createVendorPayloadSchema,
} from '@/server/services/commandBus';

import { recordVendorPayment } from '@/domains/payments';
import { rebuildMatchesForSupply } from '@/domains/matchmaking';

// ─── Private helpers ─────────────────────────────────────────────────────────

function isBlankValue(value: unknown) {
  return value == null || (typeof value === 'string' && !value.trim());
}

function statusValue(value: unknown, allowed: string[], fallback: string) {
  const text = stringValue(value);
  return allowed.includes(text) ? text : fallback;
}

function labelFromToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ─── Exported helpers ────────────────────────────────────────────────────────

/**
 * TER-1585: Ensure a default brand exists for the given vendor.
 *
 * Looks up a brand by vendorId. If none is found, creates one using the
 * vendor's name. Safe to call inside an existing transaction — all writes
 * happen within `tx`.
 *
 * Returns the id of the existing or newly created brand.
 */
export async function ensureVendorBrand(tx: Tx, vendorId: string, vendorName: string): Promise<string> {
  const [existingBrand] = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.vendorId, vendorId))
    .limit(1);
  if (existingBrand) return existingBrand.id;

  const [newBrand] = await tx
    .insert(brands)
    .values({
      name: vendorName.trim(),
      alias: vendorName.trim(),
      vendorId
    })
    .returning({ id: brands.id });
  return newBrand.id;
}

// ─── Vendor Management command handlers ──────────────────────────────────────

export async function createVendor(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  createVendorPayloadSchema.parse(payload);
  const name = requiredString(payload.name, 'name');
  if (name.trim().length < 2) throw new Error('Vendor name must be at least 2 characters.');
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

  // TER-1585 (CMD-VENDOR auto-brand wiring): auto-create a default brand for
  // this vendor if one doesn't already exist. This ensures every vendor has at
  // least one associated brand so intake commands (createBatch) can resolve the
  // correct brand automatically when no explicit brandId is supplied.
  await ensureVendorBrand(tx, vendor.id, vendor.name);

  return { ok: true, commandId, affectedIds: [vendor.id], toast: `${vendor.name} added to vendors.` };
}

export async function createVendorBill(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  createVendorBillPayloadSchema.parse(payload);
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

export async function updateVendorBillStatus(tx: Tx, payload: Payload, status: string, commandId: string, toast: string): Promise<CommandResult> {
  const billId = requiredId(payload.vendorBillId ?? payload.id, 'vendorBillId');
  await tx.update(vendorBills).set({ status, updatedAt: new Date() }).where(eq(vendorBills.id, billId));
  return { ok: true, commandId, affectedIds: [billId], toast };
}

export async function postVendorLedgerPayment(tx: Tx, payload: Payload, transactionDate: Date, commandId: string): Promise<CommandResult> {
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

export async function createVendorSupply(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
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

export async function updateVendorSupply(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
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
  const normalizedNextSupply = values.status != null ? String(values.status) : null;
  if (normalizedNextSupply != null && normalizedNextSupply !== current.status) {
    assertValidSupplyStatusTransition(current.status, normalizedNextSupply);
  }
  await tx.update(vendorSupply).set(values).where(eq(vendorSupply.id, supplyId));
  const matchIds = await rebuildMatchesForSupply(tx, supplyId);
  return { ok: true, commandId, affectedIds: [supplyId, ...matchIds], toast: 'Vendor stock updated.', delta: { matchCount: matchIds.length } };
}

export async function updateVendor(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = updateVendorPayloadSchema.parse(payload);
  const { vendorId } = parsed;

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.name !== undefined) values.name = parsed.name;
  if (parsed.alias !== undefined) values.alias = parsed.alias;
  if (parsed.termsDays !== undefined) values.termsDays = parsed.termsDays;
  if (parsed.consignmentDefault !== undefined) values.consignmentDefault = parsed.consignmentDefault;
  if (parsed.contact !== undefined) values.contact = parsed.contact;
  if (parsed.notes !== undefined) values.notes = parsed.notes;

  const result = await tx
    .update(vendors)
    .set(values)
    .where(eq(vendors.id, vendorId))
    .returning({ id: vendors.id });
  if (result.length === 0) throw new Error('Vendor not found.');
  return { ok: true, commandId, affectedIds: [vendorId], toast: 'Vendor updated.' };
}

export async function updateProcessor(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = updateProcessorPayloadSchema.parse(payload);
  const { processorId } = parsed;

  // Numeric fields are stored as strings (numeric(p,s)); preserve that contract.
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.name !== undefined) values.name = parsed.name;
  if (parsed.processorType !== undefined) values.processorType = parsed.processorType;
  if (parsed.feeType !== undefined) values.feeType = parsed.feeType;
  if (parsed.feePercentage !== undefined) values.feePercentage = parsed.feePercentage.toString();
  if (parsed.feeFixedAmount !== undefined) values.feeFixedAmount = parsed.feeFixedAmount.toString();
  if (parsed.defaultUserSplit !== undefined) values.defaultUserSplit = parsed.defaultUserSplit.toString();
  if (parsed.defaultProcessorSplit !== undefined) values.defaultProcessorSplit = parsed.defaultProcessorSplit.toString();
  if (parsed.notes !== undefined) values.notes = parsed.notes;
  if (parsed.active !== undefined) values.active = parsed.active;

  const result = await tx
    .update(paymentProcessors)
    .set(values)
    .where(eq(paymentProcessors.id, processorId))
    .returning({ id: paymentProcessors.id });
  if (result.length === 0) throw new Error('Processor not found.');
  return { ok: true, commandId, affectedIds: [processorId], toast: 'Processor updated.' };
}
