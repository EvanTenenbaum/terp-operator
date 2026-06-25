/**
 * approveVendorBill — registered command definition (alias for updateVendorBillStatus).
 *
 * Migrated from commandBus.ts switch case.
 * This is a thin alias that delegates to updateVendorBillStatus with fixed status and toast.
 */
import { defineCommand } from '@/server/services/commandRegistry';
import { approveVendorBillPayloadSchema } from '../schemas';
import { updateVendorBillStatus } from '../commands';

defineCommand({
  name: 'approveVendorBill',
  input: approveVendorBillPayloadSchema,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'offsettable', guidance: 'Update or void the vendor bill status through payable controls.' },
  handler: (ctx, payload) => updateVendorBillStatus(ctx.tx, payload as any, 'approved', ctx.commandId, 'Vendor bill approved.'),
});
