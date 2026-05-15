-- Feature 2: PO Cost Range Dual-Input
-- Add cost_range_low and cost_range_high to purchase_order_lines
-- with mutual exclusivity constraint (unitCost XOR costRange)

ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS cost_range_low numeric(12, 2),
  ADD COLUMN IF NOT EXISTS cost_range_high numeric(12, 2);

-- Constraint: unitCost XOR (costRangeLow && costRangeHigh)
-- Either unitCost > 0 with nullranges, OR unitCost = 0 with valid range
ALTER TABLE purchase_order_lines
  ADD CONSTRAINT po_line_cost_exclusivity
  CHECK (
    (unit_cost > 0 AND cost_range_low IS NULL AND cost_range_high IS NULL)
    OR
    (unit_cost = 0 AND cost_range_low > 0 AND cost_range_high > 0 AND cost_range_low <= cost_range_high)
  );
