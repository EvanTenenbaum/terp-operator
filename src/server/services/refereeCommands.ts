/**
 * Referee Credit System - Command Handlers
 *
 * All referee-related commands and helper functions.
 * Implements blocker fixes B1, B3, B4.
 */

import { eq, and, or, sql, asc } from 'drizzle-orm';
import { referees, refereeRelationships, refereeCredits, purchaseOrders, salesOrders } from '../schema';
import type { CommandResult } from '../../shared/types';

type Tx = any;
type Payload = Record<string, unknown>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate referee credit amount
 * BLOCKER FIX M3: Validates non-negative totals
 */
export function calculateRefereeCredit(
  transactionTotal: number,
  feeType: 'percentage' | 'fixed' | 'hybrid',
  feePercentage: number | null,
  feeFixedAmount: number | null
): number {
  if (transactionTotal < 0) {
    throw new Error(`Cannot calculate credit for negative transaction total: $${transactionTotal}`);
  }

  switch (feeType) {
    case 'percentage':
      if (!feePercentage) throw new Error('Percentage fee required');
      return Math.round((transactionTotal * (feePercentage / 100)) * 100) / 100;
    case 'fixed':
      if (!feeFixedAmount) throw new Error('Fixed amount required');
      return feeFixedAmount;
    case 'hybrid':
      if (!feePercentage || !feeFixedAmount) {
        throw new Error('Both percentage and fixed amount required for hybrid fee');
      }
      const percentPart = Math.round((transactionTotal * (feePercentage / 100)) * 100) / 100;
      return percentPart + feeFixedAmount;
    default:
      throw new Error(`Invalid fee type: ${feeType}`);
  }
}

/**
 * Accrue referee credit from a transaction
 * BLOCKER FIX B3: Runs within transaction context
 * BLOCKER FIX B1: Balance auto-updated by database trigger
 */
export async function accrueRefereeCredit(
  tx: Tx,
  options: {
    refereeRelationshipId: string;
    transactionType: 'purchase_order' | 'sales_order';
    transactionId: string;
    transactionNo: string;
    transactionTotal: number;
    commandId: string;
  }
): Promise<{ creditId: string; creditAmount: number }> {
  // 1. Get relationship
  const relationship = await tx.query.refereeRelationships.findFirst({
    where: and(
      eq(refereeRelationships.id, options.refereeRelationshipId),
      eq(refereeRelationships.active, true)
    )
  });

  if (!relationship) {
    throw new Error('Referee relationship not found or inactive');
  }

  // 2. Calculate credit
  const creditAmount = calculateRefereeCredit(
    options.transactionTotal,
    relationship.feeType as 'percentage' | 'fixed' | 'hybrid',
    relationship.feePercentage ? Number(relationship.feePercentage) : null,
    relationship.feeFixedAmount ? Number(relationship.feeFixedAmount) : null
  );

  // 3. Insert credit (balance auto-updated by trigger)
  const [credit] = await tx
    .insert(refereeCredits)
    .values({
      refereeId: relationship.refereeId,
      refereeRelationshipId: relationship.id,
      transactionType: options.transactionType,
      transactionId: options.transactionId,
      transactionNo: options.transactionNo,
      transactionTotal: options.transactionTotal.toFixed(2),
      feeType: relationship.feeType,
      feePercentage: relationship.feePercentage,
      feeFixedAmount: relationship.feeFixedAmount,
      creditAmount: creditAmount.toFixed(2),
      status: 'accrued',
      commandId: options.commandId
    })
    .returning();

  return {
    creditId: credit.id,
    creditAmount
  };
}

/**
 * Void referee credit (for reversals)
 * BLOCKER FIX B1: Balance auto-updated by trigger
 */
export async function voidRefereeCredit(
  tx: Tx,
  creditId: string,
  reason: string
): Promise<void> {
  await tx
    .update(refereeCredits)
    .set({
      status: 'voided',
      voidedAt: new Date(),
      voidedReason: reason
    })
    .where(eq(refereeCredits.id, creditId));

  // Balance automatically updated by trigger
}

