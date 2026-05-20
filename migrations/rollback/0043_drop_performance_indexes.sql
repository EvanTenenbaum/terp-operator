-- Rollback for 0043_performance_indexes.sql
-- Issue #17 slice 4: PERF-A1 / PERF-A2 / PERF-A3.
--
-- DROP INDEX CONCURRENTLY also cannot run inside an explicit transaction, so
-- this file (like the forward migration) is intentionally NOT wrapped in
-- BEGIN/COMMIT. migrate.ts auto-detects the CONCURRENTLY keyword and runs the
-- file in auto-commit mode. IF EXISTS makes rollback idempotent.

DROP INDEX CONCURRENTLY IF EXISTS command_journal_affected_ids_gin;

DROP INDEX CONCURRENTLY IF EXISTS batches_created_at_active_idx;
DROP INDEX CONCURRENTLY IF EXISTS batches_archived_at_idx;

DROP INDEX CONCURRENTLY IF EXISTS sales_orders_customer_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS invoices_customer_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS payments_customer_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS vendor_bills_vendor_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS purchase_receipts_vendor_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS inventory_movements_batch_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS fulfillment_lines_pick_list_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS pick_lists_order_id_idx;
