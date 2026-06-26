/**
 * revertCustomerCreditToEngine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { revertCustomerCreditToEnginePayloadSchema } from '../schemas';
import { revertCustomerCreditToEngine } from '../commands';

defineCommand({
  name: 'revertCustomerCreditToEngine',
  input: revertCustomerCreditToEnginePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Apply another manual credit limit with setCustomerCreditLimit if reversion was unintended.' },
  handler: (ctx, payload) => revertCustomerCreditToEngine(ctx.tx, payload as any, ctx.commandId),
});
