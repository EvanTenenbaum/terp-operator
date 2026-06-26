/**
 * addContactRole — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { addContactRolePayloadSchema } from '../schemas';
import { addContactRole } from '../commands';

defineCommand({
  name: 'addContactRole',
  input: addContactRolePayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal' as const, guidance: 'Role additions are append-only; do not remove roles via reversal.' },
  handler: (ctx, payload) => addContactRole(ctx.tx, payload as Parameters<typeof addContactRole>[1], ctx.commandId),
});
