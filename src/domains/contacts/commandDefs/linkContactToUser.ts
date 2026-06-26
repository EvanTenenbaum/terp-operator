/**
 * linkContactToUser — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { linkContactToUserPayloadSchema } from '../schemas';
import { linkContactToUser } from '../commands';

defineCommand({
  name: 'linkContactToUser',
  input: linkContactToUserPayloadSchema,
  rbac: { minimumRole: 'owner' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Unlink by clearing users.contact_id via an admin path.' },
  handler: (ctx, payload) => linkContactToUser(ctx.tx, payload as Parameters<typeof linkContactToUser>[1], ctx.commandId),
});
