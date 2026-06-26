/**
 * reserveInventoryForOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { reserveInventoryForOrderPayloadSchema } from '../schemas';
import { reserveInventoryForOrder } from '../commands';

defineCommand({
  name: 'reserveInventoryForOrder',
  input: reserveInventoryForOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Cancel the sales order or manually release reservations through order correction.' },
  handler: (ctx, payload) => reserveInventoryForOrder(ctx.tx, payload as any, ctx.commandId),
});
