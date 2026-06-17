-- rollback: 0084_command_journal_bulk_index
DROP INDEX CONCURRENTLY IF EXISTS command_journal_bulk_group_seq_idx;
