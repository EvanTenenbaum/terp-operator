/**
 * archiveContact — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, user, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { archiveContactPayloadSchema } from '../schemas';
import { archiveContact } from '../commands';

defineCommand({
  name: 'archiveContact',
  input: archiveContactPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal' as const, guidance: 'Cannot be reversed; create a new contact if archiving was a mistake.' },
  handler: (ctx, payload) => archiveContact(ctx.tx, payload as Parameters<typeof archiveContact>[1], ctx.user, ctx.commandId),
});
