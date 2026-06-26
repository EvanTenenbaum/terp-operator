/**
 * Sales Orders domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.SAL.EXTRACT.
 *
 * NOTE: this module intentionally imports a number of helpers, schemas, and
 * sales-related utilities from `@/server/services/commandBus`. commandBus.ts
 * in turn re-imports the 15 sales command handlers from this module, which
 * creates a circular import. This is safe under ESM because every reference
 * to those imported bindings lives inside a function body — by the time
 * runCommand() invokes a sales handler, commandBus.ts has fully evaluated and
 * the live bindings are resolved (same pattern as P1.PO.EXTRACT and
 * P1.PAY.EXTRACT).
 *
 * Future cleanup (P2+): hoist the shared helpers to `@/domains/shared/...`
 * and remove the cycle entirely.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import {
  batches,
  clientLedgerEntries,
  correctionJournalEntries,
  customers,
  fulfillmentLines,
  inventoryMovements,
  invoices,
  salesOrderLines,
  salesOrders,
  systemSettings,
  vendorBills,
  vendors,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult, SessionUser } from '../../shared/types';
import { parsePriceRange } from '../../shared/priceRange';
import {
  validateLandedCost,
  validateBelowFloorChoice,
  computeOrderExceptionTotals,
  BELOW_FLOOR_REASONS,
  type BelowFloorReason,
  type VendorApprovalState,
  type ExceptionLine,
} from '../../shared/saleLineCostExceptions';

import {
  applyPricingRule,
  asCustomerPricingRule,
  evaluatePrice,
  resolvePricingProfile,
  resolvePricingRuleEntry,
} from '@/server/services/pricing';

// setLineLandedCost validates against this schema; it lives in
// shared/schemas so the same shape is used by the dedicated unit tests
// (src/tests/pricingSchemas.test.ts).
import { setLineLandedCostPayloadSchema } from '../../shared/schemas';

import {
  createSalesOrderPayloadSchema,
  updateSalesOrderLinePayloadSchema,
} from './schemas';

// Helpers, schemas, the Payload type, and sales-utility helpers are kept in
// commandBus.ts for this phase (see header comment).
import {
  // Schemas
  cancelSalesOrderPayloadSchema,
  postSalesOrderPayloadSchema,
  setDeliveryWindowPayloadSchema,
  // Money / id helpers
  addMoney,
  code,
  copyIfPresent,
  moneyScale,
  oneWeek,
  qtyScale,
  requiredId,
  requiredNumber,
  requiredString,
  stringValue,
  // Sales-specific helpers
  assertPeriodUnlocked,
  assertSalesOrderEditableById,
  buildPricingSnapshot,
  candidateSourceText,
  loadCategoriesForLines,
  loadDefaultPricingRule,
  recalcOrder,
  refreshOrderExceptionRollup,
  resolveItemAlias,
  salesLineValidationIssues,
  validatePricingRulePayload,
  // Types
  type Payload,
} from '@/server/services/commandBus';

// Referee credit accrual lives in its own module; safe to import directly.
import { accrueRefereeCredit } from '@/server/services/refereeCommands';

// Credit-engine recompute lives in its own module; safe to import directly.
import { enqueueCustomerRecompute } from '@/server/services/creditEngine';

import { logger } from '@/server/services/logger';

export async function createSalesOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  createSalesOrderPayloadSchema.parse(payload);
  const customerId = requiredId(payload.customerId, 'customerId');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  const [order] = await tx.insert(salesOrders).values({ orderNo: code('SO'), customerId, status: 'draft', notes: stringValue(payload.notes) || null, validationIssues: [] }).returning();
  return { ok: true, commandId, affectedIds: [order.id], toast: `${order.orderNo} created for ${customer.name}.` };
}

export async function addSalesOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const batchId = stringValue(payload.batchId);
  const qty = requiredNumber(payload.qty ?? 1, 'qty');
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  if (!['draft', 'confirmed'].includes(order.status)) throw new Error('Only draft or confirmed orders can be edited.');
  const unresolvedSourceText = stringValue(payload.unresolvedSourceText ?? payload.itemName ?? payload.sourceRowKey);
  const [batch] = batchId ? await tx.select().from(batches).where(eq(batches.id, requiredId(batchId, 'batchId'))).limit(1) : [];
  if (batchId && (!batch || batch.status !== 'posted')) throw new Error('Selected batch is not available for sale.');
  // TER-1634: Soft reservation guard — subtract draft-held qty from other orders
  // so two operators building concurrent drafts see reduced visible availability.
  // NOTE (GH #249): This guard shifts but does NOT close the TOCTOU race window.
  // The hard close is at reserveInventoryForOrder (FOR UPDATE row-lock on batch).
  if (batch) {
    const draftMap = await getDraftReservedQtyMap(tx, [batch.id], orderId);
    const draftReservedQty = draftMap[batch.id] ?? 0;
    if (Number(batch.availableQty) - Number(batch.reservedQty) - draftReservedQty < qty) {
      throw new Error(`${batch.name} does not have enough available quantity.`);
    }
  }
  const itemName = batch?.name || stringValue(payload.itemName) || unresolvedSourceText;
  if (!itemName) throw new Error('Item name or source text is required for a draft sale line.');
  const unitPrice = payload.unitPrice != null ? requiredNumber(payload.unitPrice, 'unitPrice') : Number(batch?.unitPrice ?? 0);
  const validationIssues = salesLineValidationIssues({ ...payload, batchId: batch?.id ?? null, itemName, qty, unitPrice });
  const displayName = batch?.itemId ? (await resolveItemAlias(tx, batch.itemId)) ?? itemName : itemName;
  let lineUnitCost = 0;
  let unitCostResolved = true;
  let landedCostBasisInsert: string | null = null;
  let priceFloorInsert: string | null = null;
  if (batch) {
    const range = batch.priceRange ? parsePriceRange(batch.priceRange) : null;
    if (range) {
      validationIssues.push(`Pick landed COGS in $${range.low}-$${range.high}.`);
      lineUnitCost = (range.low + range.high) / 2;
      unitCostResolved = false;
      landedCostBasisInsert = null;
      priceFloorInsert = null;
    } else {
      const landedCost = Number(batch.unitCost ?? 0);
      lineUnitCost = landedCost;
      unitCostResolved = true;
      landedCostBasisInsert = 'fixed';
      priceFloorInsert = landedCost > 0 ? moneyScale(landedCost) : null;
    }
  }
  const [line] = await tx
    .insert(salesOrderLines)
    .values({
      orderId,
      batchId: batch?.id ?? null,
      itemName,
      displayName,
      qty: qtyScale(qty),
      unitPrice: moneyScale(unitPrice),
      unitCost: moneyScale(lineUnitCost),
      unitCostResolved,
      landedCostBasis: landedCostBasisInsert,
      priceFloor: priceFloorInsert,
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

export async function updateSalesOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  updateSalesOrderLinePayloadSchema.parse(payload);
  if (!payload.lineId && !payload.id && payload.orderId) {
    const orderId = requiredId(payload.orderId, 'orderId');
    await assertSalesOrderEditableById(tx, orderId);
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
  await assertSalesOrderEditableById(tx, line.orderId);
  const values: Record<string, unknown> = { updatedAt: new Date() };
  // Issue #64 reviewer fix: when batchId changes, re-run the same
  // COGS / priceFloor / landedCostBasis setup as addSalesOrderLine so a
  // fixed→range swap re-opens the unresolved gate and a range→fixed swap
  // closes it. Previously the swap kept the prior unitCostResolved /
  // landedCostBasis / priceFloor, which silently bypassed the gate.
  const issuesAccumulator: string[] = [];
  let batchChanged = false;
  if (payload.batchId != null) {
    const batchId = stringValue(payload.batchId);
    if (batchId) {
      const [batch] = await tx.select().from(batches).where(eq(batches.id, requiredId(batchId, 'batchId'))).limit(1);
      if (!batch || batch.status !== 'posted') throw new Error('Selected batch is not available for sale.');
      values.batchId = batch.id;
      values.itemName = batch.name;
      values.displayName = batch.itemId ? (await resolveItemAlias(tx, batch.itemId)) ?? batch.name : batch.name;
      values.sourceRowKey = stringValue(payload.sourceRowKey) || batch.batchCode;
      values.unresolvedSourceText = null;
      // Range/fixed setup parity with addSalesOrderLine.
      const range = batch.priceRange ? parsePriceRange(batch.priceRange) : null;
      if (range) {
        issuesAccumulator.push(`Pick landed COGS in $${range.low}-$${range.high}.`);
        values.unitCost = moneyScale((range.low + range.high) / 2);
        values.unitCostResolved = false;
        values.landedCostBasis = null;
        values.priceFloor = null;
      } else {
        const landedCost = Number(batch.unitCost ?? 0);
        values.unitCost = moneyScale(landedCost);
        values.unitCostResolved = true;
        values.landedCostBasis = 'fixed';
        values.priceFloor = landedCost > 0 ? moneyScale(landedCost) : null;
      }
      // Clear any prior landed cost override reason — it does not carry across
      // to a different batch.
      values.landedCostReason = null;
      // Clear below-floor / vendor-approval state since the floor/cost basis
      // changed under the line; the operator re-establishes them deliberately.
      values.belowFloorReason = null;
      values.belowFloorNote = null;
      values.vendorApprovalState = 'none';
      batchChanged = true;
    } else {
      values.batchId = null;
      values.unitCostResolved = true;
      values.landedCostBasis = 'fixed';
      values.priceFloor = null;
    }
  }
  copyIfPresent(values, 'itemName', payload.itemName);
  if (payload.qty != null) values.qty = qtyScale(payload.qty);
  // TER-1634: Latent gap fix — updateSalesOrderLine previously had no availability
  // re-check when qty was increased.  A qty increase on a draft line backed by a
  // batch must pass the same guard as addSalesOrderLine.
  //
  // NOTE (GH #249): Same soft-guard limitation applies — the hard close is at
  // reserveInventoryForOrder (FOR UPDATE row-lock on batch row).
  if (payload.qty != null) {
    const effectiveBatchId = (values.batchId as string | null | undefined) ?? line.batchId;
    if (effectiveBatchId) {
      const [guardBatch] = await tx.select().from(batches).where(eq(batches.id, effectiveBatchId)).limit(1);
      if (guardBatch) {
        const draftMap = await getDraftReservedQtyMap(tx, [effectiveBatchId], line.orderId);
        const draftReservedQty = draftMap[effectiveBatchId] ?? 0;
        const newQty = requiredNumber(payload.qty, 'qty');
        if (Number(guardBatch.availableQty) - Number(guardBatch.reservedQty) - draftReservedQty < newQty) {
          throw new Error(`${guardBatch.name} does not have enough available quantity.`);
        }
      }
    }
  }
  if (payload.unitPrice != null) values.unitPrice = moneyScale(payload.unitPrice);
  if (payload.status != null) values.status = stringValue(payload.status);
  if (payload.sourceRowKey != null) values.sourceRowKey = stringValue(payload.sourceRowKey) || null;
  if (payload.unresolvedSourceText != null) values.unresolvedSourceText = stringValue(payload.unresolvedSourceText) || null;
  if (payload.legacyStatusMarker != null) values.legacyStatusMarker = stringValue(payload.legacyStatusMarker) || null;
  if (payload.packed != null) values.packed = Boolean(payload.packed);
  if (payload.inventoryPosted != null) values.inventoryPosted = Boolean(payload.inventoryPosted);
  if (payload.paymentFollowup != null) values.paymentFollowup = Boolean(payload.paymentFollowup);
  const nextLine = { ...line, ...values } as Record<string, unknown>;
  const baseIssues = salesLineValidationIssues(nextLine);
  const validationIssues = batchChanged ? [...baseIssues, ...issuesAccumulator] : baseIssues;
  values.validationIssues = validationIssues;
  if (validationIssues.length && (payload.status === 'ready' || payload.status === 'confirmed')) values.status = 'needs_fix';
  if (batchChanged && validationIssues.some((issue: string) => issue.startsWith('Pick landed COGS'))) {
    values.status = 'needs_fix';
  }
  // CAP-030 (TER-1494): If this sales line is already released for picking and the qty is
  // changing, push a qty_changed warehouse alert so the warehouse can reconcile the bag.
  // Other field edits (unit_price, display_name, notes, etc.) on a released line do NOT
  // fire alerts — only qty.
  if (line.pickReleasedAt && payload.qty != null) {
    const fromQty = Number(line.qty);
    const toQty = Number(qtyScale(payload.qty));
    if (toQty !== fromQty) {
      const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.orderLineId, lineId)).limit(1);
      if (fl) {
        const alerts = Array.isArray(fl.warehouseAlerts) ? [...(fl.warehouseAlerts as Array<Record<string, unknown>>)] : [];
        alerts.push({ kind: 'qty_changed', from: fromQty, to: toQty, at: new Date().toISOString(), actor: 'sales' });
        await tx.update(fulfillmentLines)
          .set({ warehouseAlerts: alerts, statusExtended: 'recall_pending', updatedAt: new Date() })
          .where(eq(fulfillmentLines.id, fl.id));
      }
    }
  }
  await tx.update(salesOrderLines).set(values).where(eq(salesOrderLines.id, lineId));
  await recalcOrder(tx, line.orderId);
  return { ok: true, commandId, affectedIds: [line.orderId, lineId], toast: 'Sales line updated.' };
}

export async function removeSalesOrderLine(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const [line] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Sales line not found.');
  // CAP-030 (TER-1494): If the line is released for picking, do NOT delete it — the fulfillment
  // line has a cascade FK back to this sales line and must be kept for warehouse reconciliation.
  // Push a line_cancelled alert and clear pick_released_at so the line is no longer in the
  // pick queue while still preserving the audit trail.
  if (line.pickReleasedAt) {
    const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.orderLineId, lineId)).limit(1);
    if (fl) {
      const alerts = Array.isArray(fl.warehouseAlerts) ? [...(fl.warehouseAlerts as Array<Record<string, unknown>>)] : [];
      alerts.push({ kind: 'line_cancelled', at: new Date().toISOString(), actor: 'sales' });
      await tx.update(fulfillmentLines)
        .set({ warehouseAlerts: alerts, statusExtended: 'recall_pending', updatedAt: new Date() })
        .where(eq(fulfillmentLines.id, fl.id));
    }
    await tx.update(salesOrderLines)
      .set({ pickReleasedAt: null, updatedAt: new Date() })
      .where(eq(salesOrderLines.id, lineId));
    await recalcOrder(tx, line.orderId);
    return {
      ok: true,
      commandId,
      affectedIds: [line.orderId, lineId, ...(fl ? [fl.id] : [])],
      toast: 'Sales line removed. Warehouse alerted for reconciliation.',
      orderId: line.orderId
    };
  }
  await tx.delete(salesOrderLines).where(eq(salesOrderLines.id, lineId));
  await recalcOrder(tx, line.orderId);
  return { ok: true, commandId, affectedIds: [line.orderId, lineId], toast: 'Sales line removed.', orderId: line.orderId };
}

export async function reserveInventoryForOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) throw new Error('Order needs at least one line before reserving inventory.');
  const affected = [orderId];
  for (const line of lines) {
    if (!line.batchId || line.status === 'reserved') continue;
    // Lock batch row to prevent concurrent reservation double-booking (GH #18A).
    // Two callers reserving the same batch would otherwise both read the same
    // reservedQty, both pass the availability check, and both increment.
    // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
    // columns must be read via bracket notation — camelCase access would
    // silently produce `undefined` → NaN → corrupt reserved/available qty.
    const batchRows = await tx.execute(
      sql`SELECT * FROM ${batches} WHERE ${batches.id} = ${line.batchId} FOR UPDATE`
    );
    const batch = batchRows.rows[0];
    if (!batch) throw new Error(`${line.itemName} batch no longer exists.`);
    if (Number(batch['available_qty']) - Number(batch['reserved_qty']) < Number(line.qty)) throw new Error(`${line.itemName} is short on available quantity.`);
    await tx.update(batches).set({ reservedQty: qtyScale(Number(batch['reserved_qty']) + Number(line.qty)), updatedAt: new Date() }).where(eq(batches.id, batch.id as string));
    await tx.update(salesOrderLines).set({ status: 'reserved', updatedAt: new Date() }).where(eq(salesOrderLines.id, line.id));
    affected.push(batch.id as string, line.id);
  }
  return { ok: true, commandId, affectedIds: affected, toast: 'Inventory reserved for order.' };
}

export async function priceSalesOrder(tx: Tx, payload: Payload, commandId: string, toast = 'Sales order priced.'): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  const strategy = stringValue(payload.strategy) || 'standard';
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  const [customer] = order.customerId ? await tx.select().from(customers).where(eq(customers.id, order.customerId)).limit(1) : [];
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));

  if (strategy === 'customer-rule') {
    const unresolved = lines.find((line: typeof salesOrderLines.$inferSelect) => !line.unitCostResolved);
    if (unresolved) throw new Error(`${unresolved.itemName} has unresolved landed COGS. Resolve every range-priced line before applying the customer pricing rule.`);
    const customerRule = asCustomerPricingRule(customer?.pricingRule ?? null);
    const defaultsRule = await loadDefaultPricingRule(tx);
    const categoryByBatch = await loadCategoriesForLines(tx, lines);
    const guardrailProfile = resolvePricingProfile('standard', customer?.tags ?? []);
    const ruleAppliedLines: Array<Record<string, unknown>> = [];
    for (const line of lines) {
      const category = line.batchId ? categoryByBatch.get(String(line.batchId)) : undefined;
      const rule = resolvePricingRuleEntry(customerRule, defaultsRule, category);
      const unitCost = Number(line.unitCost);
      const candidate = applyPricingRule(unitCost, rule);
      const evaluated = evaluatePrice({
        unitCost,
        basisUnitPrice: candidate,
        candidateUnitPrice: candidate,
        profile: guardrailProfile
      });
      await tx.update(salesOrderLines).set({ unitPrice: moneyScale(evaluated.unitPrice), updatedAt: new Date() }).where(eq(salesOrderLines.id, line.id));
      ruleAppliedLines.push({
        lineId: line.id,
        itemName: line.itemName,
        ruleSource: rule.source,
        unitPrice: moneyScale(evaluated.unitPrice),
        candidateUnitPrice: moneyScale(candidate),
        guardrails: evaluated.guardrails,
        guardrailAdjusted: evaluated.adjusted,
        minimumUnitPrice: moneyScale(evaluated.minimumUnitPrice)
      });
    }
    await recalcOrder(tx, orderId, strategy);
    const guardrailLifts = ruleAppliedLines.filter((entry) => entry.guardrailAdjusted).length;
    return {
      ok: true,
      commandId,
      affectedIds: [orderId, ...lines.map((line: typeof salesOrderLines.$inferSelect) => line.id)],
      toast: guardrailLifts
        ? `${toast} Customer pricing rule applied to ${ruleAppliedLines.length} line(s). ${guardrailLifts} lifted to guardrails.`
        : `${toast} Customer pricing rule applied to ${ruleAppliedLines.length} line(s).`,
      delta: { strategy, ruleAppliedLines, pricingProfile: guardrailProfile }
    };
  }

  const multiplier = strategy === 'premium' ? 1.08 : strategy === 'clearance' ? 0.92 : 1;
  const profile = resolvePricingProfile(strategy, customer?.tags ?? []);
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

export async function setLineLandedCost(
  tx: Tx,
  payload: Payload,
  user: SessionUser,
  commandId: string
): Promise<CommandResult> {
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const landedCost = requiredNumber(payload.landedCost, 'landedCost');
  if (landedCost < 0) throw new Error('Landed cost must be a non-negative number.');
  const basisIn = (stringValue(payload.basis) || 'manual') as
    | 'fixed' | 'pick-low' | 'pick-mid' | 'pick-high' | 'manual' | 'override';
  const reason = stringValue(payload.reason) || null;

  if (!['manual', 'pick-low', 'pick-mid', 'pick-high', 'override'].includes(basisIn)) {
    throw new Error(
      `Invalid landed cost basis: ${basisIn}. Allowed: manual, pick-low, pick-mid, pick-high, override.`
    );
  }

  const fullParse = setLineLandedCostPayloadSchema.safeParse({ ...payload, basis: basisIn });
  if (!fullParse.success) {
    const detail = fullParse.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Invalid setLineLandedCost payload: ${detail}`);
  }
  const exceptionReason = fullParse.data.exceptionReason;
  const exceptionNote = fullParse.data.exceptionNote;

  const [line] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Sales line not found.');
  await assertSalesOrderEditableById(tx, line.orderId);
  if (!line.batchId) throw new Error('Cannot set landed COGS on a line without a source batch.');
  const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
  if (!batch) throw new Error('Source batch no longer exists.');
  const range = parsePriceRange(batch.priceRange);
  let basisRecord: string = basisIn;
  if (range) {
    const validation = validateLandedCost({
      landedCost,
      range,
      basis: basisIn,
      role: user.role,
      reason,
      exceptionReason
    });
    if (!validation.ok) throw new Error(validation.error);
    basisRecord = validation.basisRecord;
  } else {
    // Preserve old no-range behavior: accept manual/pick-* basis values
    if (!['manual', 'pick-low', 'pick-mid', 'pick-high'].includes(basisIn)) {
      throw new Error(`Invalid landed cost basis: ${basisIn}. Allowed: manual, pick-low, pick-mid, pick-high.`);
    }
  }

  const remainingIssues = (line.validationIssues || []).filter(
    (issue: string) => !issue.startsWith('Pick landed COGS')
  );

  await tx
    .update(salesOrderLines)
    .set({
      unitCost: moneyScale(landedCost),
      unitCostResolved: true,
      landedCostBasis: basisRecord,
      landedCostReason: basisRecord === 'override' ? reason : null,
      priceFloor: moneyScale(landedCost),
      validationIssues: remainingIssues,
      status: line.status === 'needs_fix' && remainingIssues.length === 0 ? 'draft' : line.status,
      updatedAt: new Date()
    })
    .where(eq(salesOrderLines.id, lineId));

  await recalcOrder(tx, line.orderId);

  const delta: Record<string, unknown> = { lineId, landedCost: moneyScale(landedCost), basis: basisRecord, reason };
  if (exceptionReason) {
    delta.exceptionReason = exceptionReason;
    if (exceptionNote) delta.exceptionNote = exceptionNote;
  }
  const toastSuffix = exceptionReason ? ` (below-range: ${exceptionReason})` : '';

  return {
    ok: true,
    commandId,
    affectedIds: [line.orderId, lineId],
    toast: `Landed COGS $${landedCost.toFixed(2)} set for ${line.itemName}.${toastSuffix}`,
    delta
  };
}

export async function setLineBelowFloorReason(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const lineId = requiredId(payload.lineId ?? payload.id, 'lineId');
  const reasonIn = stringValue(payload.reason);
  if (!reasonIn) {
    throw new Error(`Below-floor reason is required. Allowed: ${BELOW_FLOOR_REASONS.join(', ')}.`);
  }
  if (!(BELOW_FLOOR_REASONS as readonly string[]).includes(reasonIn)) {
    throw new Error(`Below-floor reason must be one of: ${BELOW_FLOOR_REASONS.join(', ')}.`);
  }
  const reason = reasonIn as BelowFloorReason;
  const note = stringValue(payload.note) || null;

  const [line] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId)).limit(1);
  if (!line) throw new Error('Sales line not found.');
  await assertSalesOrderEditableById(tx, line.orderId);

  const check = validateBelowFloorChoice({
    unitPrice: Number(line.unitPrice),
    priceFloor: line.priceFloor != null ? Number(line.priceFloor) : null,
    reason
  });
  if (!check.ok) throw new Error(check.error);

  const nextVendorApprovalState: VendorApprovalState = check.requiresVendorApproval ? 'pending' : 'none';

  await tx
    .update(salesOrderLines)
    .set({
      belowFloorReason: reason,
      belowFloorNote: note,
      vendorApprovalState: nextVendorApprovalState,
      updatedAt: new Date()
    })
    .where(eq(salesOrderLines.id, lineId));

  await refreshOrderExceptionRollup(tx, line.orderId);

  return {
    ok: true,
    commandId,
    affectedIds: [line.orderId, lineId],
    toast: `Below-floor reason "${reason}" recorded for ${line.itemName}.`,
    delta: { lineId, reason, vendorApprovalState: nextVendorApprovalState }
  };
}

export async function resolveVendorApproval(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const stateIn = stringValue(payload.state);
  if (stateIn !== 'approved' && stateIn !== 'declined') {
    throw new Error('Vendor approval state must be approved or declined.');
  }
  const lineId = payload.lineId ? requiredId(payload.lineId, 'lineId') : undefined;
  let orderId = stringValue(payload.orderId);

  if (lineId) {
    const [line] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId)).limit(1);
    if (!line) throw new Error('Sales line not found.');
    if (line.vendorApprovalState !== 'pending') {
      throw new Error('Sales line is not awaiting vendor approval.');
    }
    await assertSalesOrderEditableById(tx, line.orderId);
    await tx
      .update(salesOrderLines)
      .set({ vendorApprovalState: stateIn, updatedAt: new Date() })
      .where(eq(salesOrderLines.id, lineId));
    orderId = line.orderId;
  } else {
    if (!orderId) throw new Error('Provide lineId or orderId to resolve vendor approval.');
    await assertSalesOrderEditableById(tx, orderId);
    const pendingLines = await tx
      .select()
      .from(salesOrderLines)
      .where(and(eq(salesOrderLines.orderId, orderId), eq(salesOrderLines.vendorApprovalState, 'pending')));
    if (pendingLines.length === 0) {
      throw new Error('No sales lines are awaiting vendor approval on this order.');
    }
    for (const line of pendingLines) {
      await tx
        .update(salesOrderLines)
        .set({ vendorApprovalState: stateIn, updatedAt: new Date() })
        .where(eq(salesOrderLines.id, line.id));
    }
  }

  await refreshOrderExceptionRollup(tx, orderId);

  return {
    ok: true,
    commandId,
    affectedIds: [orderId, ...(lineId ? [lineId] : [])],
    toast: `Vendor approval ${stateIn}.`
  };
}

export async function setCustomerPricingRule(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const pricingRule = validatePricingRulePayload(payload.pricingRule);
  const [existing] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!existing) throw new Error('Customer not found.');
  await tx
    .update(customers)
    .set({ pricingRule, updatedAt: new Date() })
    .where(eq(customers.id, customerId));
  return {
    ok: true,
    commandId,
    affectedIds: [customerId],
    toast: 'Customer pricing rule updated (internal only).',
    delta: { customerId, pricingRule, priorPricingRule: existing.pricingRule }
  };
}

export async function setDefaultPricingRule(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const pricingRule = validatePricingRulePayload(payload.pricingRule);
  const [existing] = await tx.select().from(systemSettings).where(eq(systemSettings.key, 'pricing.defaults')).limit(1);
  let affectedId: string;
  if (existing) {
    await tx
      .update(systemSettings)
      .set({ value: pricingRule, updatedAt: new Date() })
      .where(eq(systemSettings.key, 'pricing.defaults'));
    affectedId = existing.id;
  } else {
    const inserted = await tx
      .insert(systemSettings)
      .values({ key: 'pricing.defaults', value: pricingRule })
      .returning();
    affectedId = inserted[0]?.id ?? 'pricing.defaults';
  }
  return {
    ok: true,
    commandId,
    affectedIds: [affectedId],
    toast: 'Default pricing rule updated (internal only).',
    delta: { key: 'pricing.defaults', pricingRule, priorPricingRule: existing?.value ?? null }
  };
}

export async function confirmSalesOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const orderId = requiredId(payload.orderId, 'orderId');
  await recalcOrder(tx, orderId);
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) throw new Error('Order needs at least one line.');
  const unresolved = lines.find((line: typeof salesOrderLines.$inferSelect) => salesLineValidationIssues(line).length);
  if (unresolved) throw new Error(`${unresolved.itemName} needs resolution before confirming: ${salesLineValidationIssues(unresolved).join(' ')} ${await candidateSourceText(tx, unresolved)}`);
  const unresolvedCogs = lines.find((line: typeof salesOrderLines.$inferSelect) => !line.unitCostResolved);
  if (unresolvedCogs) throw new Error(`${unresolvedCogs.itemName} has unresolved landed COGS. Resolve the COGS range before confirming the order.`);
  // TER-1659: vendor_approval and below_floor_reason_missing exceptions are no
  // longer hard blockers. Below-floor lines surface as advisory warnings; the
  // operator may still confirm the order.
  if (!order.customerId) throw new Error('Customer not found.');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  const warnings: string[] = [];
  // TER-1659: credit limit is advisory; do not block confirmation.
  if (Number(customer.balance) + Number(order.total) > Number(customer.creditLimit)) {
    warnings.push(
      `⚠️ Customer ${customer.name} will exceed credit limit ($${Number(customer.creditLimit).toFixed(2)}) after this order. Balance: $${Number(customer.balance).toFixed(2)}, Order total: $${Number(order.total).toFixed(2)}.`
    );
  }
  const pricingSnapshot = buildPricingSnapshot(lines, order.pricingStrategy, customer.tags);
  // TER-1659: below-floor lines are advisory warnings, not blockers.
  for (const line of lines) {
    if (line.priceFloor != null && Number(line.unitPrice) < Number(line.priceFloor)) {
      warnings.push(
        `⚠️ ${line.itemName} is priced below the floor price of $${Number(line.priceFloor).toFixed(2)} (line price: $${Number(line.unitPrice).toFixed(2)}).`
      );
    }
  }
  // G-10: Persist referee relationship on the order at confirm time so
  // postSalesOrder can accrue the credit without the payload thread.
  await tx.update(salesOrders).set({
    status: 'confirmed',
    updatedAt: new Date(),
    ...(payload.refereeRelationshipId ? { refereeRelationshipId: String(payload.refereeRelationshipId) } : {})
  }).where(eq(salesOrders.id, orderId));
  // TER-1675: enqueueCustomerRecompute is best-effort. A missing/broken
  // credit_recompute_queue table (e.g. unrun migration) must not block
  // order confirmation or roll back the transaction.
  try {
    await enqueueCustomerRecompute(tx, order.customerId, 'event:confirmSalesOrder', commandId);
  } catch (err) {
    logger.warn(`[confirmSalesOrder] credit recompute enqueue failed for customer ${order.customerId} (non-fatal):`, { error: String(err) });
  }
  return {
    ok: true,
    commandId,
    affectedIds: [orderId],
    toast: `${order.orderNo} confirmed.`,
    delta: { pricingSnapshot },
    ...(warnings.length ? { warnings } : {})
  };
}

export async function cancelSalesOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  cancelSalesOrderPayloadSchema.parse(payload);
  const orderId = requiredId(payload.orderId, 'orderId');
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  // CAP-030 (TER-1494): Block cancellation if any released line has been picked
  // (actual_qty > 0 and the fulfillment line is not already cancelled). Operators
  // must call returnPickedUnits / cancelFulfillmentLine first to reconcile inventory.
  for (const line of lines) {
    if (!line.pickReleasedAt) continue;
    const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.orderLineId, line.id)).limit(1);
    if (fl && Number(fl.actualQty) > 0 && fl.statusExtended !== 'cancelled') {
      throw new Error(
        `Cannot cancel: ${line.itemName || 'a line'} has already been picked (${fl.actualQty} units). Return picked units before cancelling.`
      );
    }
  }
  // CAP-030 (TER-1494): For each released line that has not been picked, push a
  // line_cancelled warehouse alert so the warehouse pulls its bag.
  for (const line of lines) {
    if (!line.pickReleasedAt) continue;
    const [fl] = await tx.select().from(fulfillmentLines).where(eq(fulfillmentLines.orderLineId, line.id)).limit(1);
    if (fl && fl.statusExtended !== 'cancelled') {
      const alerts = Array.isArray(fl.warehouseAlerts) ? [...(fl.warehouseAlerts as Array<Record<string, unknown>>)] : [];
      alerts.push({ kind: 'line_cancelled', at: new Date().toISOString(), actor: 'sales' });
      await tx.update(fulfillmentLines)
        .set({ warehouseAlerts: alerts, statusExtended: 'recall_pending', updatedAt: new Date() })
        .where(eq(fulfillmentLines.id, fl.id));
    }
  }
  // GH #287: Release reservedQty for ALL lines that have a batchId, regardless
  // of line.status. Previously only 'reserved' status lines were processed, which
  // left inventory locked when lines had advanced to 'allocated' or other
  // statuses after reserveInventoryForOrder ran. Picked lines are already blocked
  // above (actualQty > 0 guard), so every remaining batchId line holds a
  // real reservation that must be returned to the pool on cancellation.
  for (const line of lines) {
    if (!line.batchId) continue;
    const [batch] = await tx.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
    if (batch) await tx.update(batches).set({ reservedQty: qtyScale(Math.max(0, Number(batch.reservedQty) - Number(line.qty))), updatedAt: new Date() }).where(eq(batches.id, batch.id));
  }
  await tx.update(salesOrders).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(salesOrders.id, orderId));
  return { ok: true, commandId, affectedIds: [orderId, ...lines.map((line: typeof salesOrderLines.$inferSelect) => line.id)], toast: 'Sales order cancelled and reservations released.' };
}

export async function postSalesOrder(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  postSalesOrderPayloadSchema.parse(payload);
  const orderId = requiredId(payload.orderId, 'orderId');
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!order) throw new Error('Sales order not found.');
  if (order.status === 'posted') throw new Error(`${order.orderNo} is already posted.`);
  if (order.status !== 'confirmed') throw new Error(`${order.orderNo} must be confirmed before posting.`);
  const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId));
  if (!lines.length) throw new Error('Order needs lines before posting.');
  const unresolved = lines.find((line: typeof salesOrderLines.$inferSelect) => salesLineValidationIssues(line).length);
  if (unresolved) throw new Error(`${unresolved.itemName} needs resolution before posting: ${salesLineValidationIssues(unresolved).join(' ')} ${await candidateSourceText(tx, unresolved)}`);
  const unresolvedCogs = lines.find((line: typeof salesOrderLines.$inferSelect) => !line.unitCostResolved);
  if (unresolvedCogs) throw new Error(`${unresolvedCogs.itemName} has unresolved landed COGS. Resolve the COGS range before posting the order.`);
  // TER-1659: vendor_approval and below_floor_reason_missing exceptions are no
  // longer hard blockers. Below-floor lines surface as advisory warnings; the
  // operator may still post the order.
  const warnings: string[] = [];
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

  // Lock customer row to prevent concurrent balance update races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // columns like `credit_limit` must be read via bracket notation — camelCase
  // access would silently produce `undefined` → NaN credit check.
  const customerRows = await tx.execute(
    sql`SELECT * FROM ${customers} WHERE ${customers.id} = ${freshOrder.customerId} FOR UPDATE`
  );
  const customer = customerRows.rows[0];
  if (!customer) throw new Error('Customer not found.');
  // TER-1659: credit limit is advisory; do not block posting.
  if (Number(customer.balance) + Number(freshOrder.total) > Number(customer['credit_limit'])) {
    warnings.push(
      `⚠️ Customer ${customer.name} will exceed credit limit ($${Number(customer['credit_limit']).toFixed(2)}) after this order. Balance: $${Number(customer.balance).toFixed(2)}, Order total: $${Number(freshOrder.total).toFixed(2)}.`
    );
  }
  // TER-1659: below-floor lines are advisory warnings, not blockers.
  for (const line of lines) {
    if (line.priceFloor != null && Number(line.unitPrice) < Number(line.priceFloor)) {
      warnings.push(
        `⚠️ ${line.itemName} is priced below the floor price of $${Number(line.priceFloor).toFixed(2)} (line price: $${Number(line.unitPrice).toFixed(2)}).`
      );
    }
  }

  const affected = [orderId];
  for (const line of lines) {
    // Lock batch row to prevent concurrent quantity update races.
    // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
    // columns like `available_qty`, `reserved_qty`, `ownership_status`,
    // `vendor_id`, and `unit_cost` must be read via bracket notation —
    // camelCase access would silently produce `undefined` → NaN writes to
    // inventory and vendor bills.
    const batchRows = await tx.execute(
      sql`SELECT * FROM ${batches} WHERE ${batches.id} = ${line.batchId} FOR UPDATE`
    );
    const batch = batchRows.rows[0];
    const batchVendorId = batch['vendor_id'] as string | null | undefined;
    const nextAvailable = Number(batch['available_qty']) - Number(line.qty);
    const nextReserved = Math.max(0, Number(batch['reserved_qty']) - Number(line.qty));
    await tx.update(batches).set({ availableQty: qtyScale(nextAvailable), reservedQty: qtyScale(nextReserved), updatedAt: new Date() }).where(eq(batches.id, batch.id as string));
    if (batch['ownership_status'] === 'C' && nextAvailable <= 0 && batchVendorId) {
      const [bill] = await tx
        .select()
        .from(vendorBills)
        .where(sql`${vendorBills.vendorId} = ${batchVendorId} and ${vendorBills.status} in ('open','approved','scheduled','partial')`)
        .orderBy(vendorBills.createdAt)
        .limit(1);
      if (bill) {
        await tx
          .update(vendorBills)
          .set({ consignmentTriggered: true, status: bill.status === 'open' ? 'approved' : bill.status, dueReason: 'Due because consigned inventory depleted', updatedAt: new Date() })
          .where(eq(vendorBills.id, bill.id));
        affected.push(bill.id);
      } else {
        const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, batchVendorId)).limit(1);
        const [createdBill] = await tx
          .insert(vendorBills)
          .values({
            vendorId: batchVendorId,
            billNo: code('VBILL-CONSIGN'),
            amount: moneyScale(Number(line.qty) * Number(batch['unit_cost'])),
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
    await tx.insert(inventoryMovements).values({ batchId: batch.id as string, commandId, kind: 'sale_posted', qtyDelta: qtyScale(-Number(line.qty)), reason: order.orderNo });
    affected.push(batch.id as string, line.id);
  }

  const [invoice] = await tx
    .insert(invoices)
    .values({ invoiceNo: code('INV'), customerId: freshOrder.customerId, orderId, total: freshOrder.total, dueDate: oneWeek(), status: 'open' })
    .returning();
  // Customer balance accumulation must be Decimal (TER-1566): repeated
  // Number()-rounded sums across many invoices drift the running balance
  // away from the per-invoice sum.
  const nextBalance = addMoney(customer.balance, freshOrder.total);
  await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customer.id as string));
  await tx.insert(clientLedgerEntries).values({ customerId: customer.id as string, invoiceId: invoice.id, kind: 'invoice', amount: freshOrder.total, balanceAfter: nextBalance, note: freshOrder.orderNo });
  const exceptionTotals = computeOrderExceptionTotals(
    lines.map((line: typeof salesOrderLines.$inferSelect) => ({
      qty: Number(line.qty),
      unitPrice: Number(line.unitPrice),
      unitCost: Number(line.unitCost),
      priceFloor: line.priceFloor != null ? Number(line.priceFloor) : null,
      belowFloorReason: (line.belowFloorReason as BelowFloorReason | null) ?? null,
      vendorApprovalState: (line.vendorApprovalState as VendorApprovalState) ?? 'none'
    }))
  );
  await tx
    .update(salesOrders)
    .set({
      status: 'posted',
      inventoryPosted: true,
      postedAt: new Date(),
      marginWaivedTotal: moneyScale(exceptionTotals.marginWaivedTotal),
      lossRecognizedTotal: moneyScale(exceptionTotals.lossRecognizedTotal),
      vendorApprovalPending: exceptionTotals.vendorApprovalPending,
      updatedAt: new Date()
    })
    .where(eq(salesOrders.id, orderId));
  affected.push(invoice.id, customer.id as string);

  // #64 PR-3: per-line correction journal entries for below-floor COGS exceptions.
  //
  // For each posted line that carries a belowFloorReason, insert a correction
  // journal entry with the below-floor revenue shortfall variance
  //   max(0, (priceFloor - unitPrice) * qty)
  // floored at 0. We compare against unitPrice (the selling price), NOT
  // unitCost — setLineLandedCost writes unitCost = priceFloor = landedCost,
  // so a (priceFloor - unitCost) formula would always be zero. The shortfall
  // is the gap between the floor and what we actually charged, matching
  // computeOrderExceptionTotals.marginWaivedTotal. The priceFloor column was
  // captured at set-time for audit reproducibility — we do not re-read from
  // batches.priceRange at post time.
  //
  // For vendor_approval_pending lines, also append a discrepancy note to the
  // vendor's open bill so AP can see the pending credit before the vendor's
  // accommodation is recorded. This is a text-only annotation — no dollar or
  // status mutation on the bill, and the bill ID is NOT added to affectedIds
  // because the annotation intentionally does not participate in reversal.
  const exceptionPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  let exceptionPeriodChecked = false;
  for (const line of lines as Array<typeof salesOrderLines.$inferSelect>) {
    if (!line.belowFloorReason) continue;
    const floor = line.priceFloor != null ? Number(line.priceFloor) : 0;
    const variance = Math.max(0, (floor - Number(line.unitPrice)) * Number(line.qty));
    if (!exceptionPeriodChecked) {
      await assertPeriodUnlocked(tx, exceptionPeriod);
      exceptionPeriodChecked = true;
    }
    const notePart = line.belowFloorNote ? ` | ${line.belowFloorNote}` : '';
    const [cjEntry] = await tx
      .insert(correctionJournalEntries)
      .values({
        period: exceptionPeriod,
        amount: moneyScale(variance),
        memo: `COGS exception: ${line.belowFloorReason} | order ${freshOrder.orderNo} | line ${line.itemName}${notePart}`
      })
      .returning();
    affected.push(cjEntry.id);

    if (line.belowFloorReason === 'vendor_approval_pending' && line.batchId) {
      const [exBatch] = await tx
        .select({ vendorId: batches.vendorId })
        .from(batches)
        .where(eq(batches.id, line.batchId))
        .limit(1);
      if (exBatch?.vendorId) {
        // Lock the open vendor bill row before the read-modify-write on
        // discrepancyNotes so two concurrent postSalesOrder calls sharing
        // the same vendor's open bill cannot silently lose an annotation.
        // SKIP LOCKED: if a concurrent postSalesOrder is annotating this
        // bill, this call gracefully skips the annotation rather than
        // blocking — the CJ entry is still inserted and the audit trail
        // is preserved, the lost note is a soft AP-visibility loss only.
        const pendingBillRows = await tx.execute(
          sql`SELECT * FROM ${vendorBills} WHERE ${vendorBills.vendorId} = ${exBatch.vendorId} AND ${vendorBills.status} IN ('open','approved','scheduled','partial') ORDER BY ${vendorBills.createdAt} LIMIT 1 FOR UPDATE SKIP LOCKED`
        );
        // Raw `SELECT *` returns Postgres column names (snake_case). The
        // `as typeof vendorBills.$inferSelect` cast lies to TypeScript — at
        // runtime `pendingBill.discrepancyNotes` would be `undefined`. Read
        // the snake_case key via bracket notation.
        const pendingBill = pendingBillRows.rows[0];
        if (pendingBill) {
          const prior = pendingBill['discrepancy_notes'] as string | null | undefined;
          const newNote = `Pending below-floor COGS credit: order ${freshOrder.orderNo}, line ${line.itemName}, variance $${variance.toFixed(2)} (vendor_approval_pending)`;
          const merged = [prior, newNote].filter(Boolean).join('\n');
          await tx
            .update(vendorBills)
            .set({ discrepancyNotes: merged, updatedAt: new Date() })
            .where(eq(vendorBills.id, pendingBill.id as string));
        }
      }
    }
  }

  // Accrue referee credit if relationship specified.
  // G-10: accept payload.refereeRelationshipId (explicit thread) or fall
  // back to the relationship stored on the order at confirm time. When
  // logRefereeCredit is explicitly false the operator has opted out.
  const effectiveRefereeRelationshipId =
    (payload.refereeRelationshipId as string | undefined) ||
    (freshOrder.refereeRelationshipId as string | undefined) ||
    undefined;
  if (effectiveRefereeRelationshipId && payload.logRefereeCredit !== false) {
    const { creditAmount } = await accrueRefereeCredit(tx, {
      refereeRelationshipId: effectiveRefereeRelationshipId,
      transactionType: 'sales_order',
      transactionId: freshOrder.id,
      transactionNo: freshOrder.orderNo,
      transactionTotal: Number(freshOrder.total),
      commandId
    });

    await tx.update(salesOrders).set({
      refereeRelationshipId: effectiveRefereeRelationshipId,
      refereeCreditAmount: creditAmount.toFixed(2)
    }).where(eq(salesOrders.id, orderId));
  }

  await enqueueCustomerRecompute(tx, customer.id as string, 'event:postSalesOrder', commandId);
  return {
    ok: true,
    commandId,
    affectedIds: affected,
    toast: `${freshOrder.orderNo} posted and invoice ${invoice.invoiceNo} created.`,
    delta: {
      marginWaivedTotal: moneyScale(exceptionTotals.marginWaivedTotal),
      lossRecognizedTotal: moneyScale(exceptionTotals.lossRecognizedTotal),
      vendorApprovalPending: exceptionTotals.vendorApprovalPending
    },
    ...(warnings.length ? { warnings } : {})
  };
}

export async function setDeliveryWindow(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  setDeliveryWindowPayloadSchema.parse(payload);
  const orderId = requiredId(payload.orderId, 'orderId');
  const deliveryWindow = requiredString(payload.deliveryWindow, 'deliveryWindow');
  await tx.update(salesOrders).set({ deliveryWindow, updatedAt: new Date() }).where(eq(salesOrders.id, orderId));
  return { ok: true, commandId, affectedIds: [orderId], toast: 'Delivery window updated.' };
}

// addSalesOrderLine and updateSalesOrderLine read the soft-draft reservation
// projection via getDraftReservedQtyMap. The function is exported from
// commandBus.ts and re-imported here for parity with the source location;
// keeping a local re-export here would create a duplicate symbol. We import
// directly from the commandBus module.
import { getDraftReservedQtyMap } from '@/server/services/commandBus';
