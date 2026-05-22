-- CAP-030: pick_released fields on sales_order_lines + warehouse_alerts on fulfillment_lines (TER-1481)

ALTER TABLE sales_order_lines
  ADD COLUMN IF NOT EXISTS pick_released_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pick_released_by  uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_order_lines_pick_released_idx
  ON sales_order_lines (pick_released_at)
  WHERE pick_released_at IS NOT NULL;

ALTER TABLE fulfillment_lines
  ADD COLUMN IF NOT EXISTS warehouse_alerts  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_extended   varchar(32);

-- Backfill: for fulfillment lines attached to posted orders, mark the sales line as released
-- at the order's posted_at so derived pick_status renders correctly for historical orders.
UPDATE sales_order_lines sol
SET pick_released_at = so.posted_at
FROM sales_orders so
WHERE so.id = sol.order_id
  AND so.posted_at IS NOT NULL
  AND sol.pick_released_at IS NULL
  AND EXISTS (
    SELECT 1 FROM fulfillment_lines fl WHERE fl.order_line_id = sol.id
  );
