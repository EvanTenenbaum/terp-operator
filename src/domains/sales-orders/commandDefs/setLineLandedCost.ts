/**
 * setLineLandedCost — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, user, commandId) — needs ctx.user
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setLineLandedCostPayloadSchema } from '../schemas';
import { setLineLandedCost } from '../commands';

defineCommand({
  name: 'setLineLandedCost',
  input: setLineLandedCostPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Restores the prior landed COGS, basis, and resolution flag from the command snapshot.' },
  handler: (ctx, payload) => setLineLandedCost(ctx.tx, payload as any, ctx.user, ctx.commandId),
});
