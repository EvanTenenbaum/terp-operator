/**
 * adjustBatchQuantity — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { adjustBatchQuantityPayloadSchema } from '../schemas';
import { adjustBatchQuantity } from '../commands';

defineCommand({
  name: 'adjustBatchQuantity',
  input: adjustBatchQuantityPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable', guidance: 'Post an equal opposite quantity adjustment with a reason.' },
  handler: (ctx, payload) => adjustBatchQuantity(ctx.tx, payload as any, ctx.commandId, ctx.reason),
});
