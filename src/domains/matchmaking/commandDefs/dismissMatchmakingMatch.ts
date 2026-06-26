/**
 * dismissMatchmakingMatch — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Alias: delegates to reviewMatchmakingMatch with status='dismissed'.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { dismissMatchmakingMatchPayloadSchema } from '../schemas';
import { reviewMatchmakingMatch } from '../commands';

defineCommand({
  name: 'dismissMatchmakingMatch',
  input: dismissMatchmakingMatchPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Accept a new or reopened match if the dismissal was accidental.' },
  handler: (ctx, payload) => reviewMatchmakingMatch(ctx.tx, payload as any, 'dismissed', ctx.user.id, ctx.commandId),
});
