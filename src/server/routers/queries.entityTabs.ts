import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';

const entityIdInput = z.object({
  entityId: z.string().uuid(),
});

function getCount(result: { rows: Array<{ count: unknown }> }): number {
  return Number(result.rows[0]?.count ?? 0);
}

export const entityTabsRouter = router({
  // 1 ─── purchaseOrderTabs ─── tabs: Lines, Receipts, Payments, Journal
  purchaseOrderTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const linesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM purchase_order_lines WHERE purchase_order_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'lines', label: 'Lines', status: null, count: linesCount });

      const receiptsCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM purchase_receipts WHERE purchase_order_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'receipts', label: 'Receipts', status: null, count: receiptsCount });

      const paymentsCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM vendor_payments WHERE purchase_order_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'payments', label: 'Payments', status: null, count: paymentsCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'purchase_order' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'purchaseOrder' as const, tabs, defaultTab };
    }),

  // 2 ─── salesOrderTabs ─── tabs: Lines, Fulfillments, Invoices, Payments, Journal
  salesOrderTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const linesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM sales_order_lines WHERE order_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'lines', label: 'Lines', status: null, count: linesCount });

      const fulfillmentsCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM fulfillment_lines WHERE order_line_id IN (SELECT id FROM sales_order_lines WHERE order_id = $1)',
        [entityId],
      ));
      tabs.push({ tabKey: 'fulfillments', label: 'Fulfillments', status: null, count: fulfillmentsCount });

      const invoicesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM invoices WHERE order_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'invoices', label: 'Invoices', status: null, count: invoicesCount });

      const paymentsCount = getCount(await pool.query(
        'SELECT COUNT(DISTINCT p.id)::int AS count FROM payments p JOIN payment_allocations pa ON pa.payment_id = p.id JOIN invoices i ON i.id = pa.invoice_id WHERE i.order_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'payments', label: 'Payments', status: null, count: paymentsCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'sales_order' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'salesOrder' as const, tabs, defaultTab };
    }),

  // 3 ─── batchTabs ─── tabs: Lines, Movement, Media, Journal
  batchTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const linesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM sales_order_lines WHERE batch_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'lines', label: 'Lines', status: null, count: linesCount });

      const movementCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM inventory_movements WHERE batch_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'movement', label: 'Movement', status: null, count: movementCount });

      const mediaCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM batch_media WHERE batch_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'media', label: 'Media', status: null, count: mediaCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'batch' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'batch' as const, tabs, defaultTab };
    }),

  // 4 ─── paymentTabs ─── tabs: Allocations, Disputes, Journal
  paymentTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const allocationsCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM payment_allocations WHERE payment_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'allocations', label: 'Allocations', status: null, count: allocationsCount });

      const disputesCount = getCount(await pool.query(
        'SELECT COUNT(DISTINCT id.id)::int AS count FROM invoice_disputes id JOIN payment_allocations pa ON pa.invoice_id = id.invoice_id WHERE pa.payment_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'disputes', label: 'Disputes', status: null, count: disputesCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'payment' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'payment' as const, tabs, defaultTab };
    }),

  // 5 ─── invoiceTabs ─── tabs: Lines, Allocations, Disputes, Journal
  invoiceTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const linesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM sales_order_lines WHERE order_id = (SELECT order_id FROM invoices WHERE id = $1)',
        [entityId],
      ));
      tabs.push({ tabKey: 'lines', label: 'Lines', status: null, count: linesCount });

      const allocationsCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM payment_allocations WHERE invoice_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'allocations', label: 'Allocations', status: null, count: allocationsCount });

      const disputesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM invoice_disputes WHERE invoice_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'disputes', label: 'Disputes', status: null, count: disputesCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'invoice' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'invoice' as const, tabs, defaultTab };
    }),

  // 6 ─── purchaseReceiptTabs ─── tabs: Lines, Journal
  purchaseReceiptTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const linesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM purchase_receipt_lines WHERE receipt_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'lines', label: 'Lines', status: null, count: linesCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'purchase_receipt' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'purchaseReceipt' as const, tabs, defaultTab };
    }),

  // 7 ─── vendorBillTabs ─── tabs: Lines, Allocations, Journal
  vendorBillTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const linesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM purchase_order_lines WHERE purchase_order_id = (SELECT purchase_order_id FROM vendor_bills WHERE id = $1)',
        [entityId],
      ));
      tabs.push({ tabKey: 'lines', label: 'Lines', status: null, count: linesCount });

      const allocationsCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM vendor_payments WHERE vendor_bill_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'allocations', label: 'Allocations', status: null, count: allocationsCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'vendor_bill' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'vendorBill' as const, tabs, defaultTab };
    }),

  // 8 ─── vendorPaymentTabs ─── tabs: Allocations, Journal
  vendorPaymentTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const allocationsCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM vendor_bills vb JOIN vendor_payments vp ON vp.vendor_bill_id = vb.id WHERE vp.id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'allocations', label: 'Allocations', status: null, count: allocationsCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'vendor_payment' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'vendorPayment' as const, tabs, defaultTab };
    }),

  // 9 ─── fulfillmentLineTabs ─── tabs: Picks, Journal
  fulfillmentLineTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const picksCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM fulfillment_lines WHERE pick_list_id = (SELECT pick_list_id FROM fulfillment_lines WHERE id = $1)',
        [entityId],
      ));
      tabs.push({ tabKey: 'picks', label: 'Picks', status: null, count: picksCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'fulfillment_line' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'fulfillmentLine' as const, tabs, defaultTab };
    }),

  // 10 ─── pickListTabs ─── tabs: Lines, Journal
  pickListTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const linesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM fulfillment_lines WHERE pick_list_id = $1',
        [entityId],
      ));
      tabs.push({ tabKey: 'lines', label: 'Lines', status: null, count: linesCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'pick_list' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'pickList' as const, tabs, defaultTab };
    }),

  // 11 ─── connectorRequestTabs ─── tabs: Matches, Journal
  connectorRequestTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const matchesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM matchmaking_matches mm JOIN customer_needs cn ON cn.id = mm.customer_need_id WHERE cn.customer_id = (SELECT customer_id FROM connector_requests WHERE id = $1)',
        [entityId],
      ));
      tabs.push({ tabKey: 'matches', label: 'Matches', status: null, count: matchesCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'connector_request' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'connectorRequest' as const, tabs, defaultTab };
    }),

  // 12 ─── matchmakingMatchTabs ─── tabs: Lines, Journal
  matchmakingMatchTabs: protectedProcedure
    .input(entityIdInput)
    .query(async ({ input }) => {
      const { entityId } = input;
      const tabs: Array<{ tabKey: string; label: string; status: string | null; count: number }> = [];

      const linesCount = getCount(await pool.query(
        'SELECT COUNT(*)::int AS count FROM customer_needs WHERE id = (SELECT customer_need_id FROM matchmaking_matches WHERE id = $1)',
        [entityId],
      ));
      tabs.push({ tabKey: 'lines', label: 'Lines', status: null, count: linesCount });

      const journalCount = getCount(await pool.query(
        "SELECT COUNT(*)::int AS count FROM command_journal WHERE entity_type = 'matchmaking_match' AND entity_id = $1",
        [entityId],
      ));
      tabs.push({ tabKey: 'journal', label: 'Journal', status: null, count: journalCount });

      const defaultTab = tabs.find((t) => t.count > 0)?.tabKey || tabs[0].tabKey;
      return { entityId, entityType: 'matchmakingMatch' as const, tabs, defaultTab };
    }),
});
