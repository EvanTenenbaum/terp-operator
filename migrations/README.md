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
