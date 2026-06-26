/**
 * deleteBatch — registered command definition.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { deleteBatchPayloadSchema } from '../schemas';
import { deleteBatch } from '../commands';

defineCommand({
  name: 'deleteBatch',
  input: deleteBatchPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Deleted drafts are not reconstructed by command reversal.' },
  handler: (ctx, payload) => deleteBatch(ctx.tx, payload as any, ctx.commandId),
});
