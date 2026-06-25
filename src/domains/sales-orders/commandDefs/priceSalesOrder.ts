/**
 * priceSalesOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId, toast = 'Sales order priced.')
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { priceSalesOrderPayloadSchema } from '../schemas';
import { priceSalesOrder } from '../commands';

defineCommand({
  name: 'priceSalesOrder',
  input: priceSalesOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Run repriceOrder or update line pricing with the intended strategy.' },
  handler: (ctx, payload) => priceSalesOrder(ctx.tx, payload as any, ctx.commandId, 'Sales order priced.'),
});
