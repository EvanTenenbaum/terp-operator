/**
 * createContact — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createContactPayloadSchema } from '../schemas';
import { createContact } from '../commands';

defineCommand({
  name: 'createContact',
  input: createContactPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Use archiveContact to deactivate; new contacts cannot be unbuilt.' },
  handler: (ctx, payload) => createContact(ctx.tx, payload as Parameters<typeof createContact>[1], ctx.commandId),
});
