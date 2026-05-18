-- Product Filtering System - Phase 1, Task 1.3
-- Spec Reference: 2026-05-17-product-filtering-system-design-v2.md lines 99-140
-- Original Spec Name: 2026_05_17_003_add_batch_fields.sql

-- Add new columns to batches table
DO $$ BEGIN
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS subcategory varchar(80);
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE RESTRICT;
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS brand_alias varchar(80);
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS vendor_alias varchar(80);
  -- sort_id requires special handling for serial type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='sort_id') THEN
    ALTER TABLE batches ADD COLUMN sort_id bigserial NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN batches.sort_id IS 'Sequential ID for stable cursor-based pagination. More efficient than OFFSET at high pages. Uses BIGSERIAL for sequential ordering.';
COMMENT ON COLUMN batches.brand_alias IS 'SNAPSHOT: Prevents race condition when brand alias changes after batch creation';
COMMENT ON COLUMN batches.vendor_alias IS 'SNAPSHOT: Prevents race condition when vendor alias changes after batch creation';

-- NOTE: Constraint brand_vendor_alias_required will be added after trigger is created and aliases are backfilled
