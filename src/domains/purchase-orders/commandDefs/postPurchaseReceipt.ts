/**
 * postPurchaseReceipt — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId, reason?)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { postPurchaseReceiptPayloadSchema } from '../schemas';
import { postPurchaseReceipt } from '../commands';

defineCommand({
  name: 'postPurchaseReceipt',
  input: postPurchaseReceiptPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible' as const, guidance: 'Marks posted intake, receipt, and generated vendor bills as reversed.' },
  handler: (ctx, payload) => postPurchaseReceipt(ctx.tx, payload as Parameters<typeof postPurchaseReceipt>[1], ctx.commandId, ctx.reason),
});
