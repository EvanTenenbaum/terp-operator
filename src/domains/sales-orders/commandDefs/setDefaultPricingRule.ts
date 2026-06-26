/**
 * setDefaultPricingRule — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setDefaultPricingRulePayloadSchema } from '../schemas';
import { setDefaultPricingRule } from '../commands';

defineCommand({
  name: 'setDefaultPricingRule',
  input: setDefaultPricingRulePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Restores the prior default pricing rule from the command snapshot.' },
  handler: (ctx, payload) => setDefaultPricingRule(ctx.tx, payload as any, ctx.commandId),
});
