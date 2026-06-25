/**
 * rejectBatch — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { rejectBatchPayloadSchema } from '../schemas';
import { rejectBatch } from '../commands';

defineCommand({
  name: 'rejectBatch',
  input: rejectBatchPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Rejected intake lots stay terminal; create a new intake row or correction if needed.' },
  handler: (ctx, payload) => rejectBatch(ctx.tx, payload as any, ctx.commandId),
});
