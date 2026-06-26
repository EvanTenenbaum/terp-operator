/**
 * updatePurchaseOrderLine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updatePurchaseOrderLinePayloadSchema } from '../schemas';
import { updatePurchaseOrderLine } from '../commands';

defineCommand({
  name: 'updatePurchaseOrderLine',
  input: updatePurchaseOrderLinePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Use another line update with the intended field values.' },
  handler: (ctx, payload) => updatePurchaseOrderLine(ctx.tx, payload as Parameters<typeof updatePurchaseOrderLine>[1], ctx.commandId),
});
