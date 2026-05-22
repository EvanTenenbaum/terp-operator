-- Rollback for 0051_add_subcategory_to_po_lines.sql
DROP INDEX IF EXISTS purchase_order_lines_subcategory_idx;
ALTER TABLE purchase_order_lines DROP COLUMN IF EXISTS subcategory;
