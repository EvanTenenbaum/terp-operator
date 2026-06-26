/**
 * cancelSalesOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { cancelSalesOrderPayloadSchema } from '../schemas';
import { cancelSalesOrder } from '../commands';

defineCommand({
  name: 'cancelSalesOrder',
  input: cancelSalesOrderPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal' as const, guidance: 'Cancelled orders require a new order or correction journal.' },
  handler: (ctx, payload) => cancelSalesOrder(ctx.tx, payload as any, ctx.commandId),
});
