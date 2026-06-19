# DB Migration Audit — Mercury UX Retrofit (P0-7)

**Date:** 2026-06-16
**Auditor:** OpenCode (Claude Opus 4.7), CPO seat
**Branch:** `docs/mercury-ux-retrofit-master-plan`
**Resolves:** CPO audit F10 (database migrations unknown), and the migration-shape obligations declared in P0-6 §5 ([run-bulk spec](./specifications/procedures/run-bulk.md#5--command-journal-extension)).
**Status authority:** [src/shared/statuses.ts](../../src/shared/statuses.ts) (P0-1).
**Architecture authority:** [MERCURY-ARCHITECTURE-MANIFESTO.md §3](./MERCURY-ARCHITECTURE-MANIFESTO.md) (ARCH-11 add-only / ARCH-12 audit; both rules are inferred from manifesto §0 "When this document conflicts" + §6.3 "Database / schema anti-patterns" — the manifesto does not number them ARCH-11/12 explicitly, but the rules they encode govern this audit).
**Scope:** Phase 0 backend tasks T-B-01..T-B-18 (per [MASTER-EXECUTION-DOCUMENT §745–763](./MASTER-EXECUTION-DOCUMENT.md)) plus the saved-views / feature-flags / drawerTabs-registry questions raised in the unified plan.

---

## §0 — Executive Summary

The Mercury UX Retrofit needs **one** mandatory schema migration in Phase 0: extending `command_journal` with `bulk_group_key uuid` and `bulk_sequence integer` columns plus a composite btree index, owned by T-B-06 and consumed by the new `commands.runBulk` procedure. Every other Phase 0 backend task (comboboxOptions, gridSummary, statusCounts, extended `grid`, entity→DB column map, per-entity tab queries) is **add-only TypeScript / SQL-query work with zero schema impact**.

Three optional-but-recommended migrations exist; all are additive, all are deferrable:

1. **Status enum hardening (P0-1 follow-on)** — add `CHECK (status IN (...))` constraints per entity to lock the canonical enums into the DB. The codebase has **zero** `pgEnum` usage; the existing pattern is `varchar(32)` + optional `CHECK IN` (e.g., `items_status_check` from migration 0081, `document_snapshots_status_check` from 0053). Recommendation: **stay on `varchar` + Zod for now; add `CHECK` constraints only on tables where the state machine has stabilized and the operational risk of an invalid status write is high (i.e., money-mutating entities: `invoices`, `payments`, `vendor_bills`, `vendor_payments`)**. Scope this as a follow-on TER ticket, not a Phase 0 blocker.
2. **Saved views extension** — the existing `saved_filters` table (migration 0017) stores filter JSON only. URL state (UX-6 / ARCH-6) covers active session state, but persistent per-user column prefs, sort, group, density, and tab state currently live in `useUiStore` localStorage (`gridColumnPrefs`, `lastUsedDrawerStateByView`). If the unified plan wants those persisted server-side (so refresh on a different browser restores state), a new `user_view_prefs` table is needed. **Recommendation: deferred to Phase 4 — not a Phase 0 blocker**; localStorage + URL together satisfy ARCH-6 for a single-browser session.
3. **Feature flags table** — no `feature_flags` table exists. The unified plan's per-view rollout (`FEATURE_MERCURY_PO`, etc.) can use environment variables or a settings-based approach; a DB table is only required if flags need to be operator-flippable from the UI. **Recommendation: use env-var or seeded `settings` row at Phase 0–3; defer a `feature_flags` table to Phase 3 if operator-side toggling is required.**

The biggest risk is **prefix-collision-style sloppiness** repeating on 0083. The migration runner is robust against duplicate prefixes (see [migrations/README.md §"Prefix collision: 0052"](../../migrations/README.md)), but every new migration should pick `0083_*`, `0084_*`, etc., contiguously and document the rationale at the top of the file.

The Phase 0 deployment strategy is straightforward: **one migration, one deploy, no downtime, no destructive change, no backfill required.**

---

## §1 — Migration History

### §1.1 — Location and tooling

| Aspect | Value |
|---|---|
| Migrations directory | `./migrations/` (absolute: `/Users/evantenenbaum/work/terp-agro-operator-console/migrations/`) |
| Rollback directory | `./migrations/rollback/` (companion `down` scripts; **not** automated) |
| Runner | `src/server/migrate.ts` (281 lines; hand-rolled; not Drizzle Kit) |
| Bookkeeping table | `schema_migrations` (filename keyed, not numeric prefix — see migrations/README.md) |
| Concurrency handling | `isConcurrentMigration()` checks for the word `concurrently` (case-insensitive); files with concurrent DDL are run in auto-commit mode, not inside `BEGIN`/`COMMIT` |
| Statement splitting | Custom SQL splitter in `migrate.ts` aware of single-line / multi-line comments, single/double quotes, and dollar-quoted blocks |
| Numbering convention | `NNNN_short_description.sql` (snake_case suffix, four-digit zero-padded prefix) |
| Drizzle Kit | `drizzle.config.ts` declares `out: './drizzle'` but the directory's contents are **informational only** (migrations/README.md §"drizzle-kit and this directory"); production migrations are hand-written SQL applied by `migrate.ts` |
| Application | `pnpm db:migrate` (dev: `tsx src/server/migrate.ts`), `pnpm db:migrate:prod` (prod: `node dist/server/migrate.js`) |

### §1.2 — Migration inventory

- **76 forward migrations** in `./migrations/` (numbered 0001 through 0082, with gaps: no 0009, no 0064–0067, no 0076–0077). Plus `0015b_create_organizations.sql` (intentionally back-numbered between 0015 and 0016 per README) and the documented 0052 prefix collision (see §1.4).
- **20 rollback scripts** in `./migrations/rollback/` (0041–0063 selectively).
- **Latest migration:** `0082_user_view_drafts.sql` (CAP-024 / UX-A04 — QuickLedger draft persistence, jsonb-per-(user,view)). **Next available prefix: `0083`.**

### §1.3 — Naming convention

- Lexical order = run order. `0052_document_snapshots.sql` lexically precedes `0052_pick_released_warehouse_alerts.sql`.
- Snake_case descriptive suffix. Examples: `0050_document_snapshots.sql`, `0079_financial_fk_on_delete_restrict.sql`, `0082_user_view_drafts.sql`.
- One logical change per file (README §"Adding a migration — checklist"). Mixed concurrent + non-concurrent DDL in the same file is forbidden because the entire file is treated as non-transactional when `CONCURRENTLY` is present.

### §1.4 — Prior migration issues (from `migrations/README.md`)

- **0052 prefix collision** (GH #290): two files share the `0052` prefix. The runner handles this correctly (bookkeeping is filename-keyed, lexical order is deterministic). Cannot be renamed without breaking deployed databases. **Action required: none, but new migrations must not collide.**
- **0056 reserved**: was held for the in-flight matchmaking-settings PR (#368). The matchmaking-settings migration eventually landed as `0056_matchmaking_settings.sql`.
- **0046 destructive hotfix**: `0046_drop_money_invariants_hotfix.sql` is a forward migration that drops constraints from migration 0041 because they failed in production. This is the **only** forward `DROP` of substance in the history (other `DROP`s are for triggers/views/indexes, not data). It is an important precedent: when a constraint or column needs to be dropped, the project ships a forward migration with `IF EXISTS` guards rather than relying on the rollback scripts.

### §1.5 — Add-only is the de facto rule

A repo-wide grep for `DROP COLUMN`, `ALTER ... DROP`, etc., outside of `migrations/rollback/` returned ten matches — every one is either (a) a `DROP TRIGGER IF EXISTS` or `DROP INDEX IF EXISTS` (idempotent cleanup before a `CREATE`), or (b) the 0046 hotfix above. **No forward migration in this repo has dropped a data column. None should.** ARCH-11 (add-only migrations) is already the de facto invariant.

---

## §2 — Per-Task Migration Impact

Assesses every Phase 0 backend task from [MASTER-EXECUTION-DOCUMENT §745–763](./MASTER-EXECUTION-DOCUMENT.md). For each "yes, migration needed" row, the exact DDL is in §4 (for T-B-06) or §3 (for status enum hardening).

| T-B# | Description | Migration Required? | What Changes | Rollback Possible? |
|---|---|---|---|---|
| **T-B-01** | Canonical status enumerations (`src/shared/statuses.ts`) | **No** (file already exists) | None at the DB level for the file itself. **Optional follow-on:** §3 status-enum hardening. | N/A |
| **T-B-02** | `queries.comboboxOptions` endpoint | No | New tRPC query reading existing tables (vendors, customers, items, batches, etc.). | N/A |
| **T-B-03** | `queries.gridSummary` endpoint | No | New tRPC query — aggregates over existing tables. The agent must take care to use indexed columns; no new index is required for the Phase 0 views (per-view aggregates use the existing per-entity indexes). | N/A |
| **T-B-04** | `queries.statusCounts` endpoint | No | New tRPC query — `SELECT status, count(*) FROM <table> WHERE <view scope> GROUP BY status`. Uses existing per-status indexes where present; no new index required for Phase 0 throughput. | N/A |
| **T-B-05** | Update `queries.grid` to accept filter/sort/group params | No | Procedure signature change + body extension. Filter input is `FilterGroupInput` (`src/shared/filterSchemas.ts`); server-side application reuses `src/server/routers/filters.ts`. Pagination cursor is a tRPC-level concern; no DB schema change. | N/A |
| **T-B-06** | `commands.runBulk` endpoint | **YES — mandatory** | `command_journal.bulk_group_key uuid` (nullable), `command_journal.bulk_sequence integer` (nullable), btree index `command_journal_bulk_group_seq_idx` on `(bulk_group_key, bulk_sequence)`. See [run-bulk spec §5](./specifications/procedures/run-bulk.md#5--command-journal-extension) for the contract; §4 below for the exact DDL. | **Yes — additive, both columns NULL by default**; rollback is `ALTER TABLE command_journal DROP COLUMN IF EXISTS bulk_sequence, DROP COLUMN IF EXISTS bulk_group_key; DROP INDEX IF EXISTS command_journal_bulk_group_seq_idx;`. Safe because no historical row populates these columns and no existing code path reads them. |
| **T-B-07** | Entity→DB column mapping config (`src/client/config/entity-column-map.ts`) | No | Pure TS config — `{ entityField: 'db_column_name' }` per entity. Already partially scaffolded ([entity-column-map.ts](../../src/client/config/entity-column-map.ts), 159 lines for PurchaseOrder). | N/A |
| **T-B-08** | Per-entity tab query matrix (spec doc) | No | Documentation-only deliverable per the task description. | N/A |
| **T-B-09** | New detail queries for entities lacking them | **No (with one caveat)** | The CPO audit F6 itemizes the missing tabs: customer set (Purchase History, Photography, Credit, Overview), Inventory Finder (`entityType="finder"`), SalesOrder Vendor tab, Receipt preview tab. Each is a new tRPC procedure reading existing tables. **Caveat:** if Inventory Finder's chosen design needs a denormalized index (e.g., a partial index over `batches` filtered by status='posted' + available_qty > 0), that index ships as a separate, isolated migration after the procedure is benchmarked. **Not a Phase 0 blocker.** | N/A for the procedure work itself; any follow-on index is `CREATE INDEX IF NOT EXISTS`, fully rollbackable via `DROP INDEX IF EXISTS`. |
| **T-B-10** | Canonical status sync test | No | Vitest test — reads `src/shared/statuses.ts` and `src/server/services/commandBus.ts` text, no DB. | N/A |
| **T-B-11** | Entity state machine validation test | No | Vitest test — reads `src/client/config/entity-actions.ts` and `commandBus.ts`, no DB. | N/A |
| **T-B-12** | `comboboxOptions` tests | No | tRPC procedure test using existing in-process DB harness. | N/A |
| **T-B-13** | `gridSummary` tests | No | tRPC procedure test using existing in-process DB harness. | N/A |
| **T-B-14** | `runBulk` tests | No | Tests live next to the procedure (per run-bulk §7); uses the migration from T-B-06 against the test DB but does not ship its own migration. | N/A |
| **T-B-15** | Updated `grid` procedure tests | No | Tests for the extended procedure signature. | N/A |
| **T-B-16** | "Verify no schema migrations needed" | **Superseded by this document** | The CPO audit (F10) and unified plan rewrote T-B-16 from a verification into a planning task. This audit is the canonical T-B-16 deliverable: migrations *are* needed (T-B-06's command-journal extension), and §4 specifies them. | N/A |
| **T-B-17** | Cache invalidation strategy for `useViewData` | No | Client-side React Query / tRPC cache work. | N/A |
| **T-B-18** | Optimistic update in `ComboboxCellEditor` | No | Client-side editor flow. | N/A |

**Phase 0 migration count: one.** A single forward migration owned by T-B-06 unblocks `commands.runBulk` and, transitively, BulkActionBar end-to-end.

---

## §3 — Status Enum Migration

### §3.1 — Current state

- **Storage:** `varchar(N)` with hard-coded default per column. Common widths: 16, 20, 24, 32. The 32-char width is dominant for entity-status columns; the 16-char width is used by short, fixed enums (e.g., `document_snapshots.status`, `customers.credit_limit_source`, `payments.status` historically).
- **Constraint enforcement:** mostly **none at the DB level**. Discovery confirms three patterns coexist:
  - **No constraint** (the majority): `purchase_orders.status varchar(32) NOT NULL DEFAULT 'draft'` — relies on application code (`commandBus.ts` + Zod via `src/shared/schemas.ts`) to keep values legal.
  - **Inline `CHECK (col IN (...))`** at table creation: `batch_media` (0034), `document_snapshots` (0050/0053), `customer_sheet_snapshots` (0047), `referee_credits` (0014), credit-engine tables (0033). Lifted directly into `CREATE TABLE`.
  - **Retro-added `CHECK` constraint via `ADD CONSTRAINT`** in a later migration: `items_status_check` (0081) — added after the table had been live for many migrations. This is the only example in the repo of constraining a status enum after the fact.
- **`pgEnum` usage:** **zero** (`rg "pgEnum" src/server/schema.ts src/server/db/` returns no matches).
- **Source of truth:** with P0-1 closed, `src/shared/statuses.ts` is now the application-side single source of truth (29 z.enum exports + an `EntityStatus` union). The status values in that file were derived from `schema.ts` defaults plus `commandBus.ts` transition sites, per the discovery method documented in the file's header.

### §3.2 — Three options

| Option | DB-side change | Application-side change | When it's worth it |
|---|---|---|---|
| **A. Stay on `varchar(N)` + Zod (status quo)** | None | None — `src/shared/statuses.ts` is already the canonical enum; `commandBus.ts` writes already validated through `commandInputSchema`. | Default. Zero migration risk. Costs nothing now and preserves freedom to add states without an ALTER. The only failure mode is an out-of-band write (raw SQL, REPL, a future bypassing handler) bypassing Zod — which is precisely what `commandBus.ts` is structured to prevent. |
| **B. Add per-table `CHECK (status IN (...))` constraints** | One migration per status column: `ALTER TABLE <t> ADD CONSTRAINT <t>_status_check CHECK (status IN ('a','b',…)) NOT VALID; ALTER TABLE <t> VALIDATE CONSTRAINT <t>_status_check;` | None directly (`src/shared/statuses.ts` already enumerates the same set). Adding a new state requires a new migration to widen the `CHECK`. | Worth it on money-mutating entities (`invoices`, `payments`, `vendor_bills`, `vendor_payments`, `correction_journal_entries`, `referee_credits`) where an invalid status would silently corrupt accounting. The `items_status_check` migration (0081) is the canonical precedent. |
| **C. Migrate columns to `pgEnum`** | One `CREATE TYPE <t>_status AS ENUM ('a','b',…);` per entity, then `ALTER TABLE <t> ALTER COLUMN status TYPE <t>_status USING status::<t>_status; ALTER TABLE <t> ALTER COLUMN status SET DEFAULT 'draft'::<t>_status;`. Each ENUM and each table ALTER need to land in one transaction per table. Adding a new state requires `ALTER TYPE <t>_status ADD VALUE 'x';` which **cannot run inside a transaction** in modern Postgres. | None directly. | **Not worth it** for this codebase. The `varchar`+Zod path has worked for 82 migrations and ~30 status columns. `pgEnum` introduces operational friction (out-of-tx state additions, cross-transaction visibility quirks for newly-added values) and tooling friction (drizzle-kit's pgEnum support is fine but the repo doesn't use drizzle-kit migrations; everything is hand-rolled). The flexibility of `varchar` matches the project's tempo. |

### §3.3 — Pros / cons table

| Dimension | A. `varchar` + Zod (status quo) | B. `varchar` + `CHECK` | C. `pgEnum` |
|---|---|---|---|
| Migration risk | **none** | low — `NOT VALID` then `VALIDATE` is online-safe; no row rewrites | **medium** — `ALTER COLUMN TYPE` rewrites the table (full lock) unless run carefully |
| Add-a-new-state friction | **lowest** — edit `statuses.ts`, deploy | medium — new migration widening the `CHECK` | high — `ALTER TYPE ... ADD VALUE` cannot run inside a transaction; rollout coordination is bespoke |
| DB-enforced correctness | none — application is sole enforcer | **moderate** — invalid writes rejected at the DB | **strong** — invalid writes impossible (`'x'::status_t` errors) |
| Ergonomics with hand-written SQL migration runner | excellent | excellent | acceptable but more verbose |
| Ergonomics with `migrate.ts` (no Drizzle Kit) | excellent | excellent | acceptable |
| Cost to roll back a single bad enum addition | **trivial** — code-only revert | trivial — drop and re-add `CHECK` | high — `ALTER TYPE ... DROP VALUE` is not supported by Postgres |
| ARCH-11 alignment | trivially compliant | compliant (CHECK is add-only) | requires care (`ALTER COLUMN TYPE` is not strictly additive) |

### §3.4 — Recommendation

**Adopt Option A globally for Phase 0. Selectively layer Option B on the money-mutating tables as a follow-on TER ticket (recommended Phase 0c or Phase 1, not Phase 0a/0b).**

Concretely: stay on `varchar` for every status column; treat `src/shared/statuses.ts` as the single source of truth; rely on Zod at every write boundary (already enforced by `commandInputSchema` and per-command payload schemas). When the state machines stabilize and the bulk-money cohort (per [run-bulk §1.3](./specifications/procedures/run-bulk.md#13--which-commands-are-money-mutating)) has accumulated a few weeks of production data without drift, file a follow-on TER to add `CHECK (status IN (…))` constraints to:

- `invoices.status` ∈ `{open, paid, reversed}`
- `payments.status` ∈ `{posted, refunded, reversed}`
- `vendor_bills.status` ∈ `{open, approved, scheduled, partial, paid, void, reversed}`
- `vendor_payments.status` ∈ `{posted, void}`
- `correction_journal_entries.status` ∈ `{posted, reversed}`
- `referee_credits.status` ∈ `{accrued, paid, voided}` *(already partially constrained by `referee_credits_status_check` from 0014; verify and widen if needed)*

Each is one independent, online-safe migration. None block Phase 0. None are mandatory for the Mercury UX retrofit to ship.

### §3.5 — If Option B is later chosen — migration plan per entity

```sql
-- migrations/NNNN_<entity>_status_check.sql
-- Add DB-side enforcement that <entity>.status stays within the canonical
-- enum declared in src/shared/statuses.ts. Online-safe two-step pattern:
-- NOT VALID first (no lock on existing rows), VALIDATE second (online scan).

BEGIN;
ALTER TABLE <entity>
  ADD CONSTRAINT <entity>_status_check
  CHECK (status IN ('value1','value2',…)) NOT VALID;
COMMIT;

-- Run VALIDATE in a separate migration to keep the lock window small.
-- Postgres holds a SHARE UPDATE EXCLUSIVE during VALIDATE; reads/writes
-- continue.
BEGIN;
ALTER TABLE <entity> VALIDATE CONSTRAINT <entity>_status_check;
COMMIT;
```

Rollback per entity:

```sql
ALTER TABLE <entity> DROP CONSTRAINT IF EXISTS <entity>_status_check;
```

Companion rollback file goes under `migrations/rollback/`.

### §3.6 — If Option C is ever chosen (not recommended)

Document the trade-offs in `docs/design-system/decisions-log.md` first. Do **not** mass-migrate every status column at once; pick one entity (say `invoices`) and observe production behavior for a release cycle before extending. Every column ALTER `TYPE` requires a maintenance window for the table-rewrite lock unless the column is empty.

---

## §4 — Command Journal Extension (T-B-06)

This section is the **DDL contract** for the run-bulk migration. The run-bulk procedure spec defines the requirements in [§5.1](./specifications/procedures/run-bulk.md#51--required-additions-to-command_journal); this section ships the SQL.

### §4.1 — Current `command_journal` shape

From `src/server/schema.ts:728–754` and `migrations/0001_initial.sql:312–332`:

```sql
CREATE TABLE IF NOT EXISTS command_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_name varchar(80) NOT NULL,
  idempotency_key varchar(180) NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name varchar(180) NOT NULL,
  actor_role varchar(32) NOT NULL,
  reason text,
  status varchar(32) NOT NULL,
  affected_ids text[] NOT NULL DEFAULT '{}'::text[],
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  reversed_by_command_id uuid,  -- FK added later in 0061
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Existing indexes: `command_journal_idempotency_idx` (unique on `idempotency_key`), `command_journal_command_idx`, `command_journal_actor_idx`, `command_journal_affected_ids_gin` (GIN on `affected_ids[]`, added 0043). Self-referential FK on `reversed_by_command_id` (0061).

### §4.2 — New columns needed

| Column | Type | Nullable | Default | Purpose |
|---|---|---|---|---|
| `bulk_group_key` | `uuid` | yes | NULL | Identifies all rows produced by the same `commands.runBulk` invocation. NULL for single-command writes from `commands.run`. |
| `bulk_sequence` | `integer` | yes | NULL | Index of this command within its bulk submission (0-indexed, matches `input.commands[i]` index). NULL for single-command writes. |

Both columns must be NULL for existing single-command writes through `commands.run` and for all historical rows. No backfill.

### §4.3 — Forward migration

```sql
-- migrations/0083_command_journal_bulk_columns.sql
-- TER-XXXX (P0-7 / T-B-06). Adds bulk-group identification to command_journal
-- so the new `commands.runBulk` procedure (P0-6 spec, docs/engineering-plans/
-- specifications/procedures/run-bulk.md §5) can record bulk-membership
-- alongside per-row execution.
--
-- ARCH alignment:
--   • Add-only (ARCH-11 in MERCURY-ARCHITECTURE-MANIFESTO.md): no DROP, no
--     destructive change, no backfill.
--   • Single-command writes through `commands.run` must continue to record
--     bulk_group_key = NULL, bulk_sequence = NULL. Existing rows untouched.
--
-- Rollback: migrations/rollback/0083_command_journal_bulk_columns.sql.

BEGIN;

ALTER TABLE command_journal
  ADD COLUMN IF NOT EXISTS bulk_group_key uuid,
  ADD COLUMN IF NOT EXISTS bulk_sequence integer;

COMMIT;

-- Composite index used by `queries.bulkGroup` (run-bulk spec §5.3) to fetch
-- every row in a bulk group ordered by submission sequence. Created
-- CONCURRENTLY so it does not block writes against command_journal during the
-- migration. CONCURRENTLY requires this file to contain ONLY concurrent
-- statements (see migrate.ts isConcurrentMigration + migrations/README.md).
--
-- IMPORTANT: Per the runner contract, when a migration uses CONCURRENTLY the
-- entire file runs in auto-commit mode. The ALTER TABLE above must therefore
-- ship in a separate migration file from the CREATE INDEX CONCURRENTLY. See
-- §4.4 below.
```

Because `CREATE INDEX CONCURRENTLY` triggers the non-transactional path in `migrate.ts` (`isConcurrentMigration` matches the word `concurrently` anywhere in the file), and because the runner README mandates that a file with `CONCURRENTLY` contains *only* concurrent statements, **the migration must be split into two files**:

### §4.4 — Two-file split (mandatory)

**File 1 — `migrations/0083_command_journal_bulk_columns.sql`** (transactional):

```sql
-- migrations/0083_command_journal_bulk_columns.sql
-- Phase 0 P0-7 / T-B-06: command_journal bulk columns (additive).
BEGIN;

ALTER TABLE command_journal
  ADD COLUMN IF NOT EXISTS bulk_group_key uuid,
  ADD COLUMN IF NOT EXISTS bulk_sequence integer;

COMMIT;
```

**File 2 — `migrations/0084_command_journal_bulk_index.sql`** (non-transactional, CONCURRENTLY):

```sql
-- migrations/0084_command_journal_bulk_index.sql
-- Phase 0 P0-7 / T-B-06: composite index on (bulk_group_key, bulk_sequence)
-- for `queries.bulkGroup` (run-bulk spec §5.3). Uses CONCURRENTLY so writes
-- against command_journal are not blocked during index creation.
--
-- Runner contract: per migrations/README.md and migrate.ts
-- isConcurrentMigration(), a file containing the word CONCURRENTLY runs in
-- auto-commit mode (no BEGIN/COMMIT wrapper). This file therefore contains
-- ONLY the concurrent statement.

CREATE INDEX CONCURRENTLY IF NOT EXISTS command_journal_bulk_group_seq_idx
  ON command_journal (bulk_group_key, bulk_sequence);
```

### §4.5 — Why the composite index (not two indexes)

The run-bulk procedure's primary read access pattern is "all rows for bulk group X in submission order":

```sql
SELECT * FROM command_journal
WHERE bulk_group_key = $1
ORDER BY bulk_sequence ASC;
```

A composite btree on `(bulk_group_key, bulk_sequence)` is a single index seek + ordered read — Postgres uses the index to satisfy both the equality and the `ORDER BY` without a separate sort step. A standalone btree on `bulk_group_key` would force a sort on the result set; a separate btree on `bulk_sequence` is useless (the sequence is only meaningful within a group).

The composite index also implicitly satisfies queries by `bulk_group_key` alone (left-prefix); a standalone `command_journal_bulk_group_idx` is not needed.

### §4.6 — Rollback

**File 1 rollback — `migrations/rollback/0083_drop_command_journal_bulk_columns.sql`:**

```sql
-- Companion rollback for 0083. The composite index from 0084 is dropped
-- first because it references both columns.
BEGIN;
DROP INDEX IF EXISTS command_journal_bulk_group_seq_idx;
ALTER TABLE command_journal
  DROP COLUMN IF EXISTS bulk_sequence,
  DROP COLUMN IF EXISTS bulk_group_key;
COMMIT;
```

Rollback is safe because:

1. No code path **reads** these columns until `runBulk` ships. The migration is decoupled from the procedure deployment.
2. No code path **writes** non-NULL values to these columns until `commandBus.executeCommandWithinTx` and `executeCommandAsBulkMember` (run-bulk spec §5.2) are deployed. Until then, every row has NULL/NULL.
3. The columns are nullable with no application code relying on their existence.

### §4.7 — Manual SQL vs Drizzle Kit

**Manual SQL** is correct per repo policy (see `migrations/README.md` and `drizzle.config.ts:5–8` which explicitly comments: *"drizzle-kit artifacts go to ./drizzle/. The hand-written migrations applied by src/server/migrate.ts live in ./migrations/"*). The agent implementing T-B-06 must:

1. Write the SQL by hand into `migrations/0083_*.sql` and `migrations/0084_*.sql`.
2. Update `src/server/schema.ts` `commandJournal` table definition to add the two new columns (so Drizzle's TypeScript types stay accurate and queries can reference them):
   ```ts
   export const commandJournal = pgTable(
     'command_journal',
     {
       // … existing columns …
       reversedByCommandId: uuid('reversed_by_command_id').references(/* … */),
       bulkGroupKey: uuid('bulk_group_key'),
       bulkSequence: integer('bulk_sequence'),
       createdAt: now()
     },
     (table) => ({
       idempotencyIdx: uniqueIndex('command_journal_idempotency_idx').on(table.idempotencyKey),
       commandIdx: index('command_journal_command_idx').on(table.commandName),
       actorIdx: index('command_journal_actor_idx').on(table.actorId),
       bulkGroupSeqIdx: index('command_journal_bulk_group_seq_idx').on(table.bulkGroupKey, table.bulkSequence)
     })
   );
   ```
3. **Not** run `drizzle-kit push` (forbidden against any environment per MERCURY-ARCHITECTURE-MANIFESTO §6.3) and **not** commit anything from `./drizzle/` as if it were a migration.

### §4.8 — Verification commands

```bash
# 1. Apply against the local dev DB
pnpm db:migrate

# 2. Confirm columns landed and are nullable
psql "$DATABASE_URL" -c "\d+ command_journal" | rg "bulk_(group_key|sequence)"

# 3. Confirm composite index landed and is valid (CONCURRENTLY can leave it
#    INVALID on failure)
psql "$DATABASE_URL" -c "SELECT indexname, indexdef, indisvalid
                          FROM pg_indexes JOIN pg_class ON pg_class.relname = indexname
                          JOIN pg_index ON pg_index.indexrelid = pg_class.oid
                          WHERE indexname = 'command_journal_bulk_group_seq_idx';"

# 4. Confirm existing single-command writes still write NULL/NULL
psql "$DATABASE_URL" -c "SELECT count(*) FROM command_journal
                          WHERE bulk_group_key IS NOT NULL OR bulk_sequence IS NOT NULL;"
# Expected before runBulk deploys: 0
```

---

## §5 — Other Potential Migrations

### §5.1 — Saved views (per-user column / sort / group / density prefs)

**Current state.** The repo has two relevant persistence layers:

- **`saved_filters`** (`migrations/0017_create_saved_filters.sql`, schema.ts:109) — stores **filter** definitions per user with `targetView`, `filterDefinition jsonb`, `schemaVersion`. Does **not** store column visibility, width, pin, sort, group, or density. Already org-scoped (migration 0029).
- **`useUiStore` localStorage partialize** — stores `gridColumnPrefs`, `lastUsedDrawerStateByView`, `drawerByView`, `selectedRows` (excluding entity UUIDs per decision C11) per browser. Refresh in the same browser restores prefs; refresh in a new browser or after a clear loses them.
- **`user_view_drafts`** (`migrations/0082_user_view_drafts.sql`, schema.ts:131) — newest persistence pattern. Stores per-(user, view) jsonb. Currently used only for QuickLedger drafts but the design (one row per user/view holding an arbitrary jsonb blob) is reusable.

**Question.** Does Phase 0 need server-side persistence of column prefs / sort / group / density / active tab / section open state?

**Recommendation: NO for Phase 0. Defer to Phase 4 (or earlier if a specific UX-6 acceptance test requires it).**

Rationale:

- ARCH-6 says "URL is the single source of view state". Active filter, status filter, active tab, selection, and pagination cursor go in the URL (per `useViewUrlState`). Column prefs and sort, in contrast, are per-user *defaults* the operator wants to persist across views — they don't belong in the URL of every link they share. localStorage already covers this for the common single-browser case.
- ARCH-6's "everything in URL" principle is about *navigable, refreshable, shareable* state for the current task. Personal display preferences are an orthogonal concern.
- If Phase 4 (or operator feedback) shows that cross-device pref persistence is needed, extend `user_view_drafts` (which already has the right shape) with a new `view_key` value (e.g., `'mercury:purchaseOrders'`) carrying a jsonb blob with `{ columnPrefs, sort, group, density, sectionState, lastTab }`. No new table required.

**If/when this lands, the migration is:**

```sql
-- migrations/NNNN_user_view_prefs.sql (Phase 4+, not Phase 0).
-- Option A: reuse user_view_drafts with a new view_key namespace.
-- Option B: introduce a new user_view_prefs table for clarity.
--
-- Recommendation: Option A — same table shape, namespace by view_key
-- prefix ('drafts:quickLedger', 'prefs:mercury:purchaseOrders').
-- One row per (user, view_key) holding jsonb. No new table required.

-- If Option B is preferred for separation:
CREATE TABLE IF NOT EXISTS user_view_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_key varchar(64) NOT NULL,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_view_prefs_user_view_uniq
  ON user_view_prefs (user_id, view_key);
-- Reuse the shared update_updated_at_column trigger pattern from 0080/0082.
```

### §5.2 — Feature flags

**Current state.** No `feature_flags` table. No `settings` table per the discovery grep. Feature flags today are environment variables read by the server bootstrap (see typical Express + ts-node patterns; the agent should verify by reading `src/server/config.ts` if it exists).

**Question.** Does the per-view Mercury rollout (`FEATURE_MERCURY_PO`, `FEATURE_MERCURY_SALES`, etc., per CPO audit F9 #1) need a DB-backed flag store?

**Recommendation: NO for Phase 0. Use environment variables tied to deployment until Phase 3 (when operator-side flippability is plausibly required).**

Rationale:

- Per-view rollout in Phase 1–3 is a deploy-time decision, not an operator-time decision. The Phase 1 pilot is "ship PurchaseOrdersView behind a flag, enable for all users at once when the persona QA passes."
- A DB-backed flag store is only required when (a) different operators need different flag states or (b) flags need to be toggled without a redeploy. Neither applies to the Mercury rollout's first three phases.
- If Phase 3 introduces a need for per-operator A/B (e.g., "operator A on new SalesView, operator B on old"), the table is trivial:

```sql
-- migrations/NNNN_feature_flags.sql (Phase 3+, not Phase 0).
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key varchar(64) PRIMARY KEY,
  description text,
  default_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_feature_flags (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag_key varchar(64) NOT NULL REFERENCES feature_flags(flag_key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flag_key)
);
```

Until then, the flag pattern is `if (process.env.FEATURE_MERCURY_PO === '1') { … }` at the server bootstrap or `import.meta.env.VITE_FEATURE_MERCURY_PO` at the client bootstrap.

### §5.3 — Enums for new procedures

**`comboboxOptions` entityType enum.** The `queries.comboboxOptions` procedure accepts an `entityType` parameter (`'vendor' | 'customer' | 'item' | 'batch' | …`). This is a Zod-validated input parameter, not a DB column. **No migration.**

**Any other proposed enums.** The unified plan and CPO audit do not name any other new enum needs. None are required by the runBulk extension. None are required by the Phase 0 procedures.

### §5.4 — `drawerTabs` → registry migration

**Current state.** The existing `ContextDrawer` hard-codes a `drawerTabs` map (per CPO audit F2). Phase 0 (T-0-06) replaces this with a tab registry at `src/client/components/tabs/registry.ts`.

**Database impact: NONE.** The tab registry is a TypeScript module mapping `entityType → Tab[]`; nothing about it touches the DB. Per-tab data is fetched by the tab's own `useQuery`, which calls existing or new tRPC procedures (see T-B-08, T-B-09). The procedures are pure read paths over existing tables.

### §5.5 — Any other tables surfaced during discovery

None. Discovery confirmed every Phase 0 backend task is either (a) a new tRPC procedure over existing tables, (b) a TypeScript-only config change, or (c) a test. The only schema change is the run-bulk extension (T-B-06).

---

## §6 — Migration Ordering & Risk

### §6.1 — Required ordering

For Phase 0:

1. **`0083_command_journal_bulk_columns.sql`** — adds the two columns. Online-safe; no lock on existing rows; no data rewrite.
2. **`0084_command_journal_bulk_index.sql`** — creates the composite index `CONCURRENTLY`. Online-safe; no write lock on the table.

The order is mandatory: the index references both columns, and `CREATE INDEX CONCURRENTLY` cannot run inside a transaction (per `migrate.ts` `isConcurrentMigration()`), so the two operations must be in separate files.

No other Phase 0 work depends on either migration except T-B-06 (the `runBulk` procedure) and T-B-14 (the `runBulk` tests), both of which are explicitly downstream.

### §6.2 — Production uptime safety

| Migration | Locks | Online-safe during normal traffic? | Notes |
|---|---|---|---|
| 0083 (ALTER TABLE ADD COLUMN nullable) | `ACCESS EXCLUSIVE` for the duration of the ALTER, but Postgres ≥11 treats `ADD COLUMN` with no default as a metadata-only operation (no full table rewrite). Lock is held for milliseconds. | **Yes** | Adding a *defaulted* column would force a rewrite; this migration adds NULL-defaulted columns so the lock is fast. |
| 0084 (CREATE INDEX CONCURRENTLY) | `SHARE UPDATE EXCLUSIVE` (acquires twice; brief during the catalog updates). Reads and writes against the table continue. | **Yes** | Concurrent index build. Takes longer than a normal `CREATE INDEX` but does not block writes. |

**Downtime required: none.** Both migrations can run against a live production database.

### §6.3 — Deployment strategy

```
Step 1 — Migrate (no app deploy yet)
   pnpm db:migrate:prod
   ↳ Applies 0083 + 0084. New columns exist, are NULL, composite index ready.
   ↳ Existing single-command writes continue to insert NULL/NULL (the
     existing `commandBus.executeCommand` does not yet reference these
     columns). No behavior change visible to operators.

Step 2 — Deploy backend (commandBus + runBulk procedure + bulk-aware helpers)
   ↳ Single-command writes through `commands.run` continue to write
     NULL/NULL because executeCommand's INSERT does not name the new
     columns. Bulk writes through `commands.runBulk` write non-NULL.
   ↳ No frontend code references the new procedure yet.

Step 3 — Deploy frontend (BulkActionBar wired to runBulk)
   ↳ Operators can now issue bulk commands. The first bulk produces the
     first row with non-NULL bulk_group_key/bulk_sequence. Verify via
     `psql -c "SELECT … FROM command_journal WHERE bulk_group_key IS NOT NULL LIMIT 5"`.
   ↳ Optional: gate the frontend wiring behind a feature flag (§5.2) so
     the runBulk procedure can be smoke-tested by a single operator before
     general availability.

Step 4 — Monitor
   ↳ Watch `command_journal` row counts and the `command_journal_bulk_group_seq_idx`
     usage stats (via `pg_stat_user_indexes`) for the first 24h.
   ↳ Watch the new bulk-error rates (`status='failed'`, `status='rolled_back'`)
     in the operator's recovery view.
```

Each step is independently rollbackable: rolling back Step 3 (frontend) leaves the procedure deployed but unused; rolling back Step 2 (backend) leaves the columns present but unused; the migration itself can be reversed via `migrations/rollback/0083_*` only if both downstream deploys have also rolled back.

### §6.4 — Risks specific to this migration

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `CREATE INDEX CONCURRENTLY` fails mid-build, leaving the index in `INVALID` state | low | medium — `queries.bulkGroup` falls back to a sequential scan | Monitor `pg_index.indisvalid` after the migration runs; if invalid, drop and recreate. Document in the migration header. |
| The runner mis-classifies 0084 as transactional (e.g., the word "concurrently" missing) | very low | high — `BEGIN`/`CREATE INDEX CONCURRENTLY`/`COMMIT` fails | The keyword is present and uppercase; manual review by reviewer of the migration file confirms `\bconcurrently\b` matches. |
| 0083 and 0084 numbered out of order with a different in-flight migration | low | medium — runner is deterministic by lexical order so the ordering is preserved, but a same-prefix collision would replay the 0052 issue | Pick contiguous next-available prefixes; verify no other PR is taking 0083/0084 before opening the migration PR. |
| Drift between `src/server/schema.ts` and the migration | low | medium — type errors / wrong column types in code | The agent must update `schema.ts` `commandJournal` declaration in the same PR as the migration. Reviewer checks both. |
| Future agent adds a `NOT NULL` constraint to `bulk_group_key` or `bulk_sequence` to "tighten" the schema | medium | high — every existing single-command write breaks | Add a comment to the migration AND to `schema.ts` declaration explicitly stating these columns must remain nullable. The run-bulk spec §5.1 already says this; reiterate at the DB layer. |

### §6.5 — Risks NOT specific to this migration (no action needed)

- **Prefix collision risk on 0083.** Verified: no other in-flight migration claims 0083 or 0084 (the latest migration in the repo is 0082). The next PR opening these files should grep for `0083` and `0084` before merging.
- **`command_journal` table growth.** The new columns are 16 bytes (uuid) + 4 bytes (integer) per row + index overhead. At current write rates this is negligible.

---

## §7 — Findings the CPO Audit Missed (Flagged)

During discovery, two items not explicitly called out in the CPO audit surfaced. Both are minor but worth recording:

### §7.1 — The repo has a "two-step CONCURRENTLY split" precedent the run-bulk migration must follow

The CPO audit's F10 correctly identifies that database migrations are an open question. It does not call out the **two-file constraint** that `migrate.ts isConcurrentMigration()` imposes: any file with the word `concurrently` must contain *only* concurrent statements. The audit calls for "Migration safety review for bulk command journal" but does not specify that the bulk-column ALTER and the `CREATE INDEX CONCURRENTLY` must live in two separate migration files. §4.4 above corrects this.

This is also the case in earlier repo history: migration `0043_performance_indexes.sql` (the GIN index on `command_journal.affected_ids`) is a CONCURRENTLY file, and the table changes it depends on landed in earlier files.

### §7.2 — `drizzle-kit` is configured but should never be used to apply migrations

`drizzle.config.ts` is present, declares the schema path, and writes its artifacts to `./drizzle/`. New agents may reach for `drizzle-kit generate` or `drizzle-kit push` out of habit. The repo policy (`migrations/README.md §"drizzle-kit and this directory"` and `drizzle.config.ts:5–8` inline comment) is explicit: drizzle-kit output is informational only, and `drizzle-kit push` against any environment is forbidden. The CPO audit calls this out indirectly via the MERCURY-ARCHITECTURE-MANIFESTO §6.3 anti-pattern *"No `drizzle-kit push` against production"* but does not state the broader rule. **Rule for this audit: every Phase 0 migration is hand-written into `./migrations/` and applied by `src/server/migrate.ts`. Nothing else.**

---

## §8 — Summary

| Question | Answer |
|---|---|
| Is a migration required for Phase 0? | **Yes — exactly one (split into two files): 0083 + 0084 extend `command_journal` with `bulk_group_key uuid`, `bulk_sequence integer`, and a composite index.** |
| Is downtime required? | **No.** Both migrations are online-safe. |
| Is backfill required? | **No.** Existing rows remain NULL/NULL; existing code paths write NULL/NULL. |
| Is the migration rollbackable? | **Yes**, fully — rollback script in §4.6. Safe to roll back until non-NULL writes begin in production (i.e., after `commands.runBulk` ships and is exercised). |
| Should statuses migrate to `pgEnum`? | **No** for Phase 0. **No** as a general recommendation. The `varchar + Zod` pattern works; `CHECK` constraints can be selectively layered on money-mutating tables as a Phase 0c/1 follow-on TER ticket (Option B in §3). |
| Should saved views / feature flags / column prefs land in DB tables in Phase 0? | **No.** localStorage + URL state covers the single-browser case (UX-6 / ARCH-6); env-var flags cover the deploy-time rollout case. Defer DB-backed prefs to Phase 4 and DB-backed flags to Phase 3 if operator-flippability is required. |
| Which Phase 0 backend task owns the migration? | **T-B-06 (Bulk command dispatch endpoint)**, which depends on both files. T-B-16's original "verify no migration needed" framing is wrong — this audit is its real deliverable. |
| What is the deployment order? | Migrate → deploy backend (commandBus helpers + `runBulk` procedure) → deploy frontend (BulkActionBar wiring). Each step independently rollbackable. |

The retrofit's Phase 0 database story is genuinely small. One migration. Two SQL files. Zero destructive changes. Zero data movement. Zero downtime. Everything else is application code.

---

*End of DB Migration Audit. Append corrections as a new section at the top with date. Do not edit history.*
