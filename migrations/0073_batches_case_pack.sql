-- TER-1618 follow-up: add case_pack column to batches
-- case_pack: wholesale case pack quantity for this item.
-- Nullable — not all items have a standard case pack.
ALTER TABLE batches ADD COLUMN IF NOT EXISTS case_pack INTEGER DEFAULT NULL;
