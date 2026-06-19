import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';

/**
 * Fulfillment / picking query router.
 *
 * Domain: pick lists, fulfillment lines, pick queue.
 * Extracted from queries.ts during the router decomposition
 * (see docs/decisions/0001-domain-module-architecture.md).
 */
export const fulfillmentRouter = router({
  fulfillmentLines: protectedProcedure
    .input(z.object({ pickListId: z.string().uuid() }))
    .query(async ({ input }) => {
      return (
        await pool.query(
          `select fl.id, fl.pick_list_id as "pickListId", fl.order_line_id as "orderLineId", sol.item_name as "itemName",
                  coalesce(sol.display_name, i.alias, sol.item_name) as "displayName",
                  b.batch_code as "batchCode", fl.expected_qty as "expectedQty", fl.actual_qty as "actualQty",
                  fl.actual_weight as "actualWeight", fl.bag_code as "bagCode", fl.status, fl.updated_at as "updatedAt"
           from fulfillment_lines fl
           left join sales_order_lines sol on sol.id = fl.order_line_id
           left join batches b on b.id = fl.batch_id
           left join items i on i.id = b.item_id
           where fl.pick_list_id = $1
           order by fl.created_at`,
          [input.pickListId]
        )
      ).rows;
    }),

  // CAP-030 (TER-1498): Warehouse pick queue. Returns one row per pick_list that
  // has at least one pick-released, non-cancelled fulfillment line. Fully-packed
  // picks stay visible as "ready to close" so the operator can "Complete Order"
  // without the pick vanishing from the queue. Ordered by oldest pick_released_at
  // for FIFO.
  pickQueue: protectedProcedure.query(async () => {
    return (
      await pool.query(
        `SELECT
           pl.id,
           pl.pick_no AS "pickNo",
           pl.order_id AS "orderId",
           so.order_no AS "orderNo",
           c.name AS customer,
           CASE WHEN COUNT(fl.id) FILTER (WHERE fl.actual_qty = 0 AND fl.status = 'open' AND fl.status_extended IS DISTINCT FROM 'cancelled') = 0
                AND COUNT(fl.id) FILTER (WHERE fl.actual_qty > 0) > 0
                THEN 'ready_to_close'
                ELSE pl.status
           END AS status,
           pl.assigned_to AS "assignedTo",
           pl.created_at AS "createdAt",
           COUNT(fl.id) FILTER (WHERE fl.status = 'open' AND fl.status_extended IS DISTINCT FROM 'cancelled')::int AS "openLines",
           COUNT(fl.id)::int AS "totalLines",
           COALESCE(SUM(jsonb_array_length(fl.warehouse_alerts)), 0)::int AS "alertCount",
           MIN(sol.pick_released_at) AS "oldestReleasedAt"
         FROM pick_lists pl
         JOIN sales_orders so ON so.id = pl.order_id
         LEFT JOIN customers c ON c.id = so.customer_id
         LEFT JOIN fulfillment_lines fl ON fl.pick_list_id = pl.id
         LEFT JOIN sales_order_lines sol ON sol.id = fl.order_line_id AND sol.pick_released_at IS NOT NULL
         WHERE pl.status = 'open'
           AND EXISTS (
             SELECT 1 FROM fulfillment_lines fl2
             WHERE fl2.pick_list_id = pl.id
               AND fl2.status_extended IS DISTINCT FROM 'cancelled'
           )
         GROUP BY pl.id, so.order_no, c.name
         ORDER BY MIN(sol.pick_released_at) ASC NULLS LAST`
      )
    ).rows;
  }),

  // CAP-030 (TER-1498): Detail view of a single pick list — header plus all fulfillment
  // lines. Computes a derived pick_status for each line (released / picking / picked /
  // recall_pending / cancelled / recalled) so the UI doesn't have to reimplement that.
  pickListWithLines: protectedProcedure
    .input(z.object({ pickListId: z.string().uuid() }))
    .query(async ({ input }) => {
      const header = (
        await pool.query(
          `SELECT pl.id, pl.pick_no AS "pickNo", pl.order_id AS "orderId",
                  so.order_no AS "orderNo", c.name AS customer, pl.status,
                  pl.assigned_to AS "assignedTo", pl.created_at AS "createdAt"
           FROM pick_lists pl
           JOIN sales_orders so ON so.id = pl.order_id
           LEFT JOIN customers c ON c.id = so.customer_id
           WHERE pl.id = $1
           LIMIT 1`,
          [input.pickListId]
        )
      ).rows[0] ?? null;

      const lines = (
        await pool.query(
          `SELECT
             fl.id,
             fl.order_line_id AS "orderLineId",
             fl.batch_id AS "batchId",
             sol.item_name AS "itemName",
             COALESCE(sol.display_name, i.alias, sol.item_name) AS "displayName",
             b.batch_code AS "batchCode",
             fl.expected_qty AS "expectedQty",
             fl.actual_qty AS "actualQty",
             fl.bag_code AS "bagCode",
             fl.status,
             fl.warehouse_alerts AS "warehouseAlerts",
             fl.status_extended AS "statusExtended",
             sol.pick_released_at AS "pickReleasedAt",
             CASE
               WHEN fl.status_extended = 'cancelled' THEN 'cancelled'
               WHEN fl.status_extended = 'recall_pending' THEN 'recall_pending'
               WHEN fl.actual_qty > 0 AND fl.status = 'packed' THEN 'picked'
               WHEN fl.actual_qty > 0 THEN 'picking'
               WHEN sol.pick_released_at IS NOT NULL THEN 'released'
               ELSE 'recalled'
             END AS "pickStatus",
             fl.updated_at AS "updatedAt"
           FROM fulfillment_lines fl
           LEFT JOIN sales_order_lines sol ON sol.id = fl.order_line_id
           LEFT JOIN batches b ON b.id = fl.batch_id
           LEFT JOIN items i ON i.id = b.item_id
           WHERE fl.pick_list_id = $1
           ORDER BY fl.created_at`,
          [input.pickListId]
        )
      ).rows;

      return { header, lines };
    }),
});
