/**
 * repriceOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * ALIAS: calls priceSalesOrder with a different toast string.
 * Signature: (tx, payload, commandId, 'Order repriced.')
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { repriceOrderPayloadSchema } from '../schemas';
import { priceSalesOrder } from '../commands';

defineCommand({
  name: 'repriceOrder',
  input: repriceOrderPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable' as const, guidance: 'Run repriceOrder again with the intended strategy.' },
  handler: (ctx, payload) => priceSalesOrder(ctx.tx, payload as any, ctx.commandId, 'Order repriced.'),
});
