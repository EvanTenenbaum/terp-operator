/**
 * createVendor — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { createVendorPayloadSchema } from '../schemas';
import { createVendor } from '../commands';

defineCommand({
  name: 'createVendor',
  input: createVendorPayloadSchema,
  rbac: { minimumRole: 'operator' },
  reversal: { disposition: 'terminal', guidance: 'Edit the vendor profile or deactivate it if it was created by mistake.' },
  handler: (ctx, payload) => createVendor(ctx.tx, payload as any, ctx.commandId),
});
