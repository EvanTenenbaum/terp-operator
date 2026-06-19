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
 * Sales Orders query router.
 *
 * Domain: sales orders. Extracted from queries.ts during the
 * router decomposition (see docs/decisions/0001-domain-module-architecture.md).
 */

async function latestInvoiceIdForOrder(salesOrderId: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT id FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [salesOrderId]
  );
  const row = res.rows[0] as { id: string } | undefined;
  return row?.id ?? null;
}

export const salesOrdersRouter = router({
  salesOrderExternalReceipt: protectedProcedure
    .input(z.object({ salesOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      const invoiceId = await latestInvoiceIdForOrder(input.salesOrderId);
      if (invoiceId) {
        const fromInvoice = await getExternalReceipt(pool, 'invoice', invoiceId);
        if (fromInvoice) return fromInvoice;
      }
      return getExternalReceipt(pool, 'sales_order', input.salesOrderId);
    }),

  salesOrderInternalReceipt: protectedProcedure
    .input(z.object({ salesOrderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const invoiceId = await latestInvoiceIdForOrder(input.salesOrderId);
      if (invoiceId) {
        const fromInvoice = await getInternalReceipt(pool, ctx.user, 'invoice', invoiceId);
        if (fromInvoice) return fromInvoice;
      }
      return getInternalReceipt(pool, ctx.user, 'sales_order', input.salesOrderId);
    }),

  salesOrderSignalText: protectedProcedure
    .input(z.object({ salesOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      const invoiceId = await latestInvoiceIdForOrder(input.salesOrderId);
      if (invoiceId) {
        const fromInvoice = await getExternalReceipt(pool, 'invoice', invoiceId);
        if (fromInvoice) return renderSignalText(fromInvoice);
      }
      const fromConfirmation = await getExternalReceipt(pool, 'sales_order', input.salesOrderId);
      if (!fromConfirmation) return null;
      return renderSignalText(fromConfirmation);
    }),

  salesOrderPrintHtml: protectedProcedure
    .input(z.object({
      salesOrderId: z.string().uuid(),
      audience: z.enum(['external', 'internal']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const aud = input.audience ?? 'external';
      const invoiceId = await latestInvoiceIdForOrder(input.salesOrderId);
      if (invoiceId) {
        const fromInvoice = aud === 'internal'
          ? await getInternalReceipt(pool, ctx.user, 'invoice', invoiceId)
          : await getExternalReceipt(pool, 'invoice', invoiceId);
        if (fromInvoice) return renderPrintHtml(fromInvoice);
      }
      const fromConfirmation = aud === 'internal'
        ? await getInternalReceipt(pool, ctx.user, 'sales_order', input.salesOrderId)
        : await getExternalReceipt(pool, 'sales_order', input.salesOrderId);
      if (!fromConfirmation) return null;
      return renderPrintHtml(fromConfirmation);
    }),
});
