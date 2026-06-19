import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../trpc';
import { pool } from '../db';
import {
  getExternalReceipt,
  getInternalReceipt,
  renderPrintHtml,
  renderSignalText,
} from '../services/documentSnapshots';
import { LANDED_COST_EXCEPTION_LATERAL_JOIN_SQL } from '../projections/landedCostExceptionSql';
import { projectLandedCostException } from '../projections/landedCostException';

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
  // ── Sales Order line item queries ──────────────────────────────────────

  salesOrderLines: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ input }) => {
      const rows = (
        await pool.query(
          `select sol.id, sol.order_id as "orderId", sol.batch_id as "batchId", b.batch_code as "batchCode",
                  sol.item_name as "itemName",
                  coalesce(sol.display_name, i.alias, sol.item_name) as "displayName",
                  i.alias as "itemAlias",
                  sol.qty, sol.unit_price as "unitPrice", sol.unit_cost as "unitCost",
                  sol.unit_cost_resolved as "unitCostResolved",
                  sol.landed_cost_basis as "landedCostBasis",
                  sol.landed_cost_reason as "landedCostReason",
                  sol.price_floor as "priceFloor",
                  sol.below_floor_reason as "belowFloorReason",
                  sol.below_floor_note as "belowFloorNote",
                  sol.vendor_approval_state as "vendorApprovalState",
                  sol.source_row_key as "sourceRowKey", sol.unresolved_source_text as "unresolvedSourceText",
                  sol.legacy_status_marker as "legacyStatusMarker", sol.packed, sol.inventory_posted as "inventoryPosted",
                  sol.payment_followup as "paymentFollowup", sol.validation_issues as "validationIssues", sol.status,
                   b.available_qty as "availableQty", b.legacy_marker as "legacyMarker", b.price_range as "priceRange",
                   b.category as "batchCategory",
                  b.media_status as "mediaStatus", v.name as vendor,
                  latest_cogs.result as "landedCostJournalResult"
           from sales_order_lines sol
           left join batches b on b.id = sol.batch_id
           left join items i on i.id = b.item_id
           left join vendors v on v.id = b.vendor_id
           ${LANDED_COST_EXCEPTION_LATERAL_JOIN_SQL}
           where sol.order_id = $1
           order by sol.created_at`,
          [input.orderId]
        )
      ).rows;
      return rows.map((row) => {
        const projection = projectLandedCostException(row.landedCostJournalResult);
        const { landedCostJournalResult: _omit, ...rest } = row;
        return { ...rest, ...projection };
      });
    }),

  releaseEligibility: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ input }) => {
      const lines = (
        await pool.query(
          `SELECT
             sol.id AS "lineId",
             sol.item_name AS "itemName",
             sol.batch_id AS "batchId",
             sol.qty,
             sol.validation_issues AS "validationIssues",
             sol.pick_released_at AS "pickReleasedAt",
             b.reserved_qty AS "batchReservedQty"
           FROM sales_order_lines sol
           LEFT JOIN batches b ON b.id = sol.batch_id
           WHERE sol.order_id = $1
           ORDER BY sol.created_at`,
          [input.orderId]
        )
      ).rows;

      return lines.map((row: Record<string, unknown>) => {
        const reasons: string[] = [];
        if (!row.itemName) reasons.push('Item name is not set.');
        if (!row.batchId) reasons.push('No batch assigned.');
        if (Number(row.qty) <= 0) reasons.push('Quantity must be greater than zero.');
        const issues = Array.isArray(row.validationIssues) ? (row.validationIssues as string[]) : [];
        const fatalIssues = issues.filter((i: string) => !i.startsWith('Pick landed COGS'));
        if (fatalIssues.length) reasons.push(`Resolve validation issues: ${fatalIssues.join('; ')}`);
        if (row.batchId && Number(row.batchReservedQty) < Number(row.qty)) {
          reasons.push('Insufficient reservation — reserve inventory first.');
        }
        return {
          lineId: row.lineId,
          eligible: reasons.length === 0,
          alreadyReleased: !!row.pickReleasedAt,
          reasons
        };
      });
    }),

  // ── Customer purchase history ──────────────────────────────────────────

  customerPurchaseHistory: protectedProcedure
    .input(z.object({ customerId: z.string().uuid(), limit: z.number().int().positive().max(500).default(200) }))
    .query(async ({ input }) => {
      return (
        await pool.query(
          `select
              sol.id,
              sol.order_id as "orderId",
              so.order_no as "orderNo",
              so.status as "orderStatus",
              so.created_at as "createdAt",
              coalesce(i.alias, sol.display_name) as "itemAlias",
              sol.item_name as "itemName",
              sol.qty,
              sol.unit_price as "unitPrice",
              sol.unit_cost as "unitCost",
              b.batch_code as "batchCode",
              inv.id as "invoiceId",
              inv.invoice_no as "invoiceNo",
              inv.status as "invoiceStatus",
              CASE WHEN inv.id IS NOT NULL THEN
                extract(epoch from (inv.due_date::timestamptz - so.created_at::timestamptz)) / 86400
              END as "paymentTermsDays"
           from sales_order_lines sol
           join sales_orders so on so.id = sol.order_id
           left join batches b on b.id = sol.batch_id
           left join items i on i.id = b.item_id
           left join invoices inv on inv.order_id = so.id
           where so.customer_id = $1
             and so.status not in ('archived')
           order by so.created_at desc, sol.created_at
           limit $2`,
          [input.customerId, input.limit]
        )
      ).rows;
    }),

  // ── Document receipt queries ────────────────────────────────────────────

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

  // ── Cross-sell suggestions & purchase history helpers ──────────────────

  salesSuggestions: protectedProcedure
    .input(
      z.object({
        customerId: z.string().uuid().optional(),
        category: z.string().optional(),
        vendorId: z.string().uuid().optional(),
        tag: z.string().optional(),
        priceBracket: z.string().optional(),
        minAvailable: z.coerce.number().optional(),
        agingOnly: z.boolean().optional()
      })
    )
    .query(async ({ input }) => {
    if (!input.customerId) return [];
    const params: unknown[] = [input.customerId];
    const where = ["b.status = 'posted'", 'b.available_qty > 0', '(b.tags && c.tags or cardinality(c.tags) = 0)'];
    if (input.category) {
      params.push(input.category);
      where.push(`b.category = $${params.length}`);
    }
    if (input.vendorId) {
      params.push(input.vendorId);
      where.push(`b.vendor_id = $${params.length}`);
    }
    if (input.tag) {
      params.push(input.tag.toLowerCase());
      where.push(`exists (select 1 from unnest(b.tags) tag where lower(tag) = $${params.length})`);
    }
    if (input.minAvailable != null) {
      params.push(input.minAvailable);
      where.push(`b.available_qty >= $${params.length}`);
    }
    if (input.priceBracket === 'under-25') where.push('b.unit_price < 25');
    if (input.priceBracket === '25-100') where.push('b.unit_price >= 25 and b.unit_price <= 100');
    if (input.priceBracket === '100-plus') where.push('b.unit_price > 100');
    if (input.agingOnly) where.push("(b.intake_date < now() - interval '30 days' OR (b.intake_date IS NULL AND b.created_at < now() - interval '30 days'))");
    return (
      await pool.query(
        `select b.id, b.batch_code as "batchCode", b.name, b.category, v.name as vendor,
                b.available_qty as "availableQty", b.unit_price as "unitPrice", b.unit_cost as "unitCost",
                (b.unit_price - b.unit_cost) as "estimatedMargin",
                array_to_string(b.tags, ', ') as tags,
                case when b.created_at < now() - interval '30 days' then 'Aging lot; ' else '' end ||
                'Matches buyer tags; price from posted batch unit price; margin visible internally' as reason
         from batches b
         join customers c on c.id = $1
         left join vendors v on v.id = b.vendor_id
         where ${where.join(' and ')}
         order by b.created_at desc
         limit 20`,
        params
      )
    ).rows;
  }),

  customerLastOrderedQty: publicProcedure
    .input(z.object({ batchId: z.string().uuid(), customerId: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query<{ qty: string }>(
        `select sol.qty
         from sales_order_lines sol
         join sales_orders so on so.id = sol.order_id
         where sol.batch_id = $1
           and so.customer_id = $2
           and sol.status in ('confirmed', 'reserved', 'allocated', 'posted')
         order by sol.created_at desc
         limit 1`,
        [input.batchId, input.customerId]
      );
      return result.rows[0]?.qty ?? null;
    }),

  customerLastOrderedQtyBulk: publicProcedure
    .input(z.object({ customerId: z.string().uuid(), batchIds: z.array(z.string().uuid()).max(200) }))
    .query(async ({ input }) => {
      if (!input.batchIds.length) return {};
      const result = await pool.query<{ batch_id: string; qty: string }>(
        `select distinct on (sol.batch_id) sol.batch_id, sol.qty
         from sales_order_lines sol
         join sales_orders so on so.id = sol.order_id
         where sol.batch_id = any($1::uuid[])
           and so.customer_id = $2
           and sol.status in ('confirmed', 'reserved', 'allocated', 'posted')
         order by sol.batch_id, sol.created_at desc`,
        [input.batchIds, input.customerId]
      );
      const map: Record<string, string | null> = {};
      for (const row of result.rows) {
        map[row.batch_id] = row.qty;
      }
      return map;
    }),
});
