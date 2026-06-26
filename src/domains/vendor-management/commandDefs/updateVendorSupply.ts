/**
 * updateVendorSupply — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateVendorSupplyPayloadSchema } from '../schemas';
import { updateVendorSupply } from '../commands';

defineCommand({
  name: 'updateVendorSupply',
  input: updateVendorSupplyPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Use another update with the intended vendor stock values.' },
  handler: (ctx, payload) => updateVendorSupply(ctx.tx, payload as any, ctx.commandId),
});
