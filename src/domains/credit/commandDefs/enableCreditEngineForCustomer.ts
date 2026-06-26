/**
 * enableCreditEngineForCustomer — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { enableCreditEngineForCustomerPayloadSchema } from '../schemas';
import { enableCreditEngineForCustomer } from '../commands';

defineCommand({
  name: 'enableCreditEngineForCustomer',
  input: enableCreditEngineForCustomerPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'reversible' as const, guidance: 'Use disableCreditEngineForCustomer with a reason if disable is needed again.' },
  handler: (ctx, payload) => enableCreditEngineForCustomer(ctx.tx, payload as any, ctx.commandId),
});
