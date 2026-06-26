/**
 * setInventoryStatus — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId, reason?)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { setInventoryStatusPayloadSchema } from '../schemas';
import { setInventoryStatus } from '../commands';

defineCommand({
  name: 'setInventoryStatus',
  input: setInventoryStatusPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Restores the prior batch status from the command snapshot.' },
  handler: (ctx, payload) => setInventoryStatus(ctx.tx, payload as any, ctx.commandId, ctx.reason),
});
