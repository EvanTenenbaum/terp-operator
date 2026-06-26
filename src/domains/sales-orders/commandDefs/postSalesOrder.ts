/**
 * postSalesOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { postSalesOrderPayloadSchema } from '../schemas';
import { postSalesOrder } from '../commands';

defineCommand({
  name: 'postSalesOrder',
  input: postSalesOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Restores inventory, reverses generated invoice impact, and marks the order reversed.' },
  handler: (ctx, payload) => postSalesOrder(ctx.tx, payload as any, ctx.commandId),
});
