-- Create computed view for batch media aggregates
-- NOTE: The batches table does not have an `active` boolean column in this codebase.
-- It uses `archived_at` (soft-delete pattern). The WHERE clause below has been adapted
-- accordingly: `archived_at IS NULL` is the canonical "active batch" filter here.
CREATE VIEW batch_media_summary AS
SELECT
  b.id AS batch_id,
  b.batch_code,
  b.name,
  COUNT(bm.id) FILTER (WHERE bm.status = 'published') AS published_media_count,
  COUNT(bm.id) FILTER (WHERE bm.status = 'draft') AS draft_media_count,
  COUNT(bm.id) AS total_media_count,
  MAX(bm.created_at) FILTER (WHERE bm.role = 'primary_photo' AND bm.status = 'published' AND bm.replaced_at IS NULL) IS NOT NULL AS has_primary_photo,
  MAX(bm.created_at) FILTER (WHERE bm.role = 'primary_video' AND bm.status = 'published' AND bm.replaced_at IS NULL) IS NOT NULL AS has_primary_video,
  MAX(bm.updated_at) AS media_updated_at
FROM batches b
LEFT JOIN batch_media bm ON bm.batch_id = b.id AND bm.replaced_at IS NULL
WHERE b.archived_at IS NULL
GROUP BY b.id, b.batch_code, b.name;
