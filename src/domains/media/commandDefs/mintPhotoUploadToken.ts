/**
 * mintPhotoUploadToken — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { mintPhotoUploadTokenPayloadSchema } from '../schemas';
import { mintPhotoUploadToken } from '../commands';

defineCommand({
  name: 'mintPhotoUploadToken',
  input: mintPhotoUploadTokenPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Use revokePhotoUploadToken with the returned tokenId to invalidate the share link immediately.' },
  handler: (ctx, payload) => mintPhotoUploadToken(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
