/**
 * revokePhotoUploadToken — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { revokePhotoUploadTokenPayloadSchema } from '../schemas';
import { revokePhotoUploadToken } from '../commands';

defineCommand({
  name: 'revokePhotoUploadToken',
  input: revokePhotoUploadTokenPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal' as const, guidance: 'Mint a new photo upload share link if the revoke was accidental — the previous raw token is unrecoverable.' },
  handler: (ctx, payload) => revokePhotoUploadToken(ctx.tx, payload as any, ctx.commandId),
});
