/**
 * recordVendorPrepayment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { recordVendorPrepaymentPayloadSchema } from '../schemas';
import { recordVendorPrepayment } from '../commands';

defineCommand({
  name: 'recordVendorPrepayment',
  input: recordVendorPrepaymentPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible' as const, guidance: 'Reverses the vendor payment record and restores prepayment availability.' },
  handler: (ctx, payload) => recordVendorPrepayment(ctx.tx, payload as Parameters<typeof recordVendorPrepayment>[1], ctx.commandId),
});
