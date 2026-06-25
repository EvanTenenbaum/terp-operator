/**
 * setCustomerCreditLimit — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, user:SessionUser, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setCustomerCreditLimitPayloadSchema } from '../schemas';
import { setCustomerCreditLimit } from '../commands';

defineCommand({
  name: 'setCustomerCreditLimit',
  input: setCustomerCreditLimitPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Use revertCustomerCreditToEngine to clear the manual override.' },
  handler: (ctx, payload) => setCustomerCreditLimit(ctx.tx, payload as any, ctx.user, ctx.commandId),
});
