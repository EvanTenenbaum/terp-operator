/**
 * receivePurchaseOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { receivePurchaseOrderPayloadSchema } from '../schemas';
import { receivePurchaseOrder } from '../commands';

defineCommand({
  name: 'receivePurchaseOrder',
  input: receivePurchaseOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Reverses unposted draft intake rows and restores the purchase order and its lines to their prior receiving state.' },
  handler: (ctx, payload) => receivePurchaseOrder(ctx.tx, payload as Parameters<typeof receivePurchaseOrder>[1], ctx.commandId),
});
