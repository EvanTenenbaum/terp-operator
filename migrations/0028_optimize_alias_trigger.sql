-- Product Filtering System - Phase 1 Fix: Optimize trigger performance
-- Identified by: Adversarial Architecture Review (Critical Issue #4)

-- Drop old trigger
DROP TRIGGER IF EXISTS batch_alias_snapshot_trigger ON batches;

-- Create optimized trigger function (only re-query when IDs change)
CREATE OR REPLACE FUNCTION update_batch_alias_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update brand alias if brand_id changed or is new
  IF (TG_OP = 'INSERT' OR NEW.brand_id IS DISTINCT FROM OLD.brand_id) AND NEW.brand_id IS NOT NULL THEN
    SELECT alias INTO STRICT NEW.brand_alias FROM brands WHERE id = NEW.brand_id;
    IF NEW.brand_alias IS NULL THEN
      RAISE EXCEPTION 'Brand ID % has no alias - cannot create batch', NEW.brand_id;
    END IF;
  END IF;

  -- Only update vendor alias if vendor_id changed or is new
  IF (TG_OP = 'INSERT' OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id) AND NEW.vendor_id IS NOT NULL THEN
    SELECT alias INTO STRICT NEW.vendor_alias FROM vendors WHERE id = NEW.vendor_id;
    IF NEW.vendor_alias IS NULL THEN
      RAISE EXCEPTION 'Vendor ID % has no alias - cannot create batch', NEW.vendor_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create optimized trigger (removed 'status' from UPDATE OF clause)
CREATE TRIGGER batch_alias_snapshot_trigger
  BEFORE INSERT OR UPDATE OF brand_id, vendor_id ON batches
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_alias_snapshots();

COMMENT ON FUNCTION update_batch_alias_snapshots IS 'Optimized: Only re-queries aliases when brand_id or vendor_id actually changes, not on every status update';
