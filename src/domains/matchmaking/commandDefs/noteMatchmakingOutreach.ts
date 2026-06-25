/**
 * noteMatchmakingOutreach — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { noteMatchmakingOutreachPayloadSchema } from '../schemas';
import { noteMatchmakingOutreach } from '../commands';

defineCommand({
  name: 'noteMatchmakingOutreach',
  input: noteMatchmakingOutreachPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Outreach notes are informational audit records; the snooze expires automatically after 30 days.' },
  handler: (ctx, payload) => noteMatchmakingOutreach(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
