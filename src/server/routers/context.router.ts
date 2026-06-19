import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';

/**
 * Context / relationship query router.
 *
 * Domain: cross-entity relationship summaries used by context drawers,
 * pricing panels, and vendor tabs across multiple views.
 * Extracted from queries.ts during the router decomposition
 * (see docs/decisions/0001-domain-module-architecture.md).
 */
export const contextRouter = router({
  relationshipSummary: protectedProcedure
    .input(z.object({ customerId: z.string().uuid().optional(), vendorId: z.string().uuid().optional() }))
    .query(async ({ input }) => {
      const customer = input.customerId ? (await pool.query('select id, name, balance, credit_limit as "creditLimit", tags, notes, pricing_rule as "pricingRule" from customers where id = $1', [input.customerId])).rows[0] : null;
      const vendor = input.vendorId ? (await pool.query('select id, name, terms_days as "termsDays", notes from vendors where id = $1', [input.vendorId])).rows[0] : customer ? (await pool.query('select id, name, terms_days as "termsDays", notes from vendors where lower(name) = lower($1)', [customer.name])).rows[0] : null;
      const [orders, invoicesRows, paymentsRows, purchaseOrderRows, bills, vendorPaymentsRows, ledgerRows, creditRows, disputeRows, receiptRows, commands] = await Promise.all([
        customer ? pool.query('select id, order_no as "orderNo", status, total, created_at as "createdAt" from sales_orders where customer_id = $1 order by created_at desc limit 20', [customer.id]) : { rows: [] },
        customer ? pool.query('select id, invoice_no as "invoiceNo", status, total, amount_paid as "amountPaid", due_date as "dueDate" from invoices where customer_id = $1 order by created_at desc limit 20', [customer.id]) : { rows: [] },
        customer ? pool.query('select id, method, amount, unapplied_amount as "unappliedAmount", category, location_bucket as "locationBucket", created_at as "createdAt" from payments where customer_id = $1 order by created_at desc limit 20', [customer.id]) : { rows: [] },
        vendor ? pool.query('select id, po_no as "poNo", status, total, expected_date as "expectedDate", created_at as "createdAt" from purchase_orders where vendor_id = $1 order by created_at desc limit 20', [vendor.id]) : { rows: [] },
        vendor ? pool.query('select id, bill_no as "billNo", amount, amount_paid as "amountPaid", status, due_reason as "dueReason", scheduled_for as "scheduledFor" from vendor_bills where vendor_id = $1 order by due_date limit 20', [vendor.id]) : { rows: [] },
        vendor ? pool.query('select vp.id, vp.amount, vp.method, vp.reference, vp.created_at as "createdAt", vb.bill_no as "billNo" from vendor_payments vp join vendor_bills vb on vb.id = vp.vendor_bill_id where vb.vendor_id = $1 order by vp.created_at desc limit 20', [vendor.id]) : { rows: [] },
        customer ? pool.query('select id, kind, amount, balance_after as "balanceAfter", note, created_at as "createdAt" from client_ledger_entries where customer_id = $1 order by created_at desc limit 30', [customer.id]) : { rows: [] },
        customer ? pool.query('select id, amount, status, reason, created_at as "createdAt" from credit_overrides where customer_id = $1 order by created_at desc limit 20', [customer.id]) : { rows: [] },
        customer
          ? pool.query(
              `select d.id, d.status, d.reason, d.resolution, d.created_at as "createdAt", i.invoice_no as "invoiceNo"
               from invoice_disputes d
               join invoices i on i.id = d.invoice_id
               where i.customer_id = $1
               order by d.created_at desc
               limit 20`,
              [customer.id]
            )
          : { rows: [] },
        vendor ? pool.query('select id, receipt_no as "receiptNo", total, status, created_at as "createdAt" from purchase_receipts where vendor_id = $1 order by created_at desc limit 20', [vendor.id]) : { rows: [] },
        pool.query(`select id, command_name as "commandName", actor_name as "actorName", status, created_at as "createdAt" from command_journal where $1 = any(affected_ids) or $2 = any(affected_ids) order by created_at desc limit 20`, [input.customerId ?? '', input.vendorId ?? vendor?.id ?? ''])
      ]);
      return {
        customer,
        vendor,
        orders: orders.rows,
        invoices: invoicesRows.rows,
        payments: paymentsRows.rows,
        purchaseOrders: purchaseOrderRows.rows,
        bills: bills.rows,
        vendorPayments: vendorPaymentsRows.rows,
        ledger: ledgerRows.rows,
        creditOverrides: creditRows.rows,
        disputes: disputeRows.rows,
        receipts: receiptRows.rows,
        commands: commands.rows
      };
    }),
});
