-- Migration: Fix alias snapshot trigger to handle NULL brand_id/vendor_id gracefully
-- Addresses ARCH-CRIT-4: Trigger Performance Regression Risk

-- Replace the optimized trigger with NULL-safe version
CREATE OR REPLACE FUNCTION update_batch_alias_snapshots()
RETURNS TRIGGER AS $$
BEGIN
  -- Only re-query if brand_id or vendor_id changed
  -- (Optimization from migration 0028)
  IF (TG_OP = 'INSERT') OR
     (TG_OP = 'UPDATE' AND (OLD.brand_id IS DISTINCT FROM NEW.brand_id OR OLD.vendor_id IS DISTINCT FROM NEW.vendor_id)) THEN

    -- Brand alias (NULL-safe)
    -- If brand_id is NULL or doesn't exist in brands table, set alias to NULL
    IF NEW.brand_id IS NOT NULL THEN
      SELECT name INTO NEW.brand_alias
      FROM brands
      WHERE id = NEW.brand_id;

      -- If no brand found, set to NULL (defensive)
      IF NOT FOUND THEN
        NEW.brand_alias := NULL;
      END IF;
    ELSE
      NEW.brand_alias := NULL;
    END IF;

    -- Vendor alias (NULL-safe)
    -- If vendor_id is NULL or doesn't exist in vendors table, set alias to NULL
    IF NEW.vendor_id IS NOT NULL THEN
      SELECT name INTO NEW.vendor_alias
      FROM vendors
      WHERE id = NEW.vendor_id;

      -- If no vendor found, set to NULL (defensive)
      IF NOT FOUND THEN
        NEW.vendor_alias := NULL;
      END IF;
    ELSE
      NEW.vendor_alias := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (in case function signature changed)
DROP TRIGGER IF EXISTS batches_alias_snapshot_trigger ON batches;
CREATE TRIGGER batches_alias_snapshot_trigger
  BEFORE INSERT OR UPDATE ON batches
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_alias_snapshots();

COMMENT ON FUNCTION update_batch_alias_snapshots IS 'Snapshot brand/vendor names at insert/update time. NULL-safe: handles NULL IDs and missing foreign key records gracefully.';
