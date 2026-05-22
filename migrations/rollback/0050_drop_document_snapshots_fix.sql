-- Rollback 0050: re-drop the recreated table. The original stale table
-- is not restored (it contained no rows).
DROP TABLE IF EXISTS document_snapshots CASCADE;
