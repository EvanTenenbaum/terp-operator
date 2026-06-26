/**
 * approvePurchaseOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { approvePurchaseOrderPayloadSchema } from '../schemas';
import { approvePurchaseOrder } from '../commands';

defineCommand({
  name: 'approvePurchaseOrder',
  input: approvePurchaseOrderPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Returns the purchase order to finalized state when no receipt depends on it.' },
  handler: (ctx, payload) => approvePurchaseOrder(ctx.tx, payload as Parameters<typeof approvePurchaseOrder>[1], ctx.user.id, ctx.commandId),
});
