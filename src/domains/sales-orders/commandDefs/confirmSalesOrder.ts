/**
 * confirmSalesOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { confirmSalesOrderPayloadSchema } from '../schemas';
import { confirmSalesOrder } from '../commands';

defineCommand({
  name: 'confirmSalesOrder',
  input: confirmSalesOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Cancel or reprice the confirmed order before posting.' },
  handler: (ctx, payload) => confirmSalesOrder(ctx.tx, payload as any, ctx.commandId),
});
