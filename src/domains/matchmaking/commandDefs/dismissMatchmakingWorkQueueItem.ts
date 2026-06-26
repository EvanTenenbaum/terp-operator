/**
 * dismissMatchmakingWorkQueueItem — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { dismissMatchmakingWorkQueueItemPayloadSchema } from '../schemas';
import { dismissMatchmakingWorkQueueItem } from '../commands';

defineCommand({
  name: 'dismissMatchmakingWorkQueueItem',
  input: dismissMatchmakingWorkQueueItemPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Dismissals expire after 30 days. Re-queue by waiting for the snooze to lapse.' },
  handler: (ctx, payload) => dismissMatchmakingWorkQueueItem(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
