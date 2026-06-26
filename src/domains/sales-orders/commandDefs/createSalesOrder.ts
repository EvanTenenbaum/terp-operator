/**
 * createSalesOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createSalesOrderPayloadSchema } from '../schemas';
import { createSalesOrder } from '../commands';

defineCommand({
  name: 'createSalesOrder',
  input: createSalesOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Cancel or edit the draft order instead.' },
  handler: (ctx, payload) => createSalesOrder(ctx.tx, payload as any, ctx.commandId),
});
