/**
 * createCreditEngineStance — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId:string, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createCreditEngineStancePayloadSchema } from '../schemas';
import { createCreditEngineStance } from '../commands';

defineCommand({
  name: 'createCreditEngineStance',
  input: createCreditEngineStancePayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'reversible' as const, guidance: 'Delete the stance if it was created by mistake (only allowed when unused).' },
  handler: (ctx, payload) => createCreditEngineStance(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
