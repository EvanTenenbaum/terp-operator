-- Product Filtering System - Phase 1 Fix: Add missing constraints
-- Identified by: All Three Adversarial Reviews (Critical Issue #1)

-- Add constraint to enforce aliases on posted batches (only when IDs exist)
-- If brand_id is NULL, brand_alias can be NULL (brand not yet assigned)
-- If vendor_id is NULL, vendor_alias can be NULL (should be rare)
-- If brand_id IS NOT NULL, brand_alias MUST be populated
-- If vendor_id IS NOT NULL, vendor_alias MUST be populated
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_vendor_alias_required') THEN
    ALTER TABLE batches ADD CONSTRAINT brand_vendor_alias_required
      CHECK (
        status != 'posted' OR (
          (brand_id IS NULL OR brand_alias IS NOT NULL) AND
          (vendor_id IS NULL OR vendor_alias IS NOT NULL)
        )
      );
  END IF;
END $$;

-- Add constraints to prevent empty string aliases
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brands_alias_not_empty') THEN
    ALTER TABLE brands ADD CONSTRAINT brands_alias_not_empty
      CHECK (length(trim(alias)) > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_alias_not_empty') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_alias_not_empty
      CHECK (length(trim(alias)) > 0);
  END IF;
END $$;

COMMENT ON CONSTRAINT brand_vendor_alias_required ON batches IS 'Posted batches must have both brand and vendor aliases populated to prevent customer-facing data gaps';
COMMENT ON CONSTRAINT brands_alias_not_empty ON brands IS 'Prevents empty string aliases which would bypass uniqueness constraints';
COMMENT ON CONSTRAINT vendors_alias_not_empty ON vendors IS 'Prevents empty string aliases';
