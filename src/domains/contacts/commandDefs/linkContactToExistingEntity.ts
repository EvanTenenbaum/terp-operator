/**
 * linkContactToExistingEntity — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { linkContactToExistingEntityPayloadSchema } from '../schemas';
import { linkContactToExistingEntity } from '../commands';

defineCommand({
  name: 'linkContactToExistingEntity',
  input: linkContactToExistingEntityPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Unlink by clearing the entity row contact_id via an admin path.' },
  handler: (ctx, payload) => linkContactToExistingEntity(ctx.tx, payload as Parameters<typeof linkContactToExistingEntity>[1], ctx.commandId),
});
