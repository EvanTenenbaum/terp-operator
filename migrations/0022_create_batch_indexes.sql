-- Product Filtering System - Phase 1, Task 1.7
-- Spec Reference: 2026-05-17-product-filtering-system-design-v2.md lines 107-131
-- Original Spec Name: 2026_05_17_007_create_batch_indexes.sql

-- Single-column indexes
CREATE INDEX IF NOT EXISTS batches_subcategory_idx ON batches(subcategory);
CREATE INDEX IF NOT EXISTS batches_brand_idx ON batches(brand_id);
CREATE INDEX IF NOT EXISTS batches_tags_idx ON batches USING gin(tags array_ops);
CREATE INDEX IF NOT EXISTS batches_intake_date_idx ON batches(intake_date);
CREATE INDEX IF NOT EXISTS batches_sort_id_idx ON batches(sort_id);

-- Composite indexes for common filter combinations (column order matters)
CREATE INDEX IF NOT EXISTS batches_category_subcategory_idx ON batches(category, subcategory) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS batches_subcategory_category_idx ON batches(subcategory, category) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS batches_brand_vendor_idx ON batches(brand_id, vendor_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS batches_price_qty_idx ON batches(unit_price, available_qty) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS batches_category_brand_idx ON batches(category, brand_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS batches_vendor_category_idx ON batches(vendor_id, category) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS batches_status_category_idx ON batches(status, category);

-- Partial index for customer queries (most frequent)
CREATE INDEX IF NOT EXISTS batches_posted_idx ON batches(id, created_at, category, brand_id, vendor_id)
  WHERE status = 'posted' AND archived_at IS NULL;

-- Index on snapshot columns for customer filtering
CREATE INDEX IF NOT EXISTS batches_vendor_alias_idx ON batches(vendor_alias)
  WHERE status = 'posted' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS batches_brand_alias_idx ON batches(brand_alias)
  WHERE status = 'posted' AND archived_at IS NULL;
