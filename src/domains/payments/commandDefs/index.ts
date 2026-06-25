/**
 * Payments command definitions — barrel.
 *
 * Importing this module triggers defineCommand() side effects that
 * populate the command registry. No explicit re-exports needed;
 * each command file self-registers.
 */
import './applyClientCredit';
import './logPayment';
import './allocatePayment';
import './unallocatePayment';
import './refundPayment';
import './markPaymentUnapplied';
import './applyDiscount';
import './markUserFeeCollected';
