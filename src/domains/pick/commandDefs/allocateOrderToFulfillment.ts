/**
 * allocateOrderToFulfillment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { allocateOrderToFulfillmentPayloadSchema } from '../schemas';
import { allocateOrderToFulfillment } from '../commands';

defineCommand({
  name: 'allocateOrderToFulfillment',
  input: allocateOrderToFulfillmentPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Use fulfillment line/order controls before fulfillment is completed.' },
  handler: (ctx, payload) => allocateOrderToFulfillment(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
