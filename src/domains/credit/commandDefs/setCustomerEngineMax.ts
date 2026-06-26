/**
 * setCustomerEngineMax — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setCustomerEngineMaxPayloadSchema } from '../schemas';
import { setCustomerEngineMax } from '../commands';

defineCommand({
  name: 'setCustomerEngineMax',
  input: setCustomerEngineMaxPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Call setCustomerEngineMax again with the prior cap or null to clear it.' },
  handler: (ctx, payload) => setCustomerEngineMax(ctx.tx, payload as any, ctx.commandId),
});
