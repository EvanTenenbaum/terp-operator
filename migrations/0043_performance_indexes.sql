-- 0043_performance_indexes.sql
-- Issue #17 slice 4: PERF-A1 / PERF-A2 / PERF-A3 — missing performance indexes.
--
-- Every statement here uses the CONCURRENTLY option so it cannot take an
-- AccessExclusiveLock on a production table. Postgres forbids concurrent DDL
-- inside an explicit transaction, so this file is intentionally NOT wrapped in
-- BEGIN/COMMIT — migrate.ts detects the CONCURRENTLY keyword (via
-- isConcurrentMigration, added in PR #88) and runs the file in auto-commit
-- mode. IF NOT EXISTS keeps the migration idempotent across retries / partial
-- failures (CONCURRENTLY index builds can leave INVALID indexes behind).
--
-- Rollback: migrations/rollback/0043_drop_performance_indexes.sql

-- ─────────────────────────────────────────────────────────────────────────
-- PERF-A1: GIN index on command_journal.affected_ids (text[]).
--
-- Every dashboard / drawer / recovery query searches the journal with
--   affected_ids::text ILIKE '%uuid%'
-- which forces a sequential scan over the whole journal. A GIN index on the
-- array column lets Postgres answer `affected_ids @> ARRAY['uuid']` (and the
-- @> operator we are migrating those callers toward) in log time.
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS command_journal_affected_ids_gin
  ON command_journal USING gin (affected_ids);

-- ─────────────────────────────────────────────────────────────────────────
-- PERF-A2: batches list filters by archived_at IS NULL and orders by
-- created_at DESC. A partial btree covering only the active subset keeps the
-- index small and matches the hot path exactly. We also index archived_at on
-- its own for the archived-batches reports.
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS batches_created_at_active_idx
  ON batches (created_at DESC) WHERE archived_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS batches_archived_at_idx
  ON batches (archived_at);

-- ─────────────────────────────────────────────────────────────────────────
-- PERF-A3: Postgres does NOT auto-index FK columns. Every FK column in a hot
-- path needs an explicit btree index — without one, referential-integrity
-- checks (cascades, set-null) and join paths sequentially scan the child
-- table. Each index below covers a known hot join / cascade target.
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS sales_orders_customer_id_idx
  ON sales_orders (customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS invoices_customer_id_idx
  ON invoices (customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_customer_id_idx
  ON payments (customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS vendor_bills_vendor_id_idx
  ON vendor_bills (vendor_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS purchase_receipts_vendor_id_idx
  ON purchase_receipts (vendor_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_movements_batch_id_idx
  ON inventory_movements (batch_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS fulfillment_lines_pick_list_id_idx
  ON fulfillment_lines (pick_list_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS pick_lists_order_id_idx
  ON pick_lists (order_id);
