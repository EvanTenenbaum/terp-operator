-- Product Filtering System - Phase 1, Task 1.8
-- Spec Reference: 2026-05-17-atomic-implementation-roadmap.md lines 317-330
-- Original Spec Name: 2026_05_17_008_backfill_sort_id.sql

-- Backfill sort_id with sequential values ordered by created_at
-- Skip if already populated (idempotent)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM batches WHERE sort_id IS NULL) OR
     EXISTS (SELECT 1 FROM batches GROUP BY sort_id HAVING COUNT(*) > 1) THEN
    WITH numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) as rn
      FROM batches
    )
    UPDATE batches SET sort_id = numbered.rn
    FROM numbered
    WHERE batches.id = numbered.id;
  END IF;
END $$;

-- Reset sequence to continue from max sort_id
SELECT setval('batches_sort_id_seq', COALESCE((SELECT MAX(sort_id) FROM batches), 1));
