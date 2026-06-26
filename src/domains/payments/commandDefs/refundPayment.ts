/**
 * refundPayment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { refundPaymentPayloadSchema } from '../schemas';
import { refundPayment } from '../commands';

defineCommand({
  name: 'refundPayment',
  input: refundPaymentPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Refunds are terminal money movement records; use a correction entry for mistakes.' },
  handler: (ctx, payload) => refundPayment(ctx.tx, payload as any, ctx.commandId),
});
