/**
 * updateVendor — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { updateVendorPayloadSchema } from '../schemas';
import { updateVendor } from '../commands';

defineCommand({
  name: 'updateVendor',
  input: updateVendorPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'offsettable', guidance: 'Run updateVendor again with the prior values.' },
  handler: (ctx, payload) => updateVendor(ctx.tx, payload as any, ctx.commandId),
});
