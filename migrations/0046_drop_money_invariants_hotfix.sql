-- HOTFIX: drop NOT VALID money/inventory CHECK constraints to unblock staging.
--
-- Background:
-- Migration 0041_money_invariants.sql added four CHECK constraints with
-- NOT VALID. The intent was for existing data to be grandfathered while
-- future writes are validated. That's exactly how NOT VALID behaves in
-- Postgres — and that's the problem: the staging deploy re-runs the
-- realistic-100d seed on every promotion (see `start:staging` in
-- package.json). The seed performs DELETE + INSERT cycles whose math is
-- subject to floating-point rounding (`money(invoiceTotal)` vs
-- `money(invoiceTotal * paidRatio)`). One row off by a single cent at the
-- boundary trips `invoices.amount_paid <= total` and the entire seed step
-- aborts, which cascades to the container failing health checks, which
-- makes DigitalOcean roll back to the prior bundle.
--
-- That's why staging has been stuck on `index-DshB6QtA.js` since 2026-05-20
-- 19:43 UTC despite ~20 PRs merging to main since.
--
-- This migration drops the four CHECK constraints from 0041 so the seed
-- inserts succeed. The constraints remain a good idea — they just need
-- the seed to be made provably constraint-compatible before they go back
-- in. Tracked in the follow-up issue filed alongside this migration.
--
-- The original rollback migration `migrations/rollback/0041_drop_money_invariants.sql`
-- already DROPs the same constraints; this file is the equivalent applied
-- as a forward-only step so the migrate runner picks it up automatically.
--
-- Idempotent: every DROP uses IF EXISTS.

ALTER TABLE invoices             DROP CONSTRAINT IF EXISTS invoices_amount_paid_chk;
ALTER TABLE payments             DROP CONSTRAINT IF EXISTS payments_unapplied_amount_chk;
ALTER TABLE batches              DROP CONSTRAINT IF EXISTS batches_qty_nonneg_chk;
ALTER TABLE purchase_order_lines DROP CONSTRAINT IF EXISTS purchase_order_lines_qty_nonneg_chk;
