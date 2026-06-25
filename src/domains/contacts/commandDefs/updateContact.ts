/**
 * updateContact — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateContactPayloadSchema } from '../schemas';
import { updateContact } from '../commands';

defineCommand({
  name: 'updateContact',
  input: updateContactPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Run updateContact again with the prior values.' },
  handler: (ctx, payload) => updateContact(ctx.tx, payload as Parameters<typeof updateContact>[1], ctx.commandId),
});
