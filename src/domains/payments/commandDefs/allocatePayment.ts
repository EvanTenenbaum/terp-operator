/**
 * allocatePayment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { allocatePaymentPayloadSchema } from '../schemas';
import { allocatePayment } from '../commands';

defineCommand({
  name: 'allocatePayment',
  input: allocatePaymentPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible', guidance: 'Deletes payment allocations and restores invoice/payment/customer balances.' },
  handler: (ctx, payload) => allocatePayment(ctx.tx, payload as any, ctx.commandId),
});
