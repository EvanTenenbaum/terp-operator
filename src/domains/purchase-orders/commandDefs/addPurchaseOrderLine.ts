/**
 * addPurchaseOrderLine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { addPurchaseOrderLinePayloadSchema } from '../schemas';
import { addPurchaseOrderLine } from '../commands';

defineCommand({
  name: 'addPurchaseOrderLine',
  input: addPurchaseOrderLinePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Remove the unreceived purchase order line instead.' },
  handler: (ctx, payload) => addPurchaseOrderLine(ctx.tx, payload as Parameters<typeof addPurchaseOrderLine>[1], ctx.commandId),
});
