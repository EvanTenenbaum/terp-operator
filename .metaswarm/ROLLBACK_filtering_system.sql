-- Product Filtering System - Phase 1, Task 1.10
-- ROLLBACK MIGRATION - Reverses all Phase 1 database changes
-- Original Spec Name: 2026_05_17_rollback_filtering_system.sql
--
-- WARNING: This migration drops tables, columns, indexes, triggers, and views
-- created for the product filtering system. Only run this if you need to
-- completely remove the filtering system from the database.
--
-- To use: Manually execute this SQL when rollback is needed

BEGIN;

-- Drop views first (they depend on columns)
DROP VIEW IF EXISTS batches_customer_safe CASCADE;
DROP VIEW IF EXISTS batches_operator CASCADE;

-- Drop triggers
DROP TRIGGER IF EXISTS batch_alias_snapshot_trigger ON batches;
DROP TRIGGER IF EXISTS update_brands_updated_at ON brands;
DROP TRIGGER IF EXISTS update_saved_filters_updated_at ON saved_filters;

-- Drop functions
DROP FUNCTION IF EXISTS update_batch_alias_snapshots();
-- Note: update_updated_at_column() might be used by other tables, so not dropping it

-- Drop indexes on batches table
DROP INDEX IF EXISTS batches_brand_alias_idx;
DROP INDEX IF EXISTS batches_vendor_alias_idx;
DROP INDEX IF EXISTS batches_posted_idx;
DROP INDEX IF EXISTS batches_status_category_idx;
DROP INDEX IF EXISTS batches_vendor_category_idx;
DROP INDEX IF EXISTS batches_category_brand_idx;
DROP INDEX IF EXISTS batches_price_qty_idx;
DROP INDEX IF EXISTS batches_brand_vendor_idx;
DROP INDEX IF EXISTS batches_subcategory_category_idx;
DROP INDEX IF EXISTS batches_category_subcategory_idx;
DROP INDEX IF EXISTS batches_sort_id_idx;
DROP INDEX IF EXISTS batches_intake_date_idx;
DROP INDEX IF EXISTS batches_tags_idx;
DROP INDEX IF EXISTS batches_brand_idx;
DROP INDEX IF EXISTS batches_subcategory_idx;

-- Drop constraint on batches
ALTER TABLE batches DROP CONSTRAINT IF EXISTS brand_vendor_alias_required;

-- Drop columns from batches table
ALTER TABLE batches DROP COLUMN IF EXISTS sort_id;
ALTER TABLE batches DROP COLUMN IF EXISTS vendor_alias;
ALTER TABLE batches DROP COLUMN IF EXISTS brand_alias;
ALTER TABLE batches DROP COLUMN IF EXISTS brand_id;
ALTER TABLE batches DROP COLUMN IF EXISTS subcategory;

-- Drop vendor alias column and index
DROP INDEX IF EXISTS vendors_alias_idx;
ALTER TABLE vendors DROP COLUMN IF EXISTS alias;

-- Drop saved_filters table (CASCADE removes dependent objects)
DROP TABLE IF EXISTS saved_filters CASCADE;

-- Drop brands table (CASCADE removes dependent objects)
DROP TABLE IF EXISTS brands CASCADE;

COMMIT;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Product Filtering System rollback complete. All Phase 1 changes reversed.';
END $$;
