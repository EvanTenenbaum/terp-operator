/**
 * createBatch — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createBatchPayloadSchema } from '../schemas';
import { createBatch } from '../commands';

defineCommand({
  name: 'createBatch',
  input: createBatchPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Draft batches are deleted or edited directly before posting.' },
  handler: (ctx, payload) => createBatch(ctx.tx, payload as any, ctx.commandId),
});
