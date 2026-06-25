/**
 * removePurchaseOrderLine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { removePurchaseOrderLinePayloadSchema } from '../schemas';
import { removePurchaseOrderLine } from '../commands';

defineCommand({
  name: 'removePurchaseOrderLine',
  input: removePurchaseOrderLinePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Removed unreceived lines are not reconstructed by command reversal.' },
  handler: (ctx, payload) => removePurchaseOrderLine(ctx.tx, payload as Parameters<typeof removePurchaseOrderLine>[1], ctx.commandId),
});
