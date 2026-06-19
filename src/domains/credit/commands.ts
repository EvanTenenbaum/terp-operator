/**
 * Credit domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.CRED.EXTRACT.
 *
 * NOTE: this module intentionally imports helpers, schemas, and the Payload
 * type from `@/server/services/commandBus`. commandBus.ts in turn re-imports
 * the 12 credit command handlers from this module, which creates a circular
 * import. This is safe under ESM because every reference to those imported
 * bindings lives inside a function body — by the time runCommand() invokes a
 * credit handler, commandBus.ts has fully evaluated and the live bindings
 * are resolved (same pattern as P1.PO / P1.PAY / P1.SAL extractions).
 *
 * The stance-related helpers (StanceWeightsInput, parseStanceWeights,
 * maxWeight, assertExtremeWeightsAcknowledged, weightsToColumns) are
 * credit-specific and were moved with the handlers; they were not used
 * outside this domain.
 *
 * `applyClientCredit` lives in the payments domain (already extracted in
 * P1.PAY.EXTRACT). `voidRefereeCredit` intentionally remains in commandBus
 * because it is referee-related, not credit-engine-related.
 *
 * Future cleanup (P2+): hoist the shared helpers to `@/domains/shared/...`
 * and remove the cycle entirely.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  creditEngineConfig,
  creditEngineConfigHistory,
  creditEngineStanceHistory,
  creditEngineStances,
  customerCreditAssessments,
  customers,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult, SessionUser } from '../../shared/types';

// Helpers, schemas, and the Payload type are kept in commandBus.ts for this
// phase (see header comment).
import {
  // Schemas
  setCustomerCreditLimitPayloadSchema,
  // Helpers
  moneyScale,
  requiredId,
  requiredNumber,
  requiredString,
  stringValue,
  // Types
  type Payload,
} from '@/server/services/commandBus';

// Credit-engine recompute lives in its own module; safe to import directly.
import { enqueueAllCustomers, enqueueCustomerRecompute } from '@/server/services/creditEngine';

// ---------------------------------------------------------------------------
// Stance weight helpers (credit-domain-internal).
// ---------------------------------------------------------------------------

interface StanceWeightsInput {
  revenueMomentum: number;
  cashCollection: number;
  profitability: number;
  debtAging: number;
  repaymentVelocity: number;
  tenureDepth: number;
}

function parseStanceWeights(value: unknown): StanceWeightsInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('weights must be an object with six signal weights.');
  }
  const obj = value as Record<string, unknown>;
  const keys: Array<keyof StanceWeightsInput> = [
    'revenueMomentum',
    'cashCollection',
    'profitability',
    'debtAging',
    'repaymentVelocity',
    'tenureDepth'
  ];
  const weights = {} as StanceWeightsInput;
  for (const key of keys) {
    const raw = obj[key];
    if (raw === undefined || raw === null) throw new Error(`weights.${key} is required.`);
    const num = Number(raw);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      throw new Error(`weights.${key} must be an integer.`);
    }
    if (num < 0 || num > 100) throw new Error(`weights.${key} must be between 0 and 100.`);
    weights[key] = num;
  }
  const sum =
    weights.revenueMomentum + weights.cashCollection + weights.profitability +
    weights.debtAging + weights.repaymentVelocity + weights.tenureDepth;
  if (sum !== 100) throw new Error('weights must sum to 100.');
  return weights;
}

function maxWeight(weights: StanceWeightsInput) {
  return Math.max(
    weights.revenueMomentum,
    weights.cashCollection,
    weights.profitability,
    weights.debtAging,
    weights.repaymentVelocity,
    weights.tenureDepth
  );
}

function assertExtremeWeightsAcknowledged(weights: StanceWeightsInput, payload: Payload) {
  if (maxWeight(weights) <= 50) return;
  if (payload.acknowledgeExtremeWeights !== true) {
    throw new Error('Extreme weight (>50) requires acknowledgeExtremeWeights=true.');
  }
  const justification = stringValue(payload.extremeWeightJustification);
  if (justification.length < 12) {
    throw new Error('extremeWeightJustification must be at least 12 characters.');
  }
}

function weightsToColumns(weights: StanceWeightsInput) {
  return {
    weightRevenueMomentum: weights.revenueMomentum,
    weightCashCollection: weights.cashCollection,
    weightProfitability: weights.profitability,
    weightDebtAging: weights.debtAging,
    weightRepaymentVelocity: weights.repaymentVelocity,
    weightTenureDepth: weights.tenureDepth
  };
}

// ---------------------------------------------------------------------------
// Command handlers.
// ---------------------------------------------------------------------------

export async function setCustomerCreditLimit(
  tx: Tx,
  payload: Payload,
  user: SessionUser,
  commandId: string
): Promise<CommandResult> {
  setCustomerCreditLimitPayloadSchema.parse(payload);
  const customerId = requiredId(payload.customerId, 'customerId');
  const amount = requiredNumber(payload.amount, 'amount');
  if (amount < 0) throw new Error('amount must be greater than or equal to zero.');
  const reason = stringValue(payload.reason);
  if (reason.length < 4) throw new Error('reason must be at least 4 characters.');

  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');

  const [latestAssessment] = await tx
    .select()
    .from(customerCreditAssessments)
    .where(eq(customerCreditAssessments.customerId, customerId))
    .orderBy(desc(customerCreditAssessments.createdAt))
    .limit(1);
  const recommended = latestAssessment ? Number(latestAssessment.recommendedLimit) : 0;
  const threshold = 1.5 * recommended;
  if (amount > threshold && user.role !== 'owner') {
    throw new Error(
      `Setting credit limit above 1.5x the engine recommendation requires owner role. Engine recommended ${recommended.toFixed(2)}; requested ${amount.toFixed(2)}.`
    );
  }

  await tx
    .update(customers)
    .set({
      creditLimit: moneyScale(amount),
      creditLimitSource: 'manual',
      creditLimitManualSetAt: new Date(),
      creditLimitManualSetBy: user.id,
      creditLimitManualReason: reason,
      creditLimitLastReviewedAt: new Date(),
      creditLimitSnoozeCount: 0,
      updatedAt: new Date()
    })
    .where(eq(customers.id, customerId));

  await enqueueCustomerRecompute(tx, customerId, 'manualTrigger', commandId);
  return { ok: true, commandId, affectedIds: [customerId], toast: 'Manual credit limit set' };
}

export async function revertCustomerCreditToEngine(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');

  // Deterministic precondition: the DB CHECK constraint
  // `customers_engine_source_has_assessment` forbids credit_limit_source='engine'
  // when last_assessment_id IS NULL. Reject the revert with a clear error
  // BEFORE issuing the UPDATE so callers (UI / scripts / tests) get a friendly
  // message instead of a raw constraint violation.
  if (customer.lastAssessmentId === null || customer.lastAssessmentId === undefined) {
    throw new Error(
      'Customer must have a credit assessment before reverting to engine.'
    );
  }

  await tx
    .update(customers)
    .set({
      creditLimitSource: 'engine',
      creditLimitManualSetAt: null,
      creditLimitManualSetBy: null,
      creditLimitManualReason: null,
      creditLimitLastReviewedAt: null,
      creditLimitSnoozeCount: 0,
      updatedAt: new Date()
    })
    .where(eq(customers.id, customerId));

  await enqueueCustomerRecompute(tx, customerId, 'manualTrigger', commandId);
  return {
    ok: true,
    commandId,
    affectedIds: [customerId],
    toast: 'Reverted to engine credit limit'
  };
}

export async function snoozeCustomerCreditReminder(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const newReminderDays = payload.newReminderDays;
  let parsedReminderDays: number | null = null;
  if (newReminderDays !== undefined && newReminderDays !== null) {
    const num = Number(newReminderDays);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
      throw new Error('newReminderDays must be a positive integer.');
    }
    parsedReminderDays = num;
  }

  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');

  const [config] = await tx.select().from(creditEngineConfig).limit(1);
  if (!config) throw new Error('Credit engine config is missing.');

  const setAt = customer.creditLimitManualSetAt ? new Date(customer.creditLimitManualSetAt) : null;
  if (!setAt) {
    throw new Error('Customer has no manual override to snooze.');
  }
  const ageMs = Date.now() - setAt.getTime();
  const capMs = Number(config.manualOverrideSnoozeCapDays) * 24 * 60 * 60 * 1000;
  if (ageMs > capMs) {
    throw new Error(
      `Manual override is older than the ${config.manualOverrideSnoozeCapDays}-day snooze cap. Re-set the override or revert to engine.`
    );
  }

  const values: Record<string, unknown> = {
    creditLimitLastReviewedAt: new Date(),
    creditLimitSnoozeCount: (customer.creditLimitSnoozeCount ?? 0) + 1,
    updatedAt: new Date()
  };
  if (parsedReminderDays !== null) values.creditLimitReminderDays = parsedReminderDays;

  await tx.update(customers).set(values).where(eq(customers.id, customerId));
  return {
    ok: true,
    commandId,
    affectedIds: [customerId],
    toast: 'Reminder snoozed'
  };
}

export async function setCustomerEngineMax(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const raw = payload.engineMax;
  let engineMax: string | null = null;
  if (raw !== null && raw !== undefined) {
    const num = Number(raw);
    if (!Number.isFinite(num)) throw new Error('engineMax must be a number or null.');
    if (num < 0) throw new Error('engineMax must be greater than or equal to zero.');
    engineMax = moneyScale(num);
  }

  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');

  await tx.update(customers).set({ engineMax, updatedAt: new Date() }).where(eq(customers.id, customerId));
  await enqueueCustomerRecompute(tx, customerId, 'event:setEngineMax', commandId);
  return { ok: true, commandId, affectedIds: [customerId], toast: 'Engine max set' };
}

export async function setCustomerStance(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const raw = payload.stanceId;
  let stanceId: string | null = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    stanceId = requiredId(raw, 'stanceId');
    const [stance] = await tx
      .select()
      .from(creditEngineStances)
      .where(eq(creditEngineStances.id, stanceId))
      .limit(1);
    if (!stance) throw new Error('Stance not found.');
  }
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');

  await tx.update(customers).set({ stanceId, updatedAt: new Date() }).where(eq(customers.id, customerId));
  await enqueueCustomerRecompute(tx, customerId, 'event:setStance', commandId);
  return { ok: true, commandId, affectedIds: [customerId], toast: 'Stance updated' };
}

export async function disableCreditEngineForCustomer(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const reason = stringValue(payload.reason);
  if (reason.length < 4) throw new Error('reason must be at least 4 characters.');

  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');

  const values: Record<string, unknown> = {
    engineDisabledAt: new Date(),
    engineDisabledBy: userId,
    engineDisabledReason: reason,
    updatedAt: new Date()
  };
  if (customer.creditLimitSource === 'engine') {
    values.creditLimitSource = 'manual';
  }
  await tx.update(customers).set(values).where(eq(customers.id, customerId));
  // Reference the commandId in journaling via inventoryMovements? No — engine disable doesn't
  // touch inventory. The command_journal row is written by the bus itself.
  void commandId;
  return { ok: true, commandId, affectedIds: [customerId], toast: 'Engine disabled for customer' };
}

export async function enableCreditEngineForCustomer(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const customerId = requiredId(payload.customerId, 'customerId');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');

  await tx
    .update(customers)
    .set({
      engineDisabledAt: null,
      engineDisabledBy: null,
      engineDisabledReason: null,
      updatedAt: new Date()
    })
    .where(eq(customers.id, customerId));
  await enqueueCustomerRecompute(tx, customerId, 'manualTrigger', commandId);
  return { ok: true, commandId, affectedIds: [customerId], toast: 'Engine re-enabled for customer' };
}

export async function createCreditEngineStance(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const name = requiredString(payload.name, 'name');
  const description = stringValue(payload.description) || null;
  const weights = parseStanceWeights(payload.weights);
  assertExtremeWeightsAcknowledged(weights, payload);

  const [row] = await tx
    .insert(creditEngineStances)
    .values({
      name,
      description,
      ...weightsToColumns(weights)
    })
    .returning();
  if (!row) throw new Error('Failed to insert credit engine stance.');

  const postState = {
    id: row.id,
    name: row.name,
    description: row.description,
    weights: {
      revenueMomentum: row.weightRevenueMomentum,
      cashCollection: row.weightCashCollection,
      profitability: row.weightProfitability,
      debtAging: row.weightDebtAging,
      repaymentVelocity: row.weightRepaymentVelocity,
      tenureDepth: row.weightTenureDepth
    }
  };

  await tx.insert(creditEngineStanceHistory).values({
    stanceId: row.id,
    changedBy: userId,
    commandId,
    action: 'create',
    preState: null,
    postState,
    affectedCustomerCount: 0
  });

  return { ok: true, commandId, affectedIds: [row.id], toast: 'Stance created' };
}

export async function updateCreditEngineStance(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const stanceId = requiredId(payload.stanceId, 'stanceId');
  const [existing] = await tx
    .select()
    .from(creditEngineStances)
    .where(eq(creditEngineStances.id, stanceId))
    .limit(1);
  if (!existing) throw new Error('Stance not found.');

  const values: Record<string, unknown> = { updatedAt: new Date() };
  let weightsChanged = false;
  if (payload.name !== undefined) values.name = requiredString(payload.name, 'name');
  if (payload.description !== undefined) {
    values.description = stringValue(payload.description) || null;
  }
  let weights: StanceWeightsInput | null = null;
  if (payload.weights !== undefined) {
    weights = parseStanceWeights(payload.weights);
    assertExtremeWeightsAcknowledged(weights, payload);
    Object.assign(values, weightsToColumns(weights));
    const prior: StanceWeightsInput = {
      revenueMomentum: existing.weightRevenueMomentum,
      cashCollection: existing.weightCashCollection,
      profitability: existing.weightProfitability,
      debtAging: existing.weightDebtAging,
      repaymentVelocity: existing.weightRepaymentVelocity,
      tenureDepth: existing.weightTenureDepth
    };
    weightsChanged =
      prior.revenueMomentum !== weights.revenueMomentum ||
      prior.cashCollection !== weights.cashCollection ||
      prior.profitability !== weights.profitability ||
      prior.debtAging !== weights.debtAging ||
      prior.repaymentVelocity !== weights.repaymentVelocity ||
      prior.tenureDepth !== weights.tenureDepth;
  }

  await tx.update(creditEngineStances).set(values).where(eq(creditEngineStances.id, stanceId));

  const [{ count: affectedCount }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(eq(customers.stanceId, stanceId));

  const preState = {
    id: existing.id,
    name: existing.name,
    description: existing.description,
    weights: {
      revenueMomentum: existing.weightRevenueMomentum,
      cashCollection: existing.weightCashCollection,
      profitability: existing.weightProfitability,
      debtAging: existing.weightDebtAging,
      repaymentVelocity: existing.weightRepaymentVelocity,
      tenureDepth: existing.weightTenureDepth
    }
  };
  const postState = {
    id: existing.id,
    name: (values.name as string | undefined) ?? existing.name,
    description: payload.description !== undefined ? (values.description as string | null) : existing.description,
    weights: weights ?? preState.weights
  };

  await tx.insert(creditEngineStanceHistory).values({
    stanceId,
    changedBy: userId,
    commandId,
    action: 'update',
    preState,
    postState,
    affectedCustomerCount: Number(affectedCount ?? 0)
  });

  if (weightsChanged) {
    await enqueueAllCustomers(tx, 'event:stanceEdited', { stanceId });
  }

  const toast = weightsChanged
    ? 'Stance updated; recomputing affected customers'
    : 'Stance updated';
  return { ok: true, commandId, affectedIds: [stanceId], toast };
}

export async function deleteCreditEngineStance(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const stanceId = requiredId(payload.stanceId, 'stanceId');
  const [existing] = await tx
    .select()
    .from(creditEngineStances)
    .where(eq(creditEngineStances.id, stanceId))
    .limit(1);
  if (!existing) throw new Error('Stance not found.');

  const [config] = await tx.select().from(creditEngineConfig).limit(1);
  if (config && config.globalDefaultStanceId === stanceId) {
    throw new Error('Cannot delete the global default stance.');
  }

  const [{ count: usage }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(eq(customers.stanceId, stanceId));
  if (Number(usage ?? 0) > 0) {
    throw new Error('Cannot delete a stance that is still assigned to customers.');
  }

  const preState = {
    id: existing.id,
    name: existing.name,
    description: existing.description,
    weights: {
      revenueMomentum: existing.weightRevenueMomentum,
      cashCollection: existing.weightCashCollection,
      profitability: existing.weightProfitability,
      debtAging: existing.weightDebtAging,
      repaymentVelocity: existing.weightRepaymentVelocity,
      tenureDepth: existing.weightTenureDepth
    }
  };

  await tx.delete(creditEngineStances).where(eq(creditEngineStances.id, stanceId));
  await tx.insert(creditEngineStanceHistory).values({
    stanceId,
    changedBy: userId,
    commandId,
    action: 'delete',
    preState,
    postState: null,
    affectedCustomerCount: 0
  });

  return { ok: true, commandId, affectedIds: [stanceId], toast: 'Stance deleted' };
}

export async function setCreditEngineConfig(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const [existing] = await tx.select().from(creditEngineConfig).limit(1);
  if (!existing) throw new Error('Credit engine config row is missing.');

  const values: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId };
  if (payload.globalDefaultStanceId !== undefined) {
    const stanceId = requiredId(payload.globalDefaultStanceId, 'globalDefaultStanceId');
    const [stance] = await tx
      .select()
      .from(creditEngineStances)
      .where(eq(creditEngineStances.id, stanceId))
      .limit(1);
    if (!stance) throw new Error('globalDefaultStanceId does not reference an existing stance.');
    values.globalDefaultStanceId = stanceId;
  }
  for (const key of [
    'coldStartMinPostedInvoices',
    'coldStartMinTenureDays',
    'manualOverrideReminderDefaultDays',
    'manualOverrideSnoozeCapDays'
  ] as const) {
    if (payload[key] !== undefined) {
      const num = Number(payload[key]);
      if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
        throw new Error(`${key} must be a non-negative integer.`);
      }
      values[key] = num;
    }
  }
  // Enforce a server-side minimum on the snooze cap. The credit-review queue
  // computes a "near snooze cap" badge using `cap - 30`; if the cap were set
  // below 30 the badge math would silently go negative and bin every manual
  // override into "near cap" forever. We require a minimum of 30 days.
  if (
    values.manualOverrideSnoozeCapDays !== undefined &&
    (values.manualOverrideSnoozeCapDays as number) < 30
  ) {
    throw new Error('manualOverrideSnoozeCapDays must be at least 30.');
  }
  if (payload.shadowMode !== undefined) {
    if (typeof payload.shadowMode !== 'boolean') throw new Error('shadowMode must be a boolean.');
    // One-way-down rule: shadow mode can only transition true -> false. Once
    // the operator has flipped the engine live (shadowMode=false), re-enabling
    // shadow mode is rejected server-side. This protects the audit trail and
    // matches the UI's disabled-checkbox affordance in CreditEngineSettingsPanel.
    if (payload.shadowMode === true && existing.shadowMode === false) {
      throw new Error('Shadow mode cannot be re-enabled once it has been disabled.');
    }
    values.shadowMode = payload.shadowMode;
  }

  await tx.update(creditEngineConfig).set(values).where(eq(creditEngineConfig.id, existing.id));

  const preState = {
    globalDefaultStanceId: existing.globalDefaultStanceId,
    coldStartMinPostedInvoices: existing.coldStartMinPostedInvoices,
    coldStartMinTenureDays: existing.coldStartMinTenureDays,
    manualOverrideReminderDefaultDays: existing.manualOverrideReminderDefaultDays,
    manualOverrideSnoozeCapDays: existing.manualOverrideSnoozeCapDays,
    shadowMode: existing.shadowMode
  };
  const postState = {
    globalDefaultStanceId: (values.globalDefaultStanceId as string | undefined) ?? existing.globalDefaultStanceId,
    coldStartMinPostedInvoices:
      (values.coldStartMinPostedInvoices as number | undefined) ?? existing.coldStartMinPostedInvoices,
    coldStartMinTenureDays:
      (values.coldStartMinTenureDays as number | undefined) ?? existing.coldStartMinTenureDays,
    manualOverrideReminderDefaultDays:
      (values.manualOverrideReminderDefaultDays as number | undefined) ?? existing.manualOverrideReminderDefaultDays,
    manualOverrideSnoozeCapDays:
      (values.manualOverrideSnoozeCapDays as number | undefined) ?? existing.manualOverrideSnoozeCapDays,
    shadowMode: (values.shadowMode as boolean | undefined) ?? existing.shadowMode
  };

  await tx.insert(creditEngineConfigHistory).values({
    changedBy: userId,
    commandId,
    preState,
    postState
  });

  return { ok: true, commandId, affectedIds: [existing.id], toast: 'Engine config updated' };
}

export async function bulkRevertCustomersToEngine(
  tx: Tx,
  payload: Payload,
  user: SessionUser,
  commandId: string
): Promise<CommandResult> {
  if (user.role !== 'owner') {
    throw new Error('bulkRevertCustomersToEngine requires owner role.');
  }
  const filter = (payload.filter && typeof payload.filter === 'object' && !Array.isArray(payload.filter))
    ? (payload.filter as Record<string, unknown>)
    : {};
  const skipEngineDisabled = filter.skipEngineDisabled !== false; // default true
  const force = payload.force === true;
  const flipShadowMode = payload.flipShadowMode !== false; // default true: rollout intent
  void force;

  // Deterministic eligibility: the customers_engine_source_has_assessment
  // CHECK constraint forbids source='engine' when last_assessment_id IS NULL.
  // Filter the candidate set to customers that satisfy the constraint so the
  // bulk UPDATE cannot raise a constraint violation. Customers without an
  // assessment are reported as skipped instead of silently dropped.
  const conditions = [
    eq(customers.creditLimitSource, 'manual'),
    sql`last_assessment_id IS NOT NULL`
  ];
  if (skipEngineDisabled) conditions.push(sql`engine_disabled_at IS NULL`);

  const affectedCustomers = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(...conditions));
  const affectedIds = affectedCustomers.map((row: { id: string }) => row.id);

  // Count candidates that match the filter EXCEPT for the assessment gate,
  // so we can report how many were skipped because they lacked an assessment.
  const skippedConditions = [
    eq(customers.creditLimitSource, 'manual'),
    sql`last_assessment_id IS NULL`
  ];
  if (skipEngineDisabled) skippedConditions.push(sql`engine_disabled_at IS NULL`);
  const skippedRows = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(...skippedConditions));
  const skippedNoAssessment = skippedRows.length;

  if (affectedIds.length > 0) {
    await tx
      .update(customers)
      .set({
        creditLimitSource: 'engine',
        creditLimitManualSetAt: null,
        creditLimitManualSetBy: null,
        creditLimitManualReason: null,
        creditLimitLastReviewedAt: null,
        creditLimitSnoozeCount: 0,
        updatedAt: new Date()
      })
      .where(inArray(customers.id, affectedIds));
    await enqueueAllCustomers(tx, 'bulkRevert', { skipEngineDisabled });
  }

  if (flipShadowMode) {
    const [config] = await tx.select().from(creditEngineConfig).limit(1);
    if (config && config.shadowMode) {
      await tx
        .update(creditEngineConfig)
        .set({ shadowMode: false, updatedAt: new Date(), updatedBy: user.id })
        .where(eq(creditEngineConfig.id, config.id));
      await tx.insert(creditEngineConfigHistory).values({
        changedBy: user.id,
        commandId,
        preState: {
          globalDefaultStanceId: config.globalDefaultStanceId,
          coldStartMinPostedInvoices: config.coldStartMinPostedInvoices,
          coldStartMinTenureDays: config.coldStartMinTenureDays,
          manualOverrideReminderDefaultDays: config.manualOverrideReminderDefaultDays,
          manualOverrideSnoozeCapDays: config.manualOverrideSnoozeCapDays,
          shadowMode: config.shadowMode
        },
        postState: {
          globalDefaultStanceId: config.globalDefaultStanceId,
          coldStartMinPostedInvoices: config.coldStartMinPostedInvoices,
          coldStartMinTenureDays: config.coldStartMinTenureDays,
          manualOverrideReminderDefaultDays: config.manualOverrideReminderDefaultDays,
          manualOverrideSnoozeCapDays: config.manualOverrideSnoozeCapDays,
          shadowMode: false
        }
      });
    }
  }

  const toast =
    skippedNoAssessment > 0
      ? `Reverted ${affectedIds.length} customer(s) to engine credit limit; ${skippedNoAssessment} skipped (no assessment yet)`
      : `Reverted ${affectedIds.length} customer(s) to engine credit limit`;

  return {
    ok: true,
    commandId,
    affectedIds,
    toast
  };
}
