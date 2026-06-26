/**
 * attachBatchPhoto — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { attachBatchPhotoPayloadSchema } from '../schemas';
import { attachBatchPhoto } from '../commands';

defineCommand({
  name: 'attachBatchPhoto',
  input: attachBatchPhotoPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Replace or clear media through an explicit media correction.' },
  handler: (ctx, payload) => attachBatchPhoto(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
