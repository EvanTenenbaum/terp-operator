/**
 * updateBatch — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateBatchPayloadSchema } from '../schemas';
import { updateBatch } from '../commands';

defineCommand({
  name: 'updateBatch',
  input: updateBatchPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Use another update command with the intended field values.' },
  handler: (ctx, payload) => updateBatch(ctx.tx, payload as any, ctx.commandId),
});
