/**
 * Payments domain — curated re-exports.
 *
 * Consumers (e.g. commandBus.runCommand switch) should import handlers from
 * this barrel rather than reaching into commands.ts directly.
 */

export {
  allocatePayment,
  applyClientCredit,
  applyDiscount,
  logPayment,
  markPaymentUnapplied,
  recordVendorPayment,
  refundPayment,
  scheduleVendorPayment,
  unallocatePayment,
  voidVendorPayment,
} from './commands';

// markUserFeeCollected lives in processorCommands.ts (payment-processor
// fee bookkeeping). Re-export it through this barrel so the payments domain
// surfaces all 11 payment-family commands listed in
// docs/engineering-plans/function-route-mapping.md.
export { markUserFeeCollected } from '@/server/services/processorCommands';
