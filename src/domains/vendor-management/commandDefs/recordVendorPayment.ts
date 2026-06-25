/**
 * recordVendorPayment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Handler imported from @/domains/payments.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { recordVendorPaymentPayloadSchema } from '../schemas';
import { recordVendorPayment } from '@/domains/payments';

defineCommand({
  name: 'recordVendorPayment',
  input: recordVendorPaymentPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Voids the vendor payment and restores payable amount paid.' },
  handler: (ctx, payload) => recordVendorPayment(ctx.tx, payload as any, ctx.commandId),
});
