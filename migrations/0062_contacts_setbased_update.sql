-- migrations/0062_contacts_setbased_update.sql
-- GH #299: Set-based equivalent of the row-by-row PL/pgSQL loops in
-- migration 0054_contacts_system.sql.
--
-- Background:
-- Migration 0054 used five FOR r IN SELECT ... LOOP blocks to backfill
-- existing customers, vendors, referees, payment_processors, and users into
-- the new contacts table. Each iteration does one INSERT + one UPDATE per
-- entity row, which is O(n) round-trips and holds a long-lived lock on the
-- entity table during migration. On large datasets this is slow and risky.
--
-- This companion migration re-runs the same backfill logic as set-based SQL.
-- Because 0054 guards each INSERT with WHERE contact_id IS NULL, this
-- migration is idempotent: rows already linked to a contact are skipped.
-- If 0054 ran successfully, this migration is a no-op and completes in
-- microseconds.
--
-- Set-based approach:
-- 1. INSERT INTO contacts (...) SELECT ... FROM <entity> WHERE contact_id IS NULL
-- 2. UPDATE <entity> SET contact_id = c.id FROM contacts c WHERE ...
--    using a join on the newly-inserted contact rows.
--
-- This runs as a single scan per table instead of one round-trip per row.

-- ─── 1. customers ────────────────────────────────────────────────────────────
WITH inserted AS (
  INSERT INTO contacts (name, notes, tags, is_customer, active, created_at, updated_at)
  SELECT c.name, c.notes, c.tags, true, true, c.created_at, c.updated_at
  FROM customers c
  WHERE c.contact_id IS NULL
  RETURNING id, name, created_at
)
UPDATE customers
SET contact_id = inserted.id
FROM inserted
WHERE customers.contact_id IS NULL
  AND customers.name = inserted.name
  AND customers.created_at = inserted.created_at;

-- ─── 2. vendors ──────────────────────────────────────────────────────────────
WITH inserted AS (
  INSERT INTO contacts (name, notes, is_vendor, active, created_at, updated_at)
  SELECT v.name, v.notes, true, true, v.created_at, v.updated_at
  FROM vendors v
  WHERE v.contact_id IS NULL
  RETURNING id, name, created_at
)
UPDATE vendors
SET contact_id = inserted.id
FROM inserted
WHERE vendors.contact_id IS NULL
  AND vendors.name = inserted.name
  AND vendors.created_at = inserted.created_at;

-- ─── 3. referees ─────────────────────────────────────────────────────────────
WITH inserted AS (
  INSERT INTO contacts (name, email, phone, notes, is_referee, active, created_at, updated_at)
  SELECT r.name, r.email, r.phone, r.notes, true, r.active, r.created_at, r.updated_at
  FROM referees r
  WHERE r.contact_id IS NULL
  RETURNING id, name, created_at
)
UPDATE referees
SET contact_id = inserted.id
FROM inserted
WHERE referees.contact_id IS NULL
  AND referees.name = inserted.name
  AND referees.created_at = inserted.created_at;

-- ─── 4. payment_processors ───────────────────────────────────────────────────
WITH inserted AS (
  INSERT INTO contacts (name, notes, is_processor, active, created_at, updated_at)
  SELECT pp.name, pp.notes, true, pp.active, pp.created_at, pp.updated_at
  FROM payment_processors pp
  WHERE pp.contact_id IS NULL
  RETURNING id, name, created_at
)
UPDATE payment_processors
SET contact_id = inserted.id
FROM inserted
WHERE payment_processors.contact_id IS NULL
  AND payment_processors.name = inserted.name
  AND payment_processors.created_at = inserted.created_at;

-- ─── 5. users (active only) ──────────────────────────────────────────────────
WITH inserted AS (
  INSERT INTO contacts (name, email, is_employee, active, created_at, updated_at)
  SELECT u.name, u.email, true, true, u.created_at, u.updated_at
  FROM users u
  WHERE u.active = true AND u.contact_id IS NULL
  RETURNING id, email, created_at
)
UPDATE users
SET contact_id = inserted.id
FROM inserted
WHERE users.contact_id IS NULL
  AND users.email = inserted.email
  AND users.created_at = inserted.created_at;
