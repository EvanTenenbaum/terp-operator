-- Issue #64: sale-time cost-range exceptions, below-floor reasons, and
-- vendor-approval propagation.
--
-- This migration adds three slices of state, none of which touch vendor
-- bills (the architect brief established that vendor reconciliation stays
-- driven by the existing ticketCost / unitCost path):
--
--   1. Sale-line cost / below-floor / vendor-approval state. Keeps COGS
--      resolution (landed_cost_reason) separate from below-floor reason flow
--      (price_floor, below_floor_reason, below_floor_note) and vendor approval
--      (vendor_approval_state).
--
--   2. Sales-order roll-up totals (margin_waived_total, loss_recognized_total)
--      and a vendor_approval_pending boolean so confirm/post gates and
--      operator UI badges can read order-level state without re-aggregating
--      every read.
--
-- All new columns are nullable or have safe defaults so existing rows keep
-- their current invariants.

ALTER TABLE sales_order_lines
  ADD COLUMN IF NOT EXISTS landed_cost_reason text,
  ADD COLUMN IF NOT EXISTS price_floor numeric(12, 2),
  ADD COLUMN IF NOT EXISTS below_floor_reason varchar(32),
  ADD COLUMN IF NOT EXISTS below_floor_note text,
  ADD COLUMN IF NOT EXISTS vendor_approval_state varchar(32) NOT NULL DEFAULT 'none';

ALTER TABLE sales_order_lines
  ADD CONSTRAINT sales_order_lines_landed_cost_basis_check
    CHECK (
      landed_cost_basis IS NULL
      OR landed_cost_basis IN ('fixed', 'pick-low', 'pick-mid', 'pick-high', 'manual', 'override')
    ) NOT VALID,
  ADD CONSTRAINT sales_order_lines_below_floor_reason_check
    CHECK (
      below_floor_reason IS NULL
      OR below_floor_reason IN ('keep_margin', 'renegotiate', 'waive_margin', 'take_loss', 'vendor_approval_pending')
    ),
  ADD CONSTRAINT sales_order_lines_vendor_approval_state_check
    CHECK (vendor_approval_state IN ('none', 'pending', 'approved', 'declined'));

CREATE INDEX IF NOT EXISTS sales_order_lines_vendor_approval_idx
  ON sales_order_lines (order_id)
  WHERE vendor_approval_state = 'pending';

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS vendor_approval_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS margin_waived_total numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loss_recognized_total numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN sales_order_lines.landed_cost_reason IS
  'Issue #64: free-text reason required when landed_cost_basis is override (out-of-range manager decision).';
COMMENT ON COLUMN sales_order_lines.price_floor IS
  'Issue #64: pricing floor the line was checked against at add/reprice time. Below_floor_reason becomes required when unitPrice < price_floor.';
COMMENT ON COLUMN sales_order_lines.below_floor_reason IS
  'Issue #64: operator-selected reason for selling below the captured price_floor. One of keep_margin, renegotiate, waive_margin, take_loss, vendor_approval_pending.';
COMMENT ON COLUMN sales_order_lines.vendor_approval_state IS
  'Issue #64: per-line vendor approval state for below-floor sales requiring vendor sign-off.';
COMMENT ON COLUMN sales_orders.vendor_approval_pending IS
  'Issue #64: rolled up from sale lines so confirm/post can block on any pending line without re-aggregating.';
COMMENT ON COLUMN sales_orders.margin_waived_total IS
  'Issue #64: $ amount of margin the operator gave up vs price_floor on waive_margin lines; written at post.';
COMMENT ON COLUMN sales_orders.loss_recognized_total IS
  'Issue #64: $ amount sold below landed cost on take_loss lines; written at post. Does NOT change vendor bill amounts.';
