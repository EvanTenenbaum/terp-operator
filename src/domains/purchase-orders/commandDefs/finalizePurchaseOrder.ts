/**
 * finalizePurchaseOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { finalizePurchaseOrderPayloadSchema } from '../schemas';
import { finalizePurchaseOrder } from '../commands';

defineCommand({
  name: 'finalizePurchaseOrder',
  input: finalizePurchaseOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Returns the purchase order to draft state when it has not been approved.' },
  handler: (ctx, payload) => finalizePurchaseOrder(ctx.tx, payload as Parameters<typeof finalizePurchaseOrder>[1], ctx.user.id, ctx.commandId),
});
