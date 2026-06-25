/**
 * setBatchMediaRole — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setBatchMediaRolePayloadSchema } from '../schemas';
import { setBatchMediaRole } from '../commands';

defineCommand({
  name: 'setBatchMediaRole',
  input: setBatchMediaRolePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Run setBatchMediaRole again with the intended role value.' },
  handler: (ctx, payload) => setBatchMediaRole(ctx.tx, payload as any, ctx.commandId),
});
