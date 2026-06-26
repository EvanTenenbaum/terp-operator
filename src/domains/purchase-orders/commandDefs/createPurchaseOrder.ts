/**
 * createPurchaseOrder — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, userId, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createPurchaseOrderPayloadSchema } from '../schemas';
import { createPurchaseOrder } from '../commands';

defineCommand({
  name: 'createPurchaseOrder',
  input: createPurchaseOrderPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal' as const, guidance: 'Cancel or edit the draft purchase order instead.' },
  handler: (ctx, payload) => createPurchaseOrder(ctx.tx, payload as Parameters<typeof createPurchaseOrder>[1], ctx.user.id, ctx.commandId),
});
