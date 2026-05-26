# Migrations

This directory contains **hand-written** SQL migrations for TERP Operator. They are the source of truth for schema changes and are applied at boot by `src/server/migrate.ts`.

## How migrations are applied

```bash
pnpm db:migrate          # dev (tsx src/server/migrate.ts)
pnpm db:migrate:prod     # prod (node dist/server/migrate.js)
```

The runner:

1. Ensures the `schema_migrations` bookkeeping table exists.
2. Lists every `*.sql` file in this directory and applies them in lexical order.
3. Skips files whose name already appears in `schema_migrations`.
4. Borrows ONE pooled `pg` client per file and runs `BEGIN`, the migration SQL, the bookkeeping `INSERT`, and `COMMIT` on that same client. On error, `ROLLBACK` runs on the same client and the client is released in `finally`. See `src/server/migrate.ts` (issue #17 slice 1).
5. If a file contains the `CONCURRENTLY` keyword (e.g. `CREATE INDEX CONCURRENTLY`), the runner skips the `BEGIN/COMMIT` wrapper and runs the SQL in auto-commit mode, because Postgres rejects concurrent DDL inside an explicit transaction.

## Numbering convention

Files are named `NNNN_short_description.sql` and applied in lexical order. The current range is `0001` through `0040` (with `0015b_create_organizations.sql` as a back-numbered insert between `0015` and `0016`).

When adding a new migration:

- Pick the next available `NNNN` prefix (zero-padded to four digits).
- Use snake_case for the descriptive suffix.
- Keep one logical change per file.
- If the file uses `CREATE INDEX CONCURRENTLY` or any other concurrent DDL, that file must contain only concurrent statements — the runner treats the entire file as non-transactional.

A `rollback/` subdirectory contains companion `down` scripts for selected migrations. Rollbacks are not automated; they exist for operator reference.

## drizzle-kit and this directory

`drizzle.config.ts` writes drizzle-kit generated artifacts to `./drizzle/`, NOT to this directory (issue #17 slice 2). Anything `drizzle-kit generate` produces is informational only and is **not** run by `src/server/migrate.ts`.

If you intend to ship a schema change, write the SQL by hand into this `migrations/` directory. Do not commit `./drizzle/` output as if it were a migration.

## Adding a migration — checklist

- [ ] File named `NNNN_description.sql` with the next prefix.
- [ ] Idempotent where feasible (`if not exists`, `if exists`).
- [ ] Tested locally with `pnpm db:migrate` against a scratch database.
- [ ] If it uses `CONCURRENTLY`, the file contains only concurrent statements.
- [ ] If risky, add a companion rollback under `migrations/rollback/`.

## Known issues and edge cases

### Prefix collision: 0052 (GH #290)

Two files share the `0052` prefix:

- `0052_document_snapshots.sql`
- `0052_pick_released_warehouse_alerts.sql`

**How they got here:** `0052_document_snapshots.sql` was committed first as a squash/re-issue of an earlier document-snapshot migration. `0052_pick_released_warehouse_alerts.sql` was added in the same or an adjacent PR before the conflict was caught. Both files are now in git history and cannot be renamed without breaking deployed databases that have already applied one or both under their original names.

**Correct run order (lexical, which is Postgres-safe):** The migration runner applies files in lexical (`ls`-sorted) order. Lexically, `0052_document_snapshots.sql` sorts before `0052_pick_released_warehouse_alerts.sql`, so the runner will always apply them in that order on a fresh database.

**Drizzle-kit / schema_migrations:** The runner inserts the filename (not the numeric prefix) as the bookkeeping key in `schema_migrations`. Both files get distinct rows, so idempotency is maintained even with the shared prefix.

**Action required:** None — the runner handles this correctly. This note exists so that future maintainers understand the history and do not attempt to renumber either file.

### Reserved prefix: 0056

Migration prefix `0056` is reserved for the in-flight matchmaking-settings PR (#368, branch `feat/matchmaking-settings`). Do not use `0056` for any other migration. The next available prefix after that PR merges will be determined by what is already in git; as of the Wave 2B hardening pass the Wave 2B migrations start at `0058`.
