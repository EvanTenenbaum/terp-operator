/**
 * publishBatchMedia — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { publishBatchMediaPayloadSchema } from '../schemas';
import { publishBatchMedia } from '../commands';

defineCommand({
  name: 'publishBatchMedia',
  input: publishBatchMediaPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Replace or delete the published media row; publish is not reversed via the bus.' },
  handler: (ctx, payload) => publishBatchMedia(ctx.tx, payload as any, ctx.commandId),
});
