import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';
import {
  getExternalReceipt,
  getInternalReceipt,
  renderPrintHtml,
  renderSignalText,
} from '../services/documentSnapshots';

/**
 * Purchase Orders query router.
 *
 * Domain: purchase orders (POs). Extracted from queries.ts during the
 * router decomposition (see docs/decisions/0001-domain-module-architecture.md).
 */
export const purchaseOrdersRouter = router({
  purchaseOrderExternalReceipt: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getExternalReceipt(pool, 'purchase_order', input.purchaseOrderId);
    }),

  purchaseOrderInternalReceipt: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Role gate is enforced inside getInternalReceipt via assertRole(user, 'manager').
      // We pass ctx.user through unchanged — the service throws TRPCError(FORBIDDEN)
      // when role < manager.
      return getInternalReceipt(pool, ctx.user, 'purchase_order', input.purchaseOrderId);
    }),

  purchaseOrderSignalText: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      const projection = await getExternalReceipt(pool, 'purchase_order', input.purchaseOrderId);
      if (!projection) return null;
      return renderSignalText(projection);
    }),

  purchaseOrderPrintHtml: protectedProcedure
    .input(z.object({
      purchaseOrderId: z.string().uuid(),
      audience: z.enum(['external', 'internal']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const aud = input.audience ?? 'external';
      const projection = aud === 'internal'
        ? await getInternalReceipt(pool, ctx.user, 'purchase_order', input.purchaseOrderId)
        : await getExternalReceipt(pool, 'purchase_order', input.purchaseOrderId);
      if (!projection) return null;
      return renderPrintHtml(projection);
    }),
});
