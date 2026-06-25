/**
 * deleteBatchMedia — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { deleteBatchMediaPayloadSchema } from '../schemas';
import { deleteBatchMedia } from '../commands';

defineCommand({
  name: 'deleteBatchMedia',
  input: deleteBatchMediaPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Re-upload the media via uploadBatchMedia if the deletion was accidental.' },
  handler: (ctx, payload) => deleteBatchMedia(ctx.tx, payload as any, ctx.commandId),
});
