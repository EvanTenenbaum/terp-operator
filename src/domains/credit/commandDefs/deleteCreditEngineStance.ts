/**
 * deleteCreditEngineStance — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId:string, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { deleteCreditEngineStancePayloadSchema } from '../schemas';
import { deleteCreditEngineStance } from '../commands';

defineCommand({
  name: 'deleteCreditEngineStance',
  input: deleteCreditEngineStancePayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'terminal' as const, guidance: 'Deleted stances cannot be reconstructed; recreate the stance with createCreditEngineStance if needed.' },
  handler: (ctx, payload) => deleteCreditEngineStance(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