/**
 * Process referee payout
 * BLOCKER FIX B4: Validates against balance, supports partial payments
 * BLOCKER FIX B3: Runs within transaction context
 */
export async function processRefereePayout(
  tx: Tx,
  refereeId: string,
  amount: number,
  transactionId: string,
  commandId: string
): Promise<{ creditsMarkedPaid: number; totalPaid: number }> {
  // 1. Validate amount against balance
  const [referee] = await tx
    .select()
    .from(referees)
    .where(eq(referees.id, refereeId))
    .limit(1);

  if (!referee) {
    throw new Error('Referee not found');
  }

  const balance = Number(referee.balance);
  if (amount > balance) {
    throw new Error(
      `Cannot pay $${amount.toFixed(2)}. Referee balance is only $${balance.toFixed(2)}.`
    );
  }

  if (amount <= 0) {
    throw new Error('Payout amount must be greater than zero');
  }

  // 2. Get unpaid/partially-paid credits (FIFO)
  const credits = await tx
    .select()
    .from(refereeCredits)
    .where(
      and(
        eq(refereeCredits.refereeId, refereeId),
        or(
          eq(refereeCredits.status, 'accrued'),
          eq(refereeCredits.status, 'partially_paid')
        )
      )
    )
    .orderBy(asc(refereeCredits.createdAt));

  // 3. Calculate how much of each credit to pay
  let remaining = amount;
  const paymentsToApply: Array<{
    creditId: string;
    payAmount: number;
    newTotalPaid: number;
    newStatus: 'partially_paid' | 'paid';
  }> = [];

  for (const credit of credits) {
    if (remaining <= 0) break;

    const creditAmount = Number(credit.creditAmount);
    const amountPaid = Number(credit.amountPaid);
    const unpaidAmount = creditAmount - amountPaid;
    const payAmount = Math.min(unpaidAmount, remaining);

    paymentsToApply.push({
      creditId: credit.id,
      payAmount,
      newTotalPaid: amountPaid + payAmount,
      newStatus: amountPaid + payAmount >= creditAmount ? 'paid' : 'partially_paid'
    });

    remaining -= payAmount;
  }

  // 4. Verify we can pay exact amount
  const totalApplied = paymentsToApply.reduce((sum, p) => sum + p.payAmount, 0);
  if (Math.abs(totalApplied - amount) > 0.01) {
    throw new Error(
      `Cannot apply exact payout amount. Applied: $${totalApplied.toFixed(2)}, Requested: $${amount.toFixed(2)}`
    );
  }

  // 5. Apply payments to credits
  for (const payment of paymentsToApply) {
    await tx
      .update(refereeCredits)
      .set({
        amountPaid: payment.newTotalPaid.toFixed(2),
        status: payment.newStatus,
        paidViaTransactionId: transactionId,
        paidAt: new Date()
      })
      .where(eq(refereeCredits.id, payment.creditId));
  }

  // Balance automatically updated by trigger

  return {
    creditsMarkedPaid: paymentsToApply.length,
    totalPaid: totalApplied
  };
}

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Create a new referee
 */
export async function createReferee(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const [referee] = await tx
    .insert(referees)
    .values({
      name: String(payload.name),
      email: payload.email ? String(payload.email) : null,
      phone: payload.phone ? String(payload.phone) : null,
      taxId: payload.taxId ? String(payload.taxId) : null,
      paymentMethod: payload.paymentMethod ? String(payload.paymentMethod) : 'check',
      paymentDetails: payload.paymentDetails ? String(payload.paymentDetails) : null,
      notes: payload.notes ? String(payload.notes) : null,
      active: true
    })
    .returning();

  return {
    ok: true,
    commandId,
    affectedIds: [referee.id],
    toast: `Referee "${referee.name}" created.`
  };
}

/**
 * Update referee
 */
