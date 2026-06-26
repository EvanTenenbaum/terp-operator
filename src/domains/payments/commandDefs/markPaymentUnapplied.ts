/**
 * markPaymentUnapplied — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { markPaymentUnappliedPayloadSchema } from '../schemas';
import { markPaymentUnapplied } from '../commands';

defineCommand({
  name: 'markPaymentUnapplied',
  input: markPaymentUnappliedPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable', guidance: 'Run logPayment with an explicit allocationIntent or use the Quick Ledger to set the intended allocation mode.' },
  handler: (ctx, payload) => markPaymentUnapplied(ctx.tx, payload as any, ctx.commandId),
});
