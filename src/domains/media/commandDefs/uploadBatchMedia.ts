/**
 * uploadBatchMedia — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { uploadBatchMediaPayloadSchema } from '../schemas';
import { uploadBatchMedia } from '../commands';

defineCommand({
  name: 'uploadBatchMedia',
  input: uploadBatchMediaPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Delete the media row via deleteBatchMedia if uploaded by mistake.' },
  handler: (ctx, payload) => uploadBatchMedia(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
