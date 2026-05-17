-- Migration: Add functional indexes for computed ageDays field
-- Addresses ARCH-CRIT-2: Missing Functional Index for ageDays

-- Functional index for ageDays computed field (for filters on age)
CREATE INDEX idx_batches_age_days
  ON batches (DATE_PART('day', NOW() - intake_date))
  WHERE archived_at IS NULL;

-- Partial indexes for common age ranges (faster for specific queries)
CREATE INDEX idx_batches_recent_30days
  ON batches (intake_date DESC)
  WHERE archived_at IS NULL
    AND intake_date >= (NOW() - INTERVAL '30 days');

CREATE INDEX idx_batches_recent_90days
  ON batches (intake_date DESC)
  WHERE archived_at IS NULL
    AND intake_date >= (NOW() - INTERVAL '90 days');

-- Index on intake_date for general date-based queries
CREATE INDEX idx_batches_intake_date
  ON batches (intake_date DESC)
  WHERE archived_at IS NULL;

COMMENT ON INDEX idx_batches_age_days IS 'Functional index for ageDays computed field filters (e.g., ageDays > 30)';
COMMENT ON INDEX idx_batches_recent_30days IS 'Optimized for queries targeting items intake within last 30 days';
COMMENT ON INDEX idx_batches_recent_90days IS 'Optimized for queries targeting items intake within last 90 days';
