/**
 * addSalesOrderLine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { addSalesOrderLinePayloadSchema } from '../schemas';
import { addSalesOrderLine } from '../commands';

defineCommand({
  name: 'addSalesOrderLine',
  input: addSalesOrderLinePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Remove the order line before posting.' },
  handler: (ctx, payload) => addSalesOrderLine(ctx.tx, payload as any, ctx.commandId),
});
