/**
 * adjustFulfillmentLine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * ALIAS: calls recordWeighAndPack with custom toast.
 * Signature: (tx, payload, commandId, 'Fulfillment line adjusted.')
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { adjustFulfillmentLinePayloadSchema } from '../schemas';
import { recordWeighAndPack } from '../commands';

defineCommand({
  name: 'adjustFulfillmentLine',
  input: adjustFulfillmentLinePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Apply another fulfillment line adjustment.' },
  handler: (ctx, payload) => recordWeighAndPack(ctx.tx, payload as any, ctx.commandId, 'Fulfillment line adjusted.'),
});
