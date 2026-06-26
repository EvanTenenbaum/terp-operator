/**
 * setCustomerPricingRule — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setCustomerPricingRulePayloadSchema } from '../schemas';
import { setCustomerPricingRule } from '../commands';

defineCommand({
  name: 'setCustomerPricingRule',
  input: setCustomerPricingRulePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Restores the prior customer pricing rule from the command snapshot.' },
  handler: (ctx, payload) => setCustomerPricingRule(ctx.tx, payload as any, ctx.commandId),
});
