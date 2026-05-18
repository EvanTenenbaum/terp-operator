-- Product Filtering System - Phase 1 Fix: Backfill aliases for existing batches
-- Identified by: Adversarial QA Review (Critical Issue #2)

-- Backfill brand_alias for batches that have brand_id
UPDATE batches b
SET brand_alias = br.alias
FROM brands br
WHERE b.brand_id = br.id
  AND b.brand_alias IS NULL;

-- Backfill vendor_alias for batches that have vendor_id
UPDATE batches b
SET vendor_alias = v.alias
FROM vendors v
WHERE b.vendor_id = v.id
  AND b.vendor_alias IS NULL;

-- Log status
DO $$
DECLARE
  brand_count INTEGER;
  vendor_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO brand_count FROM batches WHERE brand_alias IS NOT NULL;
  SELECT COUNT(*) INTO vendor_count FROM batches WHERE vendor_alias IS NOT NULL;
  RAISE NOTICE 'Backfill complete: % batches with brand_alias, % with vendor_alias', brand_count, vendor_count;
END $$;
