import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';

/**
 * Intake query router.
 *
 * Domain: intake / batch creation queries. Extracted from queries.ts
 * during the router decomposition.
 *
 * (see docs/decisions/0001-domain-module-architecture.md)
 */
export const intakeRouter = router({
  intakeQueue: protectedProcedure.query(async () => {
    const orders = (
      await pool.query(
        `select po.id, po.po_no as "poNo", v.name as vendor, po.vendor_id as "vendorId", po.status,
                po.expected_date as "expectedDate", po.ordered_at as "orderedAt", po.received_at as "receivedAt",
                po.total, po.internal_notes as "internalNotes", po.buyer_notes as "buyerNotes", po.created_at as "createdAt",
                coalesce(sum(pol.qty), 0) as "expectedTotalQty",
                coalesce(sum(pol.received_qty), 0) as "receivedTotalQty",
                coalesce(sum(pol.qty * pol.unit_cost), 0) as "expectedTotal"
         from purchase_orders po
         left join vendors v on v.id = po.vendor_id
         left join purchase_order_lines pol on pol.purchase_order_id = po.id
         where po.status in ('approved','partially_received','received','ordered')
           and exists (select 1 from batches b where b.purchase_order_id = po.id and b.archived_at is null and b.status in ('draft','ready','needs_fix','posted','returned'))
         group by po.id, v.name
         order by case po.status when 'approved' then 0 when 'partially_received' then 1 when 'ordered' then 2 when 'received' then 3 else 4 end,
                  po.created_at desc`
      )
    ).rows;
    const orderIds = orders.map((row) => row.id as string);
    const batchRows = orderIds.length
      ? (
          await pool.query(
            `select b.id, b.purchase_order_id as "purchaseOrderId", b.purchase_order_line_id as "purchaseOrderLineId",
                    b.batch_code as "batchCode", b.name, b.category, b.intake_qty as "intakeQty",
                    b.available_qty as "availableQty", b.unit_cost as "unitCost", b.unit_price as "unitPrice",
                    b.uom, b.status, b.notes, b.validation_issues as "validationIssues",
                    b.media_status as "mediaStatus", b.arrival_status as "arrivalStatus",
                    b.vendor_id as "vendorId", b.tags, b.location, b.lot_code as "lotCode",
                    b.item_id as "itemId", i.alias as "itemAlias",
                    pol.qty as "expectedQty", pol.unit_cost as "expectedUnitCost",
                    b.created_at as "createdAt"
             from batches b
             left join purchase_order_lines pol on pol.id = b.purchase_order_line_id
             left join items i on i.id = b.item_id
             where b.purchase_order_id = any($1::uuid[]) and b.archived_at is null
             order by b.created_at`,
            [orderIds]
          )
        ).rows
      : [];
    const grouped = new Map<string, typeof batchRows>();
    for (const row of batchRows) {
      const key = String(row.purchaseOrderId);
      const list = grouped.get(key);
      if (list) list.push(row);
      else grouped.set(key, [row]);
    }
    return orders.map((order) => ({ ...order, batches: grouped.get(order.id as string) ?? [] }));
  }),

  photographyQueue: protectedProcedure.query(async () => {
    return (
      await pool.query(
        `select pq.id, pq.batch_id as "batchId", b.batch_code as "batchCode", b.name, b.media_status as "mediaStatus",
                pq.status, pq.notes, pq.created_at as "createdAt", pq.updated_at as "updatedAt"
         from photography_queue pq
         left join batches b on b.id = pq.batch_id
         order by case pq.status when 'open' then 0 when 'in_progress' then 1 else 2 end, pq.created_at desc
         limit 100`
      )
    ).rows;
  }),

  batchMediaList: protectedProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(async ({ input }): Promise<Array<{
      id: string; batchId: string; mediaType: string; role: string; status: string;
      originalFilename: string; fileSize: number; mimeType: string; hasThumbnail: boolean;
      publishedAt: string | null; replacedAt: string | null; createdAt: string; updatedAt: string;
    }>> => {
      return (
        await pool.query(
          `select id,
                  batch_id as "batchId",
                  media_type as "mediaType",
                  role,
                  status,
                  original_filename as "originalFilename",
                  file_size as "fileSize",
                  mime_type as "mimeType",
                  (thumbnail_path is not null) as "hasThumbnail",
                  published_at as "publishedAt",
                  replaced_at as "replacedAt",
                  created_at as "createdAt",
                  updated_at as "updatedAt"
           from batch_media
           where batch_id = $1 and replaced_at is null
           order by case role when 'primary_photo' then 0 when 'primary_video' then 1 when 'additional' then 2 else 3 end, created_at desc`,
          [input.batchId]
        )
      ).rows;
    }),
});
