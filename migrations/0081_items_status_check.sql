-- GH #376: add CHECK constraint on items.status
-- Only add if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_status_check'
  ) THEN
    ALTER TABLE items ADD CONSTRAINT items_status_check CHECK (status IN ('active', 'inactive'));
  END IF;
END $$;
