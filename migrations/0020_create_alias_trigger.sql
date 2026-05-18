-- Product Filtering System - Phase 1, Task 1.5
-- Spec Reference: 2026-05-17-product-filtering-system-design-v2.md lines 168-198
-- Original Spec Name: 2026_05_17_005_create_alias_trigger.sql

CREATE OR REPLACE FUNCTION update_batch_alias_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  -- Populate brand alias snapshot
  IF NEW.brand_id IS NOT NULL THEN
    SELECT alias INTO NEW.brand_alias FROM brands WHERE id = NEW.brand_id;
    IF NEW.brand_alias IS NULL THEN
      RAISE EXCEPTION 'Brand ID % has no alias - cannot create batch', NEW.brand_id;
    END IF;
  END IF;

  -- Populate vendor alias snapshot
  IF NEW.vendor_id IS NOT NULL THEN
    SELECT alias INTO NEW.vendor_alias FROM vendors WHERE id = NEW.vendor_id;
    IF NEW.vendor_alias IS NULL THEN
      RAISE EXCEPTION 'Vendor ID % has no alias - cannot create batch', NEW.vendor_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_alias_snapshot_trigger
  BEFORE INSERT OR UPDATE OF brand_id, vendor_id, status ON batches
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_alias_snapshots();

COMMENT ON FUNCTION update_batch_alias_snapshots IS 'Ensures brand_alias and vendor_alias are populated before batch insert/update to prevent race conditions';
