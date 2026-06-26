/**
 * acceptMatchmakingMatch — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Alias: delegates to reviewMatchmakingMatch with status='accepted'.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { acceptMatchmakingMatchPayloadSchema } from '../schemas';
import { reviewMatchmakingMatch } from '../commands';

defineCommand({
  name: 'acceptMatchmakingMatch',
  input: acceptMatchmakingMatchPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Dismiss the match or reopen the need/supply from the matchmaking grid.' },
  handler: (ctx, payload) => reviewMatchmakingMatch(ctx.tx, payload as any, 'accepted', ctx.user.id, ctx.commandId),
});
