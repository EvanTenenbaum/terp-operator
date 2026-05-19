-- Backfill existing batches.photoUrl values into batch_media as primary_photo published rows
-- This ensures MediaView shows existing photos from day 1 at flag-flip,
-- without requiring re-uploads. The batches.photoUrl column stays as-is for
-- backward compatibility (Phase 4 will eventually drop it after 90 days).

INSERT INTO batch_media (
  id,
  batch_id,
  file_path,
  original_filename,
  file_size,
  mime_type,
  media_type,
  role,
  status,
  published_at,
  uploaded_by,
  notes,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  b.id,
  b.photo_url,
  COALESCE(SUBSTRING(b.photo_url FROM '[^/]+$'), 'backfilled-photo'),
  0,                       -- file_size unknown for legacy URLs (0 = sentinel)
  'image/jpeg',            -- assumed; legacy data may include other types but no mime tracking
  'photo',
  'primary_photo',
  'published',
  now(),
  NULL,                    -- uploaded_by unknown
  'Backfilled from batches.photoUrl on ' || to_char(now(), 'YYYY-MM-DD'),
  now(),
  now()
FROM batches b
WHERE b.photo_url IS NOT NULL
  AND b.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM batch_media bm
    WHERE bm.batch_id = b.id
      AND bm.role = 'primary_photo'
      AND bm.status = 'published'
      AND bm.replaced_at IS NULL
  );

-- Log the backfill count for verification
DO $$
DECLARE
  backfill_count int;
BEGIN
  SELECT COUNT(*) INTO backfill_count
  FROM batch_media
  WHERE notes LIKE 'Backfilled from batches.photoUrl%';
  RAISE NOTICE 'Photography backfill: % rows inserted', backfill_count;
END$$;
