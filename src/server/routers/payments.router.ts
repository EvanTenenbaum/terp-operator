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
 * Payments query router.
 *
 * Domain: payments (customer-side) and vendor payments. Extracted from
 * queries.ts during the router decomposition
 * (see docs/decisions/0001-domain-module-architecture.md).
 */
export const paymentsRouter = router({
  // ── Customer payments ──────────────────────────────────────────────────

  paymentExternalReceipt: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getExternalReceipt(pool, 'payment', input.paymentId);
    }),

  paymentInternalReceipt: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getInternalReceipt(pool, ctx.user, 'payment', input.paymentId);
    }),

  paymentSignalText: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const projection = await getExternalReceipt(pool, 'payment', input.paymentId);
      if (!projection) return null;
      return renderSignalText(projection);
    }),

  paymentPrintHtml: protectedProcedure
    .input(z.object({
      paymentId: z.string().uuid(),
      audience: z.enum(['external', 'internal']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const aud = input.audience ?? 'external';
      const projection = aud === 'internal'
        ? await getInternalReceipt(pool, ctx.user, 'payment', input.paymentId)
        : await getExternalReceipt(pool, 'payment', input.paymentId);
      if (!projection) return null;
      return renderPrintHtml(projection);
    }),

  // ── Vendor payments ────────────────────────────────────────────────────

  vendorPaymentExternalReceipt: protectedProcedure
    .input(z.object({ vendorPaymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getExternalReceipt(pool, 'vendor_payment', input.vendorPaymentId);
    }),

  vendorPaymentInternalReceipt: protectedProcedure
    .input(z.object({ vendorPaymentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getInternalReceipt(pool, ctx.user, 'vendor_payment', input.vendorPaymentId);
    }),

  vendorPaymentSignalText: protectedProcedure
    .input(z.object({ vendorPaymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const projection = await getExternalReceipt(pool, 'vendor_payment', input.vendorPaymentId);
      if (!projection) return null;
      return renderSignalText(projection);
    }),

  vendorPaymentPrintHtml: protectedProcedure
    .input(z.object({
      vendorPaymentId: z.string().uuid(),
      audience: z.enum(['external', 'internal']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const aud = input.audience ?? 'external';
      const projection = aud === 'internal'
        ? await getInternalReceipt(pool, ctx.user, 'vendor_payment', input.vendorPaymentId)
        : await getExternalReceipt(pool, 'vendor_payment', input.vendorPaymentId);
      if (!projection) return null;
      return renderPrintHtml(projection);
    }),
});
