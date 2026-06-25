/**
 * setCustomerStance — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setCustomerStancePayloadSchema } from '../schemas';
import { setCustomerStance } from '../commands';

defineCommand({
  name: 'setCustomerStance',
  input: setCustomerStancePayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'reversible' as const, guidance: 'Call setCustomerStance with the prior stance id (or null for default).' },
  handler: (ctx, payload) => setCustomerStance(ctx.tx, payload as any, ctx.commandId),
});
