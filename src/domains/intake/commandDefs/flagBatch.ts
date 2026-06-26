/**
 * flagBatch — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { flagBatchPayloadSchema } from '../schemas';
import { flagBatch } from '../commands';

defineCommand({
  name: 'flagBatch',
  input: flagBatchPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Flags add to the validation issues queue; resolve by editing the batch fields.' },
  handler: (ctx, payload) => flagBatch(ctx.tx, payload as any, ctx.commandId),
});
