-- Rollback for migrations/0048_add_sale_cost_range_exceptions.sql
--
-- Reverses 0048 in safe order: indexes first, then constraints, then columns.
-- Does NOT drop origin columns unit_cost_resolved or landed_cost_basis,
-- which pre-date this migration (see migrations/0038_pricing_rules_cogs_resolution.sql).
-- Idempotent (uses IF EXISTS) so re-running this rollback is a no-op.

DROP INDEX IF EXISTS sales_order_lines_vendor_approval_idx;

ALTER TABLE sales_order_lines
  DROP CONSTRAINT IF EXISTS sales_order_lines_vendor_approval_state_check;

ALTER TABLE sales_order_lines
  DROP CONSTRAINT IF EXISTS sales_order_lines_below_floor_reason_check;

ALTER TABLE sales_order_lines
  DROP CONSTRAINT IF EXISTS sales_order_lines_landed_cost_basis_check;

ALTER TABLE sales_order_lines
  DROP COLUMN IF EXISTS vendor_approval_state,
  DROP COLUMN IF EXISTS below_floor_note,
  DROP COLUMN IF EXISTS below_floor_reason,
  DROP COLUMN IF EXISTS price_floor,
  DROP COLUMN IF EXISTS landed_cost_reason;

ALTER TABLE sales_orders
  DROP COLUMN IF EXISTS loss_recognized_total,
  DROP COLUMN IF EXISTS margin_waived_total,
  DROP COLUMN IF EXISTS vendor_approval_pending;
