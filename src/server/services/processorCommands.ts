import { eq } from 'drizzle-orm';
import { paymentProcessors, processorFees } from '../schema';
import type { PaymentProcessor } from '../schema';
import type { CommandResult } from '../../shared/types';

type Tx = any;
type Payload = Record<string, unknown>;

/**
 * Calculate processing fee based on processor configuration
 * @param amount - Transaction amount in dollars (must be >= 0)
 * @param processor - Payment processor with fee configuration
 * @returns Processing fee in dollars (rounded to 2 decimals)
 * @throws {Error} If amount is negative, fee type is invalid, or required fee fields are missing
 */
export function calculateProcessingFee(
  amount: number,
  processor: PaymentProcessor
): number {
  if (amount < 0) {
    throw new Error('Transaction amount cannot be negative');
  }

  if (!processor.feeType) {
    throw new Error('Processor must have a fee type configured');
  }

  switch (processor.feeType) {
    case 'percentage':
      if (processor.feePercentage == null) {
        throw new Error('Fee percentage is required for percentage fee type');
      }
      return Math.round((amount * Number(processor.feePercentage) / 100) * 100) / 100;

    case 'fixed':
      if (processor.feeFixedAmount == null) {
        throw new Error('Fee fixed amount is required for fixed fee type');
      }
      return Number(processor.feeFixedAmount);

    case 'hybrid':
      if (processor.feePercentage == null || processor.feeFixedAmount == null) {
        throw new Error('Both fee percentage and fixed amount are required for hybrid fee type');
      }
      const percentPart = Math.round((amount * Number(processor.feePercentage) / 100) * 100) / 100;
      return percentPart + Number(processor.feeFixedAmount);

    default:
      throw new Error(`Invalid fee type: ${processor.feeType}`);
  }
}

/**
 * Split processing fee between user and processor
 * @param feeTotal - Total fee amount in dollars
 * @param userSplitPercent - Percentage of fee allocated to user (0-100)
 * @returns Split allocation with both shares rounded to 2 decimals
 * @throws {Error} If userSplitPercent is outside 0-100 range
 */
export function splitProcessingFee(
  feeTotal: number,
  userSplitPercent: number
): { userShare: number; processorShare: number } {
  if (userSplitPercent < 0 || userSplitPercent > 100) {
    throw new Error('User split percent must be between 0 and 100');
  }

  const userShare = Math.round((feeTotal * userSplitPercent / 100) * 100) / 100;
  const processorShare = Math.round((feeTotal - userShare) * 100) / 100;

  return { userShare, processorShare };
}

/**
 * Calculate customer credit amount for cash-in transactions
 * @param grossAmount - Total transaction amount in dollars
 * @param processorFeeShare - Processor's portion of the fee
 * @param userFeeShare - User's portion of the fee
 * @returns Net credit amount after deducting fees (rounded to 2 decimals)
 */
export function calculateCustomerCredit(
  grossAmount: number,
  processorFeeShare: number,
  userFeeShare: number
): number {
  return Math.round((grossAmount - processorFeeShare - userFeeShare) * 100) / 100;
}

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Create a new payment processor
 * @param tx - Database transaction
 * @param payload - Processor configuration
 * @param commandId - Command identifier
 * @returns Command result with created processor ID
 * @throws {Error} If validation fails
 */
export async function createPaymentProcessor(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  // Validation
  if (payload.feeType === 'percentage' && payload.feePercentage == null) {
    throw new Error('Percentage fee required for percentage fee type');
  }
  if (payload.feeType === 'fixed' && payload.feeFixedAmount == null) {
    throw new Error('Fixed amount required for fixed fee type');
  }
  if (payload.feeType === 'hybrid' && (payload.feePercentage == null || payload.feeFixedAmount == null)) {
    throw new Error('Both percentage and fixed amount required for hybrid fee type');
  }
  if (payload.feePercentage != null && Number(payload.feePercentage) < 0) {
    throw new Error('Fee percentage cannot be negative');
  }
  if (payload.feeFixedAmount != null && Number(payload.feeFixedAmount) < 0) {
    throw new Error('Fee fixed amount cannot be negative');
  }
  if (Number(payload.defaultUserSplit) < 0 || Number(payload.defaultProcessorSplit) < 0) {
    throw new Error('Split percentages cannot be negative');
  }
  if (Number(payload.defaultUserSplit) + Number(payload.defaultProcessorSplit) !== 100) {
    throw new Error('User split and processor split must add up to 100%');
  }

  const [processor] = await tx
    .insert(paymentProcessors)
    .values({
      name: String(payload.name),
      processorType: String(payload.processorType),
      feeType: String(payload.feeType),
      feePercentage: payload.feePercentage ? String(payload.feePercentage) : null,
      feeFixedAmount: payload.feeFixedAmount ? String(payload.feeFixedAmount) : null,
      defaultUserSplit: String(payload.defaultUserSplit),
      defaultProcessorSplit: String(payload.defaultProcessorSplit),
      notes: payload.notes ? String(payload.notes) : null,
      active: true
    })
    .returning();

  return {
    ok: true,
    commandId,
    affectedIds: [processor.id],
    toast: `Processor "${processor.name}" created.`
  };
}

/**
 * Mark user fee as collected
 * @param tx - Database transaction
 * @param payload - Contains processorFeeId and optional collectedAt date
 * @param commandId - Command identifier
 * @returns Command result
 */
export async function markUserFeeCollected(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  let collectedDate = new Date();
  if (payload.collectedAt) {
    collectedDate = new Date(String(payload.collectedAt));
    if (isNaN(collectedDate.getTime())) {
      throw new Error('Invalid collectedAt date format');
    }
  }

  await tx
    .update(processorFees)
    .set({
      userFeeStatus: 'collected',
      userFeeCollectedAt: collectedDate
    })
    .where(eq(processorFees.id, String(payload.processorFeeId)));

  // Verify the update worked
  const [updated] = await tx
    .select()
    .from(processorFees)
    .where(eq(processorFees.id, String(payload.processorFeeId)));

  if (!updated) {
    throw new Error('Processor fee not found');
  }

  return {
    ok: true,
    commandId,
    affectedIds: [String(payload.processorFeeId)],
    toast: 'User fee marked as collected.'
  };
}

/**
 * Update processor fee status (paid/unpaid)
 * @param tx - Database transaction
 * @param payload - Contains processorFeeId and status
 * @param commandId - Command identifier
 * @returns Command result
 */
export async function updateProcessorFeeStatus(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  if (payload.status !== 'paid' && payload.status !== 'unpaid') {
    throw new Error('Status must be either "paid" or "unpaid"');
  }

  await tx
    .update(processorFees)
    .set({
      processorFeeStatus: String(payload.status),
      processorFeePaidAt: payload.status === 'paid' ? new Date() : null
    })
    .where(eq(processorFees.id, String(payload.processorFeeId)));

  // Verify the update worked
  const [updated] = await tx
    .select()
    .from(processorFees)
    .where(eq(processorFees.id, String(payload.processorFeeId)));

  if (!updated) {
    throw new Error('Processor fee not found');
  }

  return {
    ok: true,
    commandId,
    affectedIds: [String(payload.processorFeeId)],
    toast: `Processor fee marked as ${payload.status}.`
  };
}
