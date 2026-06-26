/**
 * logPayment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { logPaymentPayloadSchema } from '../schemas';
import { logPayment } from '../commands';

defineCommand({
  name: 'logPayment',
  input: logPaymentPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible', guidance: 'Reverses unapplied payment logs and buyer-credit balance impact.' },
  handler: (ctx, payload) => logPayment(ctx.tx, payload as any, ctx.commandId),
});
