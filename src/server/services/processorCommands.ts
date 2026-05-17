import type { PaymentProcessor } from '../schema';

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
