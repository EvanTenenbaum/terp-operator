/**
 * reopenMatchmakingMatch — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { reopenMatchmakingMatchPayloadSchema } from '../schemas';
import { reopenMatchmakingMatch } from '../commands';

defineCommand({
  name: 'reopenMatchmakingMatch',
  input: reopenMatchmakingMatchPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Call acceptMatchmakingMatch or dismissMatchmakingMatch to set status again.' },
  handler: (ctx, payload) => reopenMatchmakingMatch(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
