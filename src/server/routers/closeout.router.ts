import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { db, pool } from '../db';
import { getCloseoutSafety } from '../services/closeout';

/**
 * Closeout query router.
 *
 * Domain: period closeout preview and blocker detail queries.
 * Extracted from queries.ts during the router decomposition
 * (see docs/decisions/0001-domain-module-architecture.md).
 */
export const closeoutRouter = router({
  closeoutPreview: protectedProcedure
    .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ input }) => {
      return getCloseoutSafety(db, input.period);
    }),

  closeoutBlockerRows: protectedProcedure
    .input(
      z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        blockerId: z.string().max(64)
      })
    )
    .query(async ({ input }) => {
      const { period, blockerId } = input;
      type Row = { id: string; label: string; status: string };
      const sql: Record<string, [string, unknown[]]> = {
        unsafeBatches: [
          `SELECT b.id::text, coalesce(b.name, b.id::text) AS label, b.status
           FROM batches b
           WHERE to_char(b.created_at, 'YYYY-MM') = $1
             AND b.status IN ('draft', 'needs_fix')
           ORDER BY b.created_at DESC LIMIT 40`,
          [period]
        ],
        unsafePurchaseOrders: [
          `SELECT po.id::text, coalesce(v.name, po.po_no, po.id::text) AS label, po.status
           FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id
           WHERE to_char(po.created_at, 'YYYY-MM') = $1
             AND po.status IN ('draft', 'approved', 'ordered', 'partially_received')
           ORDER BY po.created_at DESC LIMIT 40`,
          [period]
        ],
        openConnectors: [
          `SELECT cr.id::text, concat(cr.request_type, ' / ', coalesce(c.name, 'unassigned')) AS label, cr.status
           FROM connector_requests cr LEFT JOIN customers c ON c.id = cr.customer_id
           WHERE to_char(cr.created_at, 'YYYY-MM') = $1
             AND cr.status IN ('open','pending_review','approved','accepted','routed','posting','failed')
           ORDER BY cr.created_at DESC LIMIT 40`,
          [period]
        ],
        openFulfillment: [
          `SELECT pl.id::text, coalesce(so.order_no, pl.pick_no, pl.id::text) AS label, pl.status
           FROM pick_lists pl LEFT JOIN sales_orders so ON so.id = pl.order_id
           WHERE to_char(pl.created_at, 'YYYY-MM') = $1
             AND pl.status IN ('open', 'packed')
           ORDER BY pl.created_at DESC LIMIT 40`,
          [period]
        ],
        failedCommands: [
          `SELECT id::text, command_name AS label, status
           FROM command_journal
           WHERE to_char(created_at, 'YYYY-MM') = $1
             AND status = 'failed'
           ORDER BY created_at DESC LIMIT 40`,
          [period]
        ],
        unresolvedDrafts: [
          `SELECT o.id::text, coalesce(c.name, o.order_no, o.id::text) AS label, o.status
           FROM sales_orders o LEFT JOIN customers c ON c.id = o.customer_id
           WHERE to_char(o.created_at, 'YYYY-MM') = $1
             AND o.status = 'draft'
           ORDER BY o.created_at DESC LIMIT 40`,
          [period]
        ]
      };
      const entry = sql[blockerId];
      if (!entry) return { rows: [] as Row[] };
      const [query, params] = entry;
      const result = await pool.query(query, params as unknown[]);
      return { rows: result.rows as Row[] };
    }),
});
