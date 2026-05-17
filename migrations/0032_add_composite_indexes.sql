-- Migration: Add composite indexes for common filter combinations
-- Addresses ARCH-HIGH-1: Missing Composite Index for Common Filters

-- Composite indexes for common filter combinations
-- These significantly speed up multi-column WHERE clauses

-- Category + Status (very common: "show me posted Flower products")
CREATE INDEX idx_batches_category_status
  ON batches (category, status)
  WHERE archived_at IS NULL;

-- Category + Subcategory (common: "show me Flower > Pre-Rolls")
CREATE INDEX idx_batches_category_subcategory
  ON batches (category, subcategory)
  WHERE archived_at IS NULL;

-- Brand + Vendor (common: "show me products from this brand/vendor combo")
CREATE INDEX idx_batches_brand_vendor
  ON batches (brand_id, vendor_id)
  WHERE archived_at IS NULL AND brand_id IS NOT NULL AND vendor_id IS NOT NULL;

-- Status + Intake Date (common: "show me recently posted products")
CREATE INDEX idx_batches_status_intake
  ON batches (status, intake_date DESC)
  WHERE archived_at IS NULL;

-- Category + Unit Price (common: "show me cheap Flower")
CREATE INDEX idx_batches_category_price
  ON batches (category, unit_price)
  WHERE archived_at IS NULL;

-- Location + Status (common: "show me posted products in Vault A")
CREATE INDEX idx_batches_location_status
  ON batches (location, status)
  WHERE archived_at IS NULL;

COMMENT ON INDEX idx_batches_category_status IS 'Optimizes filters combining category and status (e.g., posted Flower products)';
COMMENT ON INDEX idx_batches_category_subcategory IS 'Optimizes category drill-down filters';
COMMENT ON INDEX idx_batches_brand_vendor IS 'Optimizes brand+vendor combination filters';
COMMENT ON INDEX idx_batches_status_intake IS 'Optimizes recent product queries by status';
COMMENT ON INDEX idx_batches_category_price IS 'Optimizes price-range queries within categories';
COMMENT ON INDEX idx_batches_location_status IS 'Optimizes location-based inventory queries';
