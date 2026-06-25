/**
 * createVendorBill — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createVendorBillPayloadSchema } from '../schemas';
import { createVendorBill } from '../commands';

defineCommand({
  name: 'createVendorBill',
  input: createVendorBillPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'reversible', guidance: 'Marks generated vendor bill rows reversed.' },
  handler: (ctx, payload) => createVendorBill(ctx.tx, payload as any, ctx.commandId),
});
