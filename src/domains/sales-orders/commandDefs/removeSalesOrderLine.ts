/**
 * removeSalesOrderLine — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { removeSalesOrderLinePayloadSchema } from '../schemas';
import { removeSalesOrderLine } from '../commands';

defineCommand({
  name: 'removeSalesOrderLine',
  input: removeSalesOrderLinePayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Removed draft lines are not reconstructed by command reversal.' },
  handler: (ctx, payload) => removeSalesOrderLine(ctx.tx, payload as any, ctx.commandId),
});
