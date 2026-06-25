/**
 * updateSalesOrderLine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateSalesOrderLinePayloadSchema } from '../schemas';
import { updateSalesOrderLine } from '../commands';

defineCommand({
  name: 'updateSalesOrderLine',
  input: updateSalesOrderLinePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Use another line update with the intended field values.' },
  handler: (ctx, payload) => updateSalesOrderLine(ctx.tx, payload as any, ctx.commandId),
});
