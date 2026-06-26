/**
 * updatePurchaseOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updatePurchaseOrderPayloadSchema } from '../schemas';
import { updatePurchaseOrder } from '../commands';

defineCommand({
  name: 'updatePurchaseOrder',
  input: updatePurchaseOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Use another purchase order update with the intended field values.' },
  handler: (ctx, payload) => updatePurchaseOrder(ctx.tx, payload as Parameters<typeof updatePurchaseOrder>[1], ctx.commandId),
});
