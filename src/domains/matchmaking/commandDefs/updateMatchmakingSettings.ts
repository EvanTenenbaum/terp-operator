/**
 * updateMatchmakingSettings — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateMatchmakingSettingsPayloadSchema } from '../schemas';
import { updateMatchmakingSettings } from '../commands';

defineCommand({
  name: 'updateMatchmakingSettings',
  input: updateMatchmakingSettingsPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Run updateMatchmakingSettings again with the intended values.' },
  handler: (ctx, payload) => updateMatchmakingSettings(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
