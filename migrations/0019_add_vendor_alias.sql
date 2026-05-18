-- Product Filtering System - Phase 1, Task 1.4
-- Spec Reference: 2026-05-17-product-filtering-system-design-v2.md lines 143-162
-- Original Spec Name: 2026_05_17_004_add_vendor_alias.sql

-- Step 1: Add column as nullable
DO $$ BEGIN
  ALTER TABLE vendors ADD COLUMN IF NOT EXISTS alias varchar(80);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Step 2: Backfill with default values
UPDATE vendors SET alias = name || ' (Alias)' WHERE alias IS NULL;

-- Step 3: Add NOT NULL constraint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='alias' AND is_nullable='YES') THEN
    ALTER TABLE vendors ALTER COLUMN alias SET NOT NULL;
  END IF;
END $$;

-- Step 4: Set default for future rows
DO $$ BEGIN
  ALTER TABLE vendors ALTER COLUMN alias SET DEFAULT 'Vendor TBD';
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Step 5: Add index
CREATE INDEX IF NOT EXISTS vendors_alias_idx ON vendors(alias);

-- Optimize for updates
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'vendors') THEN
    ALTER TABLE vendors SET (fillfactor = 95);
  END IF;
END $$;
