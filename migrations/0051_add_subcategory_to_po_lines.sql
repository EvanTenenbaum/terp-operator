-- Add subcategory to purchase_order_lines to match batches.subcategory
-- Enables subcategory-level market signals on the PO context panel (TER-1536/TER-1537)
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS subcategory varchar(80);
CREATE INDEX IF NOT EXISTS purchase_order_lines_subcategory_idx
  ON purchase_order_lines(subcategory)
  WHERE subcategory IS NOT NULL;
