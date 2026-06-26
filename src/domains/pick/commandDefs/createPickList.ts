/**
 * createPickList — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * ALIAS: calls allocateOrderToFulfillment with the same handler.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createPickListPayloadSchema } from '../schemas';
import { allocateOrderToFulfillment } from '../commands';

defineCommand({
  name: 'createPickList',
  input: createPickListPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Adjust fulfillment allocation before packing or create a correction.' },
  handler: (ctx, payload) => allocateOrderToFulfillment(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
