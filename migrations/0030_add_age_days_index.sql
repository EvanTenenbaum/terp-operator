-- Migration: Add indexes for ageDays computed field queries
-- Addresses ARCH-CRIT-2: Missing Index for ageDays
--
-- Note: Cannot create functional index with NOW() or CURRENT_DATE (volatile/stable functions)
-- Instead, index on intake_date which PostgreSQL can use for ageDays calculations

-- Index on intake_date for ageDays calculations
-- Query optimizer can use this for: WHERE DATE_PART('day', NOW() - intake_date) > 30
CREATE INDEX IF NOT EXISTS idx_batches_age_days
  ON batches (intake_date DESC)
  WHERE archived_at IS NULL;

-- Composite indexes for common date-based queries
-- Note: Cannot use CURRENT_DATE in index predicate, so we use broader indexes
CREATE INDEX IF NOT EXISTS idx_batches_recent_intake
  ON batches (intake_date DESC, category, status)
  WHERE archived_at IS NULL;

COMMENT ON INDEX idx_batches_age_days IS 'Index on intake_date for ageDays computed field queries (e.g., ageDays > 30). PostgreSQL query planner can use this for DATE_PART calculations.';
COMMENT ON INDEX idx_batches_recent_intake IS 'Optimized for recent intake date queries with category and status';
