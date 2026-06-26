/**
 * transferInventoryOwnership — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId, reason?)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { transferInventoryOwnershipPayloadSchema } from '../schemas';
import { transferInventoryOwnership } from '../commands';

defineCommand({
  name: 'transferInventoryOwnership',
  input: transferInventoryOwnershipPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Restores the prior batch ownership/vendor fields from the command snapshot.' },
  handler: (ctx, payload) => transferInventoryOwnership(ctx.tx, payload as any, ctx.commandId, ctx.reason),
});
