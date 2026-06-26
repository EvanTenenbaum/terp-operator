/**
 * disableCreditEngineForCustomer — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId:string, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { disableCreditEngineForCustomerPayloadSchema } from '../schemas';
import { disableCreditEngineForCustomer } from '../commands';

defineCommand({
  name: 'disableCreditEngineForCustomer',
  input: disableCreditEngineForCustomerPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'reversible' as const, guidance: 'Use enableCreditEngineForCustomer to restore engine processing.' },
  handler: (ctx, payload) => disableCreditEngineForCustomer(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
