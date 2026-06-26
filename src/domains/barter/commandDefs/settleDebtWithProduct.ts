import { defineCommand } from '@/server/services/commandRegistry';
import { settleDebtWithProduct } from '../commands';
import { z } from 'zod';

const input = z.object({
  customerId: z.string().uuid(),
  lines: z.array(z.object({
    productName: z.string().min(1),
    qty: z.coerce.number().positive(),
    unitCost: z.coerce.number().nonnegative(),
    category: z.string().optional(),
    brandId: z.string().uuid().optional(),
  })).min(1),
  settlementAmount: z.coerce.number().nonnegative().optional(),
  overrideReason: z.string().min(1).optional(),
  allocationIntent: z.enum(['fifo', 'selected_invoice', 'unapplied']).optional(),
  invoiceId: z.string().uuid().optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
});

defineCommand({
  name: 'settleDebtWithProduct',
  input,
  rbac: { minimumRole: 'manager' },
  reversal: { disposition: 'reversible', guidance: 'Restores customer balance, vendor bill, and PO.' },
  handler: (ctx, payload) => settleDebtWithProduct(ctx.tx, payload as Parameters<typeof settleDebtWithProduct>[1], ctx.user, ctx.commandId),
});
