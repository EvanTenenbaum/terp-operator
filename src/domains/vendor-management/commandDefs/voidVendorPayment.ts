/**
 * voidVendorPayment — registered command definition.
 *
 * Migrated from commandBus.ts switch case.
 * Handler imported from @/domains/payments.
 * Signature: (tx, payload, commandId)
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { voidVendorPaymentPayloadSchema } from '../schemas';
import { voidVendorPayment } from '@/domains/payments';

defineCommand({
  name: 'voidVendorPayment',
  input: voidVendorPaymentPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'terminal', guidance: 'Record a new vendor payment if the void was accidental.' },
  handler: (ctx, payload) => voidVendorPayment(ctx.tx, payload as any, ctx.commandId),
});
