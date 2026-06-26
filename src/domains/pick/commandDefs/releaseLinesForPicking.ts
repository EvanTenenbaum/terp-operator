/**
 * releaseLinesForPicking — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { releaseLinesForPickingPayloadSchema } from '../schemas';
import { releaseLinesForPicking } from '../commands';

defineCommand({
  name: 'releaseLinesForPicking',
  input: releaseLinesForPickingPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Use recallLineFromPicking per line to reverse while all fulfillment lines are still open.' },
  handler: (ctx, payload) => releaseLinesForPicking(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
