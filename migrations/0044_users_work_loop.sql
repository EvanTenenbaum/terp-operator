-- Add explicit work_loop column to users (issue #21 slice 1, UX-01).
--
-- Background:
--   Pre-#21-slice-1 the client derived an operator's navigation lane from
--   substring matches on `email` and `name` (see legacyWorkLoopFromSubstring
--   in src/client/accessPolicy.ts). Two users with the same `role` could see
--   wildly different navigation based purely on whether their email contained
--   "sales", "intake", "receiv", "warehouse", "fulfill", or "pack". Fragile,
--   error-prone, and a real production smell.
--
-- What this migration does:
--   1. Adds a nullable VARCHAR(32) `work_loop` column to `users`.
--   2. Backfills the column from the SAME substring heuristic the client used
--      previously, so no operator's lane changes after deploy.
--   3. Leaves the column NULL for rows that did not match any keyword —
--      runtime workLoopForUser() then falls back to legacyWorkLoopFromSubstring
--      which would have returned 'operator' for those rows. We intentionally
--      do NOT bake the 'operator' default into the database; that keeps the
--      legacy fallback path the single source of truth for the "unmatched"
--      case.
--
-- Backfill precedence (must EXACTLY mirror legacyWorkLoopFromSubstring):
--   1. lower(email|name) contains 'sales'                              → 'sales'
--   2. lower(email|name) contains 'intake'  OR 'receiv'                → 'intake'
--   3. lower(email|name) contains 'warehouse' OR 'fulfill' OR 'pack'   → 'warehouse'
--   4. otherwise → NULL (runtime fallback → 'operator')
--
-- Each UPDATE is guarded by `work_loop IS NULL` so the precedence order
-- (sales > intake > warehouse) is honored even when a haystack matches
-- multiple keywords.

ALTER TABLE users ADD COLUMN IF NOT EXISTS work_loop VARCHAR(32);

-- Step 1: sales (highest priority).
UPDATE users
SET work_loop = 'sales'
WHERE work_loop IS NULL
  AND (lower(email) LIKE '%sales%' OR lower(name) LIKE '%sales%');

-- Step 2: intake (also catches 'receiv*' — receiving, receiver, receives).
UPDATE users
SET work_loop = 'intake'
WHERE work_loop IS NULL
  AND (
    lower(email) LIKE '%intake%' OR lower(name) LIKE '%intake%'
    OR lower(email) LIKE '%receiv%' OR lower(name) LIKE '%receiv%'
  );

-- Step 3: warehouse (also catches 'fulfill*' and 'pack*' — packer, packing).
UPDATE users
SET work_loop = 'warehouse'
WHERE work_loop IS NULL
  AND (
    lower(email) LIKE '%warehouse%' OR lower(name) LIKE '%warehouse%'
    OR lower(email) LIKE '%fulfill%'   OR lower(name) LIKE '%fulfill%'
    OR lower(email) LIKE '%pack%'      OR lower(name) LIKE '%pack%'
  );

-- Unmatched rows stay NULL on purpose — see header comment.
