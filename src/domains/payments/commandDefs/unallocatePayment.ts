/**
 * unallocatePayment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { unallocatePaymentPayloadSchema } from '../schemas';
import { unallocatePayment } from '../commands';

defineCommand({
  name: 'unallocatePayment',
  input: unallocatePaymentPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Re-allocate the payment if this was accidental.' },
  handler: (ctx, payload) => unallocatePayment(ctx.tx, payload as any, ctx.commandId),
});
