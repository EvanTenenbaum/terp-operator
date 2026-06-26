/**
 * releaseLineForPicking — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { releaseLineForPickingPayloadSchema } from '../schemas';
import { releaseLineForPicking } from '../commands';

defineCommand({
  name: 'releaseLineForPicking',
  input: releaseLineForPickingPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Use recallLineFromPicking to reverse while the fulfillment line is still open.' },
  handler: (ctx, payload) => releaseLineForPicking(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
