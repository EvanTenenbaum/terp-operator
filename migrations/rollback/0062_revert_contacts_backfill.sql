-- Rollback for migrations/0062_contacts_setbased_update.sql
--
-- Reverses the set-based contact backfill (DML — INSERT + UPDATE) by
-- NULLing out contact_id on all five entity tables.
--
-- IMPORTANT: This rollback does NOT delete orphaned contact rows. Contacts
-- are referenced by appointments and contact_ledger_entries with
-- ON DELETE CASCADE (migration 0054), so deleting contacts could
-- cascade-delete operational data. Orphaned contact rows left by this
-- rollback are harmless — they consume storage but do not affect
-- application behavior. Clean up orphaned contacts manually if needed:
--
--   DELETE FROM contacts c
--   WHERE NOT EXISTS (SELECT 1 FROM customers WHERE contact_id = c.id)
--     AND NOT EXISTS (SELECT 1 FROM vendors WHERE contact_id = c.id)
--     AND NOT EXISTS (SELECT 1 FROM referees WHERE contact_id = c.id)
--     AND NOT EXISTS (SELECT 1 FROM payment_processors WHERE contact_id = c.id)
--     AND NOT EXISTS (SELECT 1 FROM users WHERE contact_id = c.id)
--     AND NOT EXISTS (SELECT 1 FROM appointments WHERE contact_id = c.id)
--     AND NOT EXISTS (SELECT 1 FROM contact_ledger_entries WHERE contact_id = c.id)
--     AND NOT EXISTS (SELECT 1 FROM contact_merge_history WHERE contact_a_id = c.id OR contact_b_id = c.id OR merged_into = c.id);
--
-- Run order: this rollback NULLs entity FK columns. It should be run
-- after any application code that requires contact links has been
-- reverted, or while the application is stopped.

-- 1. customers
UPDATE customers SET contact_id = NULL WHERE contact_id IS NOT NULL;

-- 2. vendors
UPDATE vendors SET contact_id = NULL WHERE contact_id IS NOT NULL;

-- 3. referees
UPDATE referees SET contact_id = NULL WHERE contact_id IS NOT NULL;

-- 4. payment_processors
UPDATE payment_processors SET contact_id = NULL WHERE contact_id IS NOT NULL;

-- 5. users (0062 only backfilled active users, but we NULL all for safety)
UPDATE users SET contact_id = NULL WHERE contact_id IS NOT NULL;
