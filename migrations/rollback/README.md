# Migration Rollback Procedures

Each forward migration in `migrations/NNNN_*.sql` may have a paired rollback at `migrations/rollback/NNNN_*.sql`. Rollbacks are NOT run automatically — they are executed manually only when a full feature reversal is required.

## Photography Module rollbacks (Phase 1 will create these)

- `0033_drop_batch_media.sql` — drops `batch_media` and all its indexes (DESTRUCTIVE: deletes all media records)
- `0034_drop_policies.sql` — drops `media_retention_policies` and `media_cleanup_log`
- `0035_drop_view.sql` — drops the `batch_media_summary` view

## Procedure

1. Stop the application.
2. Back up the database and the storage directory:
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   tar -czf media_$(date +%Y%m%d).tar.gz storage/media/
   ```
3. Run rollbacks in **reverse** order:
   ```bash
   psql $DATABASE_URL -f migrations/rollback/0035_drop_view.sql
   psql $DATABASE_URL -f migrations/rollback/0034_drop_policies.sql
   psql $DATABASE_URL -f migrations/rollback/0033_drop_batch_media.sql
   ```
4. Verify:
   ```bash
   psql $DATABASE_URL -c "\d batch_media"   # should report: relation does not exist
   ```
5. Revert the application code (`git revert <commit>`) and redeploy.

## DO NOT run rollbacks without:
- A current backup
- Operator (Evan) approval
- A documented reason
