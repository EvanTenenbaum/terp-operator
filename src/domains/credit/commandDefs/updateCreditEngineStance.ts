/**
 * updateCreditEngineStance — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId:string, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateCreditEngineStancePayloadSchema } from '../schemas';
import { updateCreditEngineStance } from '../commands';

defineCommand({
  name: 'updateCreditEngineStance',
  input: updateCreditEngineStancePayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'reversible' as const, guidance: 'Call updateCreditEngineStance again with the prior values from stance history.' },
  handler: (ctx, payload) => updateCreditEngineStance(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