export async function updateReferee(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const refereeId = String(payload.refereeId);

  const updates: any = {};
  if (payload.name !== undefined) updates.name = String(payload.name);
  if (payload.email !== undefined) updates.email = payload.email ? String(payload.email) : null;
  if (payload.phone !== undefined) updates.phone = payload.phone ? String(payload.phone) : null;
  if (payload.taxId !== undefined) updates.taxId = payload.taxId ? String(payload.taxId) : null;
  if (payload.paymentMethod !== undefined) updates.paymentMethod = String(payload.paymentMethod);
  if (payload.paymentDetails !== undefined) updates.paymentDetails = payload.paymentDetails ? String(payload.paymentDetails) : null;
  if (payload.notes !== undefined) updates.notes = payload.notes ? String(payload.notes) : null;
  if (payload.active !== undefined) updates.active = Boolean(payload.active);

  await tx
    .update(referees)
    .set(updates)
    .where(eq(referees.id, refereeId));

  return {
    ok: true,
    commandId,
    affectedIds: [refereeId],
    toast: 'Referee updated.'
  };
}

/**
 * Add referee relationship
 * BLOCKER FIX B2: FK validation handled by database trigger
 */
export async function addRefereeRelationship(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const refereeId = String(payload.refereeId);
  const entityType = String(payload.entityType) as 'customer' | 'vendor';
  const entityId = String(payload.entityId);
  const feeType = String(payload.feeType) as 'percentage' | 'fixed' | 'hybrid';

  // Deactivate any existing active relationship for same referee+entity
  await tx
    .update(refereeRelationships)
    .set({
      active: false,
      effectiveUntil: new Date()
    })
    .where(
      and(
        eq(refereeRelationships.refereeId, refereeId),
        eq(refereeRelationships.entityType, entityType),
        eq(refereeRelationships.entityId, entityId),
        eq(refereeRelationships.active, true)
      )
    );

  // Create new relationship
  const [relationship] = await tx
    .insert(refereeRelationships)
    .values({
      refereeId,
      entityType,
      entityId,
      feeType,
      feePercentage: payload.feePercentage ? String(payload.feePercentage) : null,
      feeFixedAmount: payload.feeFixedAmount ? String(payload.feeFixedAmount) : null,
      applyByDefault: payload.applyByDefault !== undefined ? Boolean(payload.applyByDefault) : true,
      notes: payload.notes ? String(payload.notes) : null,
      effectiveFrom: payload.effectiveFrom ? new Date(String(payload.effectiveFrom)) : new Date(),
      active: true
    })
    .returning();

  return {
    ok: true,
    commandId,
    affectedIds: [relationship.id],
    toast: 'Referee relationship added.'
  };
}

/**
 * Update referee relationship
 */
export async function updateRefereeRelationship(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const relationshipId = String(payload.relationshipId);

  const updates: any = {};
  if (payload.feeType !== undefined) updates.feeType = String(payload.feeType);
  if (payload.feePercentage !== undefined) updates.feePercentage = payload.feePercentage ? String(payload.feePercentage) : null;
  if (payload.feeFixedAmount !== undefined) updates.feeFixedAmount = payload.feeFixedAmount ? String(payload.feeFixedAmount) : null;
  if (payload.applyByDefault !== undefined) updates.applyByDefault = Boolean(payload.applyByDefault);
  if (payload.notes !== undefined) updates.notes = payload.notes ? String(payload.notes) : null;
  if (payload.active !== undefined) updates.active = Boolean(payload.active);

  await tx
    .update(refereeRelationships)
    .set(updates)
    .where(eq(refereeRelationships.id, relationshipId));

  return {
    ok: true,
    commandId,
    affectedIds: [relationshipId],
    toast: 'Referee relationship updated.'
  };
}

/**
 * Deactivate referee relationship
 */
export async function deactivateRefereeRelationship(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const relationshipId = String(payload.relationshipId);

  await tx
    .update(refereeRelationships)
    .set({
      active: false,
      effectiveUntil: new Date()
    })
    .where(eq(refereeRelationships.id, relationshipId));

  return {
    ok: true,
    commandId,
    affectedIds: [relationshipId],
    toast: 'Referee relationship deactivated.'
  };
}

/**
 * Void referee credit (command version)
 */
export async function voidRefereeCreditCommand(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const creditId = String(payload.creditId);
  const reason = String(payload.reason);

  await voidRefereeCredit(tx, creditId, reason);

  return {
    ok: true,
    commandId,
    affectedIds: [creditId],
    toast: 'Referee credit voided.'
  };
}
