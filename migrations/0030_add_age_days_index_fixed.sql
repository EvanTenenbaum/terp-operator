-- Migration: Add indexes for ageDays computed field queries
-- Addresses ARCH-CRIT-2: Missing Index for ageDays
--
-- Note: Cannot create functional index with NOW() (volatile function)
-- Instead, index on intake_date which PostgreSQL can use for ageDays calculations

-- Index on intake_date for ageDays calculations
-- Query optimizer can use this for: WHERE DATE_PART('day', NOW() - intake_date) > 30
CREATE INDEX IF NOT EXISTS idx_batches_age_days
  ON batches (intake_date DESC)
  WHERE archived_at IS NULL;

-- Partial index for recent batches (last 30 days)
CREATE INDEX IF NOT EXISTS idx_batches_recent_30days
  ON batches (intake_date DESC, category, status)
  WHERE archived_at IS NULL
    AND intake_date >= CURRENT_DATE - INTERVAL '30 days';

-- Partial index for recent batches (last 90 days)
CREATE INDEX IF NOT EXISTS idx_batches_recent_90days
  ON batches (intake_date DESC, category, status)
  WHERE archived_at IS NULL
    AND intake_date >= CURRENT_DATE - INTERVAL '90 days';

COMMENT ON INDEX idx_batches_age_days IS 'Index on intake_date for ageDays computed field queries (e.g., ageDays > 30). PostgreSQL query planner can use this for DATE_PART calculations.';
COMMENT ON INDEX idx_batches_recent_30days IS 'Optimized for queries targeting items intake within last 30 days';
COMMENT ON INDEX idx_batches_recent_90days IS 'Optimized for queries targeting items intake within last 90 days';
