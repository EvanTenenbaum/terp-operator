-- TER-1634 / F-28: Soft reservation projection index
--
-- The draftReservedQty projection (getDraftReservedQtyMap + LEFT JOIN LATERAL in
-- the reference data query) filters sales_order_lines where:
--   so.status IN ('draft', 'confirmed')
--   AND sol.status NOT IN ('reserved', 'allocated', 'posted', 'cancelled')
--   AND sol.batch_id = <target batch id>
--
-- This partial index covers the active subset (draft/needs_fix rows with a batch_id)
-- to make batch_id lookups fast.  CONCURRENTLY keeps the table writable during build.
--
-- NOTE: 'draft_unresolved' is NOT a recognised sales_order_lines status in this schema
-- (only 'draft', 'needs_fix', 'ready', 'confirmed', 'reserved', 'allocated', 'posted',
-- 'cancelled').  It is intentionally excluded to avoid a condition on an unknown value.

CREATE INDEX CONCURRENTLY IF NOT EXISTS sol_draft_reservation_batch_idx
    ON sales_order_lines (batch_id)
    WHERE status IN ('draft', 'needs_fix', 'ready', 'confirmed');
