/**
 * transferInventoryLocation — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId, reason?)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { transferInventoryLocationPayloadSchema } from '../schemas';
import { transferInventoryLocation } from '../commands';

defineCommand({
  name: 'transferInventoryLocation',
  input: transferInventoryLocationPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible', guidance: 'Restores the prior batch location from the command snapshot.' },
  handler: (ctx, payload) => transferInventoryLocation(ctx.tx, payload as any, ctx.commandId, ctx.reason),
});
