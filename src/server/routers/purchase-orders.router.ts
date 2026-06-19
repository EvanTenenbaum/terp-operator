import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';
import {
  getExternalReceipt,
  getInternalReceipt,
  renderPrintHtml,
  renderSignalText,
} from '../services/documentSnapshots';
import { canRole } from '../rbac';

/**
 * Purchase Orders query router.
 *
 * Domain: purchase orders (POs). Extracted from queries.ts during the
 * router decomposition (see docs/decisions/0001-domain-module-architecture.md).
 */
export const purchaseOrdersRouter = router({
  // ── Purchase Order line item queries ───────────────────────────────────

  purchaseOrderLines: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const canViewFinancials = canRole(ctx.user.role, 'manager');
      const rows = (
        await pool.query(
          `select pol.id, pol.purchase_order_id as "purchaseOrderId", pol.item_id as "itemId",
                  pol.product_name as "productName", pol.category, pol.tags, pol.qty, pol.received_qty as "receivedQty",
                  pol.uom, pol.unit_cost as "unitCost", pol.unit_price as "unitPrice", pol.source_code as "sourceCode",
                  pol.shorthand, pol.legacy_marker as "legacyMarker", pol.ownership_status as "ownershipStatus",
                  pol.notes, pol.status, pol.created_at as "createdAt", i.sku,
                  coalesce(bs."currentStock", 0)::numeric(12,3) as "currentStock",
                  coalesce(bs."soldQty", 0)::numeric(12,3) as "soldQty",
                  coalesce(bs."soldRevenue", 0)::numeric(14,2) as "soldRevenue",
                  coalesce(bs."soldCost", 0)::numeric(14,2) as "soldCost"
           from purchase_order_lines pol
           left join items i on i.id = pol.item_id
           left join lateral (
             select sum(b.available_qty) as "currentStock",
                    sum(ss."soldQty") as "soldQty",
                    sum(ss."soldRevenue") as "soldRevenue",
                    sum(ss."soldCost") as "soldCost"
             from batches b
             left join lateral (
               select coalesce(sum(sol.qty), 0) as "soldQty",
                      coalesce(sum(sol.qty * sol.unit_price), 0) as "soldRevenue",
                      coalesce(sum(sol.qty * sol.unit_cost), 0) as "soldCost"
               from sales_order_lines sol
               where sol.batch_id = b.id
                 and sol.status not in ('void', 'cancelled')
             ) ss on true
             where b.purchase_order_line_id = pol.id
           ) bs on true
           where pol.purchase_order_id = $1
           order by pol.created_at`,
          [input.purchaseOrderId]
        )
      ).rows;
      if (!canViewFinancials) {
        return rows.map((row) => ({ ...row, unitCost: null, soldRevenue: null, soldCost: null }));
      }
      return rows;
    }),

  purchaseReceiptLines: protectedProcedure
    .input(z.object({ purchaseReceiptId: z.string().uuid() }))
    .query(async ({ input }) => {
      return (
        await pool.query(
          `select prl.id, prl.receipt_id as "purchaseReceiptId", prl.batch_id as "batchId",
                  b.batch_code as "batchCode", b.name as "itemName",
                  prl.qty, prl.unit_cost as "unitCost", prl.subtotal
           from purchase_receipt_lines prl
           left join batches b on b.id = prl.batch_id
           where prl.receipt_id = $1
            order by prl.id`,
          [input.purchaseReceiptId]
        )
      ).rows;
    }),

  poContextSignals: protectedProcedure.query(async () => {
    const [invRows, priceRows] = await Promise.all([
      // Current inventory grouped by category — includes zero-stock categories
      pool.query<{ category: string; subcategory: string | null; availableQty: string; batchCount: string; uom: string | null }>(`
        select category,
               subcategory,
               coalesce(sum(available_qty), 0)::numeric(14,3) as "availableQty",
               count(*) as "batchCount",
               min(uom) filter (where available_qty > 0) as uom
        from batches
        where status = 'posted'
          and category is not null
          and category <> ''
        group by category, subcategory
        order by coalesce(sum(available_qty), 0) asc, category, subcategory nulls last
      `),
      // Average recent procurement cost per category from PO lines in last 90 days
      pool.query<{ category: string; subcategory: string | null; avgCost: string; minCost: string; maxCost: string; poCount: number; lastPoDate: string | null }>(`
        select pol.category,
               pol.subcategory,
               round(avg(pol.unit_cost)::numeric, 2) as "avgCost",
               round(min(pol.unit_cost)::numeric, 2) as "minCost",
               round(max(pol.unit_cost)::numeric, 2) as "maxCost",
               count(distinct po.id)::int as "poCount",
               max(po.created_at) as "lastPoDate"
        from purchase_order_lines pol
        join purchase_orders po on po.id = pol.purchase_order_id
        where po.created_at > now() - interval '90 days'
          and pol.unit_cost > 0
          and pol.category is not null
          and pol.category <> ''
        group by pol.category, pol.subcategory
        order by pol.category, pol.subcategory nulls last
      `)
    ]);
    return {
      inventory: invRows.rows,
      pricing: priceRows.rows
    };
  }),

  // ── Document receipt queries ────────────────────────────────────────────

  purchaseOrderExternalReceipt: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getExternalReceipt(pool, 'purchase_order', input.purchaseOrderId);
    }),

  purchaseOrderInternalReceipt: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
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
