/**
 * setCreditEngineConfig — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId:string, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setCreditEngineConfigPayloadSchema } from '../schemas';
import { setCreditEngineConfig } from '../commands';

defineCommand({
  name: 'setCreditEngineConfig',
  input: setCreditEngineConfigPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'reversible' as const, guidance: 'Call setCreditEngineConfig again with the prior values from config history.' },
  handler: (ctx, payload) => setCreditEngineConfig(ctx.tx, payload as any, ctx.user.id, ctx.commandId),
});
