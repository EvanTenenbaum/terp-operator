/**
 * scheduleVendorPayment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Handler imported from @/domains/payments.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { scheduleVendorPaymentPayloadSchema } from '../schemas';
import { scheduleVendorPayment } from '@/domains/payments';

defineCommand({
  name: 'scheduleVendorPayment',
  input: scheduleVendorPaymentPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable', guidance: 'Reschedule the vendor bill or void the scheduled event.' },
  handler: (ctx, payload) => scheduleVendorPayment(ctx.tx, payload as any, ctx.commandId),
});
