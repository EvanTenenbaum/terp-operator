-- Product Filtering System - Phase 1, Task 1.9
-- Spec Reference: 2026-05-17-product-filtering-system-design-v2.md lines 224-266
-- Original Spec Name: 2026_05_17_009_create_views.sql

DROP VIEW IF EXISTS batches_customer_safe CASCADE;
DROP VIEW IF EXISTS batches_operator CASCADE;

-- Customer-safe view: only aliases, posted batches, snapshot columns prevent race conditions
CREATE OR REPLACE VIEW batches_customer_safe AS
SELECT
  b.id,
  b.batch_code,
  b.name,
  b.category,
  b.subcategory,
  b.tags,
  b.available_qty,
  b.unit_price,
  b.location,
  b.intake_date,
  b.status,
  b.photo_url,
  b.media_status,
  b.brand_alias as brand_name,
  b.vendor_alias as vendor_name
FROM batches b
WHERE b.status = 'posted'
  AND b.archived_at IS NULL
  AND b.brand_alias IS NOT NULL
  AND b.vendor_alias IS NOT NULL;

-- Operator view: real names for internal use
CREATE OR REPLACE VIEW batches_operator AS
SELECT
  b.*,
  br.name as brand_real_name,
  br.alias as brand_current_alias,
  v.name as vendor_real_name,
  v.alias as vendor_current_alias
FROM batches b
LEFT JOIN brands br ON br.id = b.brand_id
LEFT JOIN vendors v ON v.id = b.vendor_id;

COMMENT ON VIEW batches_customer_safe IS 'DEPENDENCIES: Requires batches.brand_alias and batches.vendor_alias columns. Drop view before dropping columns.';
COMMENT ON VIEW batches_operator IS 'Internal operator view with real brand/vendor names';
