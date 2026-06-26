import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { router, protectedProcedure } from '../trpc';
import { executeCommand } from '../services/commandBus';

export const barterRouter = router({
  payWithProduct: protectedProcedure
    .input(z.object({
      counterpartyType: z.enum(['vendor', 'customer']).default('vendor'),
      vendorId: z.string().uuid().optional(),
      vendorBillId: z.string().uuid().optional(),
      customerId: z.string().uuid().optional(),
      lines: z.array(z.object({
        batchId: z.string().uuid(),
        qty: z.number().positive(),
      })).min(1),
      settlementAmount: z.number().nonnegative().optional(),
      overrideReason: z.string().min(1).optional(),
      reason: z.string().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await executeCommand({
        name: 'payWithProduct' as const,
        idempotencyKey: randomUUID(),
        reason: input.reason ?? 'Barter product settlement issued via operator console.',
        payload: input,
      }, ctx.user, ctx.io);
      return result;
    }),

  settleDebtWithProduct: protectedProcedure
    .input(z.object({
      customerId: z.string().uuid(),
      lines: z.array(z.object({
        productName: z.string().min(1),
        qty: z.number().positive(),
        unitCost: z.number().min(0),
        category: z.string().optional(),
        brandId: z.string().optional(),
      })).min(1),
      settlementAmount: z.number().nonnegative().optional(),
      overrideReason: z.string().min(1).optional(),
      allocationIntent: z.enum(['fifo', 'selected_invoice', 'unapplied']).optional(),
      invoiceId: z.string().uuid().optional(),
      reason: z.string().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await executeCommand({
        name: 'settleDebtWithProduct' as const,
        idempotencyKey: randomUUID(),
        reason: input.reason ?? 'Barter settlement issued via operator console.',
        payload: input,
      }, ctx.user, ctx.io);
      return result;
    }),
});
