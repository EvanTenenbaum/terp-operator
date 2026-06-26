import { defineCommand } from '@/server/services/commandRegistry';
import { payWithProduct } from '../commands';
import { z } from 'zod';

const input = z.object({
  counterpartyType: z.enum(['vendor', 'customer']).default('vendor'),
  vendorId: z.string().uuid().optional(),
  vendorBillId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  lines: z.array(z.object({ batchId: z.string().uuid(), qty: z.coerce.number().positive() })).min(1),
  settlementAmount: z.coerce.number().nonnegative().optional(),
  overrideReason: z.string().min(1).optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
}).refine(d => d.counterpartyType === 'vendor' ? !!d.vendorId : !!d.customerId, {
  message: 'vendorId or customerId required based on counterpartyType',
}).refine(d => !(d.counterpartyType === 'customer' && d.vendorBillId), {
  message: 'vendorBillId is invalid for customer counterparty',
});

defineCommand({
  name: 'payWithProduct',
  input,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Restores batch qty, vendor bill, and offsets gain/loss.' },
  handler: (ctx, payload) => payWithProduct(ctx.tx, payload, ctx.user, ctx.commandId),
});
