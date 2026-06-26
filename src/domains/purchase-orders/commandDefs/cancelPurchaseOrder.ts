/**
 * cancelPurchaseOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { cancelPurchaseOrderPayloadSchema } from '../schemas';
import { cancelPurchaseOrder } from '../commands';

defineCommand({
  name: 'cancelPurchaseOrder',
  input: cancelPurchaseOrderPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal' as const, guidance: 'Cancelled purchase orders require a new order or explicit correction.' },
  handler: (ctx, payload) => cancelPurchaseOrder(ctx.tx, payload as Parameters<typeof cancelPurchaseOrder>[1], ctx.commandId),
});
