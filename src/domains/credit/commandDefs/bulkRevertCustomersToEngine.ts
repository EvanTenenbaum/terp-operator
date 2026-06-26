/**
 * bulkRevertCustomersToEngine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, user:SessionUser, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { bulkRevertCustomersToEnginePayloadSchema } from '../schemas';
import { bulkRevertCustomersToEngine } from '../commands';

defineCommand({
  name: 'bulkRevertCustomersToEngine',
  input: bulkRevertCustomersToEnginePayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'terminal' as const, guidance: 'Bulk rollout is terminal; per-customer manual overrides can be restored individually.' },
  handler: (ctx, payload) => bulkRevertCustomersToEngine(ctx.tx, payload as any, ctx.user, ctx.commandId),
});
