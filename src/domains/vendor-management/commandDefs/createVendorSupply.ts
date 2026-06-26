/**
 * createVendorSupply — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createVendorSupplyPayloadSchema } from '../schemas';
import { createVendorSupply } from '../commands';

defineCommand({
  name: 'createVendorSupply',
  input: createVendorSupplyPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Close or edit the vendor stock row if it was entered by mistake.' },
  handler: (ctx, payload) => createVendorSupply(ctx.tx, payload as any, ctx.commandId),
});
