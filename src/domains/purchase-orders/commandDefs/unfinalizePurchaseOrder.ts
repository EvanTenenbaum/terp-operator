/**
 * unfinalizePurchaseOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { unfinalizePurchaseOrderPayloadSchema } from '../schemas';
import { unfinalizePurchaseOrder } from '../commands';

defineCommand({
  name: 'unfinalizePurchaseOrder',
  input: unfinalizePurchaseOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Returns the finalized purchase order to draft state for editing.' },
  handler: (ctx, payload) => unfinalizePurchaseOrder(ctx.tx, payload as Parameters<typeof unfinalizePurchaseOrder>[1], ctx.commandId),
});
