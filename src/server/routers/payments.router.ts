import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { protectedProcedure, router } from '../trpc';
import { db, pool } from '../db';
import { paymentProcessors, processorFees } from '../schema';
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
  // ── Payment allocation queries ─────────────────────────────────────────

  paymentAllocations: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid().optional(), customerId: z.string().uuid().optional() }))
    .query(async ({ input }) => {
      return (
        await pool.query(
          `select pa.id, pa.payment_id as "paymentId", pa.invoice_id as "invoiceId", i.invoice_no as "invoiceNo",
                  pa.amount, pa.created_at as "createdAt", p.customer_id as "customerId"
           from payment_allocations pa
           join payments p on p.id = pa.payment_id
           left join invoices i on i.id = pa.invoice_id
           where ($1::uuid is null or pa.payment_id = $1::uuid)
             and ($2::uuid is null or p.customer_id = $2::uuid)
           order by pa.created_at desc
           limit 80`,
          [input.paymentId ?? null, input.customerId ?? null]
        )
      ).rows;
    }),

  vendorPayments: protectedProcedure
    .input(z.object({ vendorBillId: z.string().uuid().optional(), vendorId: z.string().uuid().optional() }))
    .query(async ({ input }) => {
      return (
        await pool.query(
          `select vp.id, vp.vendor_bill_id as "vendorBillId", vb.vendor_id as "vendorId", vb.bill_no as "billNo",
                  v.name as vendor, vp.amount, vp.method, vp.reference, vp.status, vp.created_at as "createdAt"
           from vendor_payments vp
           join vendor_bills vb on vb.id = vp.vendor_bill_id
           left join vendors v on v.id = vb.vendor_id
           where ($1::uuid is null or vp.vendor_bill_id = $1::uuid)
             and ($2::uuid is null or vb.vendor_id = $2::uuid)
           order by vp.created_at desc
           limit 80`,
          [input.vendorBillId ?? null, input.vendorId ?? null]
        )
      ).rows;
    }),

  // ── Payment allocation preview ────────────────────────────────────────

  paymentAllocationPreview: protectedProcedure
    .input(z.object({ customerId: z.string().uuid(), amount: z.coerce.number(), invoiceId: z.string().uuid().optional(), allocationIntent: z.string().optional() }))
    .query(async ({ input }) => {
      if (input.amount < 0) return { kind: 'buyer_credit', label: 'Buyer credit / down payment', rows: [], unapplied: Math.abs(input.amount).toFixed(2) };
      const invoices = input.invoiceId
        ? (await pool.query('select id, invoice_no as "invoiceNo", total, amount_paid as "amountPaid", status from invoices where id = $1', [input.invoiceId])).rows
        : (await pool.query("select id, invoice_no as \"invoiceNo\", total, amount_paid as \"amountPaid\", status from invoices where customer_id = $1 and status in ('open','partial') order by created_at", [input.customerId])).rows;
      let remaining = input.amount;
      const rows = invoices.map((invoice) => {
        const open = Math.max(0, Number(invoice.total) - Number(invoice.amountPaid));
        const applied = input.allocationIntent === 'unapplied' ? 0 : Math.min(open, remaining);
        remaining -= applied;
        return { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo, open: open.toFixed(2), applied: applied.toFixed(2) };
      });
      return { kind: input.allocationIntent || 'fifo', label: input.allocationIntent === 'unapplied' ? 'Leave unapplied' : 'Auto-apply to oldest invoices', rows, unapplied: Math.max(0, remaining).toFixed(2) };
    }),

  // ── Payment processor queries ──────────────────────────────────────────

  activeProcessors: protectedProcedure
    .query(async () => {
      return await db
        .select()
        .from(paymentProcessors)
        .where(eq(paymentProcessors.active, true))
        .orderBy(asc(paymentProcessors.name));
    }),

  processorWithTotals: protectedProcedure
    .input(z.object({ processorId: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await db.execute(sql`
        select p.id, p.name, p.processor_type as "processorType", p.fee_type as "feeType",
               p.fee_percentage as "feePercentage", p.fee_fixed_amount as "feeFixedAmount",
               p.default_user_split as "defaultUserSplit", p.default_processor_split as "defaultProcessorSplit",
               p.notes, p.active, p.created_at as "createdAt", p.updated_at as "updatedAt",
               coalesce(sum(pf.processing_fee_total), 0) as "totalFeesProcessed",
               coalesce(sum(case when pf.user_fee_status = 'collectible' then pf.user_fee_share else 0 end), 0) as "userFeesCollectible",
               coalesce(sum(case when pf.user_fee_status = 'collected' then pf.user_fee_share else 0 end), 0) as "userFeesCollected",
               coalesce(sum(case when pf.processor_fee_status = 'unpaid' then pf.processor_fee_share else 0 end), 0) as "processorFeesUnpaid"
        from payment_processors p
        left join processor_fees pf on pf.processor_id = p.id
        where p.id = ${input.processorId}
        group by p.id
      `);
      if (result.rows.length === 0) return null;
      return result.rows[0];
    }),

  processorFees: protectedProcedure
    .input(z.object({
      processorId: z.string().uuid().optional(),
      userFeeStatus: z.enum(['collectible', 'collected']).optional(),
      processorFeeStatus: z.enum(['paid', 'unpaid']).optional(),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.processorId) {
        conditions.push(eq(processorFees.processorId, input.processorId));
      }
      if (input.userFeeStatus) {
        conditions.push(eq(processorFees.userFeeStatus, input.userFeeStatus));
      }
      if (input.processorFeeStatus) {
        conditions.push(eq(processorFees.processorFeeStatus, input.processorFeeStatus));
      }
      return await db
        .select()
        .from(processorFees)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(processorFees.createdAt))
        .limit(200);
    }),

  refereeCredits: protectedProcedure
    .input(z.object({ refereeId: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await db.execute(sql`
        select rc.id,
               rc.referee_id as "refereeId",
               rc.referee_relationship_id as "refereeRelationshipId",
               rc.transaction_type as "transactionType",
               rc.transaction_id as "transactionId",
               rc.transaction_no as "transactionNo",
               rc.transaction_total as "transactionTotal",
               rc.credit_amount as "creditAmount",
               rc.amount_paid as "amountPaid",
               rc.status,
               rc.paid_at as "paidAt",
               rc.voided_at as "voidedAt",
               rc.voided_reason as "voidedReason",
               rc.notes,
               rc.created_at as "createdAt"
        from referee_credits rc
        where rc.referee_id = ${input.refereeId}
        order by rc.created_at desc
      `);
      return result.rows;
    }),

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
