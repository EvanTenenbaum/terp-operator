# Customer Credit Engine — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 0 (data audit gate) and Phase 1 (engine schema + seeded stances + signal calculators with TDD) of the Customer Credit Limits System. No queue, no worker, no hooks, no UI in this scope — those land in subsequent plans.

**Architecture:** All work is server-side TypeScript in TERP Operator. Phase 0 produces a markdown audit and a go/no-go decision on the profitability signal. Phase 1 adds a Postgres migration (new tables + customer column additions), seeds the 5 default stances and engine config (`shadow_mode = true`), and ships pure-math signal calculators plus the scoring/base/multiplier/cold-start primitives in `src/server/services/creditEngine/`. No customer's `credit_limit` value changes during this phase (shadow_mode protects them).

**Tech Stack:** TypeScript (strict mode), Node 20, pnpm, vitest, drizzle-orm, node-postgres, raw SQL migrations applied by `src/server/migrate.ts`.

---

## Important codebase notes (verified before this plan was written)

- **Migration numbering:** the spec said "0005_credit_engine.sql" but the latest migration in the repo is `0032_add_composite_indexes.sql`. This plan uses `0033_credit_engine.sql`.
- **Spec uses stale column names.** The spec (§1.0, §1.1, etc.) refers to `invoices.issued_at` and `sales_orders.posted_at`. The actual schema (`src/server/schema.ts` lines 313–324, 270–290) has `created_at` for both. This plan uses `created_at` consistently. When Phase 2 composes signal queries from these helpers, the resulting SQL will use `created_at` — that's intentional and matches reality. A follow-up patch to the spec to align terminology is queued (out of scope here; doesn't affect engine behavior).
- **Test runner:** vitest. Coverage flag is `pnpm test -- --coverage` (the project does not currently have a `test:coverage` script; this plan adds one).
- **Coverage thresholds file** (`.coverage-thresholds.json`) lists `pytest --cov` as the enforcement command — this is a leftover template value. This plan adds a vitest-native coverage script and updates the enforcement command. 100% lines/branches/functions/statements still applies.
- **DB connection:** `src/server/db.ts` exports `pool` (pg.Pool) and `db` (drizzle). Migrations run via `pnpm db:migrate`. Tests against a real DB use `pool` directly.
- **Test file convention:** `*.test.ts` colocated with source (example: `src/server/services/processorCommands.test.ts`).
- **Spec reference:** `docs/superpowers/specs/2026-05-18-customer-credit-limits-system-design.md` — sections cited inline below.

---

## File structure

**Phase 0:**
- Create: `scripts/credit-engine-data-audit.ts` — runs audit queries, prints findings
- Create: `docs/credit-engine-data-audit-2026-05-18.md` — findings + go/no-go decision

**Phase 1 — migration + schema:**
- Create: `migrations/0033_credit_engine.sql` — all new tables + customers columns
- Modify: `src/server/schema.ts` — add drizzle table definitions for new tables, extend `customers`
- Modify: `src/server/seed.ts` — add 5 stances + single credit_engine_config row
- Modify: `package.json` — add `test:coverage` script
- Modify: `.coverage-thresholds.json` — update enforcement command for vitest
- Modify: `vitest.config.ts` — add coverage provider config

**Phase 1 — credit engine service module:**
- Create: `src/server/services/creditEngine/index.ts` — public re-exports
- Create: `src/server/services/creditEngine/inputGuards.ts` — shared SQL WHERE-clause fragments
- Create: `src/server/services/creditEngine/confidence.ts` — bucketize dataCount → confidence level
- Create: `src/server/services/creditEngine/signals/revenueMomentum.ts`
- Create: `src/server/services/creditEngine/signals/cashCollection.ts`
- Create: `src/server/services/creditEngine/signals/profitability.ts` (conditional on Phase 0)
- Create: `src/server/services/creditEngine/signals/debtAging.ts`
- Create: `src/server/services/creditEngine/signals/repaymentVelocity.ts`
- Create: `src/server/services/creditEngine/signals/tenureDepth.ts`
- Create: `src/server/services/creditEngine/scoring.ts` — weighted aggregation + multiplier mapping
- Create: `src/server/services/creditEngine/base.ts` — avg monthly revenue / median invoice
- Create: `src/server/services/creditEngine/effectiveStance.ts` — global + per-customer override
- Create: `src/server/services/creditEngine/coldStart.ts` — three-condition gate check
- Create: parallel `*.test.ts` per file above

**Pattern note:** Each signal file exports a pure-math scoring function (unit tested) and a DB-querying compute function (integration tested). This separation keeps signal math 100% unit-testable independent of the database.

---

# PHASE 0: Data Audit Gate

Purpose: confirm assumptions in the spec (§1.0, §1.3, §1.4) hold against real data before writing signal code that depends on them.

### Task 0.1: Add vitest coverage tooling

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `.coverage-thresholds.json`

- [ ] **Step 1: Install vitest coverage provider**

```bash
pnpm add -D @vitest/coverage-v8
```

- [ ] **Step 2: Add `test:coverage` script to `package.json`**

Add to the `scripts` block (after the existing `"test"` line):

```json
"test:coverage": "vitest run --coverage",
```

- [ ] **Step 3: Update `vitest.config.ts` to configure coverage**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**'
    ],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/server/services/creditEngine/**/*.ts'],
      exclude: [
        'src/server/services/creditEngine/**/*.test.ts',
        'src/server/services/creditEngine/index.ts'
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100
      }
    }
  }
});
```

- [ ] **Step 4: Fix `.coverage-thresholds.json` enforcement command**

Change the `enforcement.command` value:

```json
"command": "pnpm test:coverage",
```

- [ ] **Step 5: Verify the script runs (no engine code yet — expect zero files matched)**

```bash
pnpm test:coverage
```

Expected: exits 0 because no files in the `include` glob exist yet. (If it errors complaining "no files matched," that is fine — we'll fill them in Phase 1.)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts .coverage-thresholds.json
git commit -m "chore(credit-engine): add vitest coverage tooling for Phase 1"
```

### Task 0.2: Write audit script — unit_cost coverage

**Files:**
- Create: `scripts/credit-engine-data-audit.ts`

- [ ] **Step 1: Create the audit script with the unit_cost coverage query**

```typescript
// scripts/credit-engine-data-audit.ts
import { pool } from '../src/server/db';

async function auditUnitCost(): Promise<void> {
  const { rows } = await pool.query<{
    total_lines: string;
    null_unit_cost: string;
    zero_unit_cost: string;
    negative_unit_cost: string;
  }>(`
    SELECT
      COUNT(*)::text                                        AS total_lines,
      SUM(CASE WHEN unit_cost IS NULL THEN 1 ELSE 0 END)::text AS null_unit_cost,
      SUM(CASE WHEN unit_cost = 0   THEN 1 ELSE 0 END)::text AS zero_unit_cost,
      SUM(CASE WHEN unit_cost < 0   THEN 1 ELSE 0 END)::text AS negative_unit_cost
    FROM sales_order_lines
  `);
  const r = rows[0];
  const total = Number(r.total_lines);
  const nullPct = total === 0 ? 0 : (Number(r.null_unit_cost) / total) * 100;
  const zeroPct = total === 0 ? 0 : (Number(r.zero_unit_cost) / total) * 100;
  console.log('--- sales_order_lines.unit_cost audit ---');
  console.log(`Total lines:             ${r.total_lines}`);
  console.log(`Null unit_cost:          ${r.null_unit_cost} (${nullPct.toFixed(2)}%)`);
  console.log(`Zero unit_cost:          ${r.zero_unit_cost} (${zeroPct.toFixed(2)}%)`);
  console.log(`Negative unit_cost:      ${r.negative_unit_cost}`);
  console.log('');
}

async function main(): Promise<void> {
  await auditUnitCost();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script against the dev database**

```bash
pnpm tsx scripts/credit-engine-data-audit.ts
```

Expected: prints unit_cost audit section. Capture the output for the findings doc (Task 0.5).

- [ ] **Step 3: Commit the partial script**

```bash
git add scripts/credit-engine-data-audit.ts
git commit -m "feat(credit-engine): add audit script with unit_cost coverage query"
```

### Task 0.3: Extend audit script — due_date population

**Files:**
- Modify: `scripts/credit-engine-data-audit.ts`

- [ ] **Step 1: Add the due_date audit function and call it from main**

Reality check before writing the query: `invoices.due_date` is declared `NOT NULL` (`src/server/schema.ts` line 321) and `invoices.total` is also `NOT NULL`. The original spec's "null due_date" check is meaningless. Instead, the audit measures the *distribution* of (due_date − created_at) in days — that tells us whether net terms are recorded in a usable way — plus data-quality sanity counts (future-dated, negative totals, due-before-issued).

Insert above `async function main()`:

```typescript
async function auditDueDate(): Promise<void> {
  const { rows } = await pool.query<{
    total_invoices: string;
    future_issued: string;
    negative_total: string;
    due_before_issued: string;
    terms_lt_5: string;
    terms_5_to_14: string;
    terms_15_to_30: string;
    terms_31_to_60: string;
    terms_61_plus: string;
    terms_avg: string | null;
  }>(`
    SELECT
      COUNT(*)::text                                                              AS total_invoices,
      SUM(CASE WHEN created_at > now() THEN 1 ELSE 0 END)::text                   AS future_issued,
      SUM(CASE WHEN total < 0 THEN 1 ELSE 0 END)::text                            AS negative_total,
      SUM(CASE WHEN due_date < created_at THEN 1 ELSE 0 END)::text                AS due_before_issued,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 <  5  THEN 1 ELSE 0 END)::text AS terms_lt_5,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 >= 5  AND
                    EXTRACT(EPOCH FROM (due_date - created_at))/86400 <  15 THEN 1 ELSE 0 END)::text AS terms_5_to_14,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 >= 15 AND
                    EXTRACT(EPOCH FROM (due_date - created_at))/86400 <  31 THEN 1 ELSE 0 END)::text AS terms_15_to_30,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 >= 31 AND
                    EXTRACT(EPOCH FROM (due_date - created_at))/86400 <  61 THEN 1 ELSE 0 END)::text AS terms_31_to_60,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 >= 61 THEN 1 ELSE 0 END)::text AS terms_61_plus,
      AVG(EXTRACT(EPOCH FROM (due_date - created_at))/86400)::text                AS terms_avg
    FROM invoices
  `);
  const r = rows[0];
  console.log('--- invoices: terms distribution and data quality audit ---');
  console.log(`Total invoices:          ${r.total_invoices}`);
  console.log(`Future-dated created_at: ${r.future_issued}`);
  console.log(`Negative total:          ${r.negative_total}`);
  console.log(`Due-before-issued:       ${r.due_before_issued}  (should be 0 — data quality red flag)`);
  console.log(`Terms < 5 days:          ${r.terms_lt_5}`);
  console.log(`Terms 5-14 days:         ${r.terms_5_to_14}`);
  console.log(`Terms 15-30 days:        ${r.terms_15_to_30}`);
  console.log(`Terms 31-60 days:        ${r.terms_31_to_60}`);
  console.log(`Terms 61+ days:          ${r.terms_61_plus}`);
  console.log(`Average terms (days):    ${r.terms_avg ?? 'n/a'}`);
  console.log('');
}
```

Update `main` to call it:

```typescript
async function main(): Promise<void> {
  await auditUnitCost();
  await auditDueDate();
  await pool.end();
}
```

- [ ] **Step 2: Run the script**

```bash
pnpm tsx scripts/credit-engine-data-audit.ts
```

Expected: prints both audit sections. Capture output for Task 0.5.

- [ ] **Step 3: Commit**

```bash
git add scripts/credit-engine-data-audit.ts
git commit -m "feat(credit-engine): add due_date and core-column audit"
```

### Task 0.4: Extend audit script — invoice_disputes taxonomy

**Files:**
- Modify: `scripts/credit-engine-data-audit.ts`

- [ ] **Step 1: Add the disputes taxonomy audit and call from main**

Insert above `async function main()`:

```typescript
async function auditDisputes(): Promise<void> {
  const { rows } = await pool.query<{ status: string; cnt: string }>(`
    SELECT status, COUNT(*)::text AS cnt
    FROM invoice_disputes
    GROUP BY status
    ORDER BY cnt DESC
  `);
  console.log('--- invoice_disputes.status taxonomy ---');
  if (rows.length === 0) {
    console.log('(no rows in invoice_disputes — confirm "open" is the canonical filter value once data exists)');
  } else {
    for (const r of rows) {
      console.log(`  status="${r.status}": ${r.cnt}`);
    }
  }
  console.log('');
}
```

Update `main`:

```typescript
async function main(): Promise<void> {
  await auditUnitCost();
  await auditDueDate();
  await auditDisputes();
  await pool.end();
}
```

- [ ] **Step 2: Run the script**

```bash
pnpm tsx scripts/credit-engine-data-audit.ts
```

Expected: prints all three audit sections. Capture output.

- [ ] **Step 3: Commit**

```bash
git add scripts/credit-engine-data-audit.ts
git commit -m "feat(credit-engine): add invoice_disputes status taxonomy audit"
```

### Task 0.5: Write findings document with go/no-go decision

**Files:**
- Create: `docs/credit-engine-data-audit-2026-05-18.md`

- [ ] **Step 1: Create the findings document with audit output**

Paste the actual numbers from your Task 0.4 run into the placeholders below. **Do not commit with the placeholders unfilled.**

```markdown
# Credit Engine Data Audit — 2026-05-18

**Source:** `pnpm tsx scripts/credit-engine-data-audit.ts` run against the dev database on 2026-05-18.

## 1. sales_order_lines.unit_cost coverage

| Metric | Value |
|---|---|
| Total lines | <ACTUAL> |
| Null unit_cost | <ACTUAL> (<X.XX>%) |
| Zero unit_cost | <ACTUAL> (<X.XX>%) |
| Negative unit_cost | <ACTUAL> |

## 2. invoices: terms distribution and data quality

`invoices.due_date` and `invoices.total` are both `NOT NULL` per schema — null-rate audits would always return 0 and don't tell us anything useful. The audit instead measures the *terms distribution* (`due_date − created_at` bucketed into typical net-term ranges) and flags data-quality anomalies (future-dated, negative totals, due-before-issued).

| Metric | Value |
|---|---|
| Total invoices | <ACTUAL> |
| Future-dated created_at | <ACTUAL> |
| Negative total | <ACTUAL> |
| Due-before-issued (data quality red flag, expected 0) | <ACTUAL> |
| Terms < 5 days | <ACTUAL> |
| Terms 5–14 days | <ACTUAL> |
| Terms 15–30 days | <ACTUAL> |
| Terms 31–60 days | <ACTUAL> |
| Terms 61+ days | <ACTUAL> |
| Average terms (days) | <ACTUAL> |

## 3. invoice_disputes.status taxonomy

| Status | Count |
|---|---|
| <ACTUAL_STATUS> | <ACTUAL_COUNT> |
| ... | ... |

## Decisions

### Profitability signal (§1.3 of design spec)

Spec gate:
- unit_cost coverage ≥80% (null + zero combined <20%) → ship in Phase 1
- 50–80% → ship with fallback chain, flag low-coverage assessments
- <50% → defer to v1.1; ship 5 signals in v1

**Decision:** <SHIP | SHIP-WITH-FALLBACK | DEFER>
**Rationale:** <one paragraph>

### Net-terms aware debt aging (§1.4)

Spec assumes `invoices.due_date` is populated. Per the schema (NOT NULL), it always is — the real question is whether the *distribution* of terms looks realistic:

- If `due-before-issued > 0`: data quality red flag — backfill or correct the rows before shipping (engine will score them oddly otherwise)
- If the distribution clusters in 0-day terms: net-terms aware aging won't add value over issued-at aging — flag it but ship anyway
- If a healthy spread (some 14-day, 30-day, 60-day rows): ship as specified

**Decision:** <SHIP | SHIP-WITH-DATA-QUALITY-CAVEAT | BLOCK-ON-BACKFILL>
**Rationale:** <one paragraph>

### Dispute exclusion (§1.4)

Spec assumes `invoice_disputes.status = 'open'` is the canonical "active dispute" filter.
- If 'open' present in taxonomy: confirmed.
- If only 'new', 'pending', or other values appear: spec's exclusion filter needs to be updated.

**Decision:** <CONFIRMED | UPDATE-SPEC-FILTER>
**Active-dispute filter to use in signals:** `status = '<VALUE>'`

## Next Steps

Phase 1 proceeds with the decisions above. Any DEFER or BLOCK-ON-BACKFILL outcome opens a follow-up issue.
```

- [ ] **Step 2: Fill in the placeholders with the real audit numbers** (from the output captured in Task 0.4)

- [ ] **Step 3: Make the three decisions and write the rationales**

- [ ] **Step 4: Commit**

```bash
git add docs/credit-engine-data-audit-2026-05-18.md
git commit -m "docs(credit-engine): record Phase 0 data audit and go/no-go decisions"
```

**Phase 0 done.** The decisions in this document drive Phase 1 — if profitability is DEFER, skip Tasks 1.13 (profitability tests) and 1.14 (profitability impl), and the cold-start gate in 1.21 uses 5 signals not 6.

---

# PHASE 1: Schema + Engine Core

### Task 1.1: Write the migration SQL — stances and config tables

**Files:**
- Create: `migrations/0033_credit_engine.sql`

- [ ] **Step 1: Create the migration file with stances and config tables**

```sql
-- Credit Engine Phase 1: stances, engine config, append-only histories.
-- This migration sets up the static-config side of the engine.
-- Assessment, recompute queue, and customer column additions land in subsequent
-- file ranges (later steps in this migration).

CREATE TABLE IF NOT EXISTS credit_engine_stances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  description text,
  weight_revenue_momentum    integer NOT NULL,
  weight_cash_collection     integer NOT NULL,
  weight_profitability       integer NOT NULL,
  weight_debt_aging          integer NOT NULL,
  weight_repayment_velocity  integer NOT NULL,
  weight_tenure_depth        integer NOT NULL,
  is_seeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_engine_stances_weights_sum CHECK (
    weight_revenue_momentum + weight_cash_collection + weight_profitability +
    weight_debt_aging + weight_repayment_velocity + weight_tenure_depth = 100
  ),
  CONSTRAINT credit_engine_stances_weights_nonneg CHECK (
    weight_revenue_momentum >= 0 AND weight_cash_collection >= 0 AND
    weight_profitability >= 0 AND weight_debt_aging >= 0 AND
    weight_repayment_velocity >= 0 AND weight_tenure_depth >= 0
  )
);

CREATE TABLE IF NOT EXISTS credit_engine_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_default_stance_id uuid NOT NULL REFERENCES credit_engine_stances(id) ON DELETE RESTRICT,
  cold_start_min_posted_invoices integer NOT NULL DEFAULT 3,
  cold_start_min_tenure_days integer NOT NULL DEFAULT 60,
  manual_override_reminder_default_days integer NOT NULL DEFAULT 60,
  manual_override_snooze_cap_days integer NOT NULL DEFAULT 365,
  shadow_mode boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS credit_engine_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES users(id),
  command_id uuid REFERENCES command_journal(id),
  pre_state jsonb NOT NULL,
  post_state jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_engine_stance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stance_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES users(id),
  command_id uuid REFERENCES command_journal(id),
  action varchar(16) NOT NULL CHECK (action IN ('create','update','delete')),
  pre_state jsonb,
  post_state jsonb,
  affected_customer_count integer
);
```

- [ ] **Step 2: Commit this slice of the migration**

```bash
git add migrations/0033_credit_engine.sql
git commit -m "feat(credit-engine): add stance and engine-config tables to migration"
```

### Task 1.2: Migration — assessments table

**Files:**
- Modify: `migrations/0033_credit_engine.sql`

- [ ] **Step 1: Append the assessments table at the end of the migration file**

```sql

CREATE TABLE IF NOT EXISTS customer_credit_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stance_id uuid NOT NULL REFERENCES credit_engine_stances(id) ON DELETE RESTRICT,
  score_revenue_momentum   integer NOT NULL CHECK (score_revenue_momentum BETWEEN 0 AND 100),
  score_cash_collection    integer NOT NULL CHECK (score_cash_collection BETWEEN 0 AND 100),
  score_profitability      integer NOT NULL CHECK (score_profitability BETWEEN 0 AND 100),
  score_debt_aging         integer NOT NULL CHECK (score_debt_aging BETWEEN 0 AND 100),
  score_repayment_velocity integer NOT NULL CHECK (score_repayment_velocity BETWEEN 0 AND 100),
  score_tenure_depth       integer NOT NULL CHECK (score_tenure_depth BETWEEN 0 AND 100),
  confidence_revenue_momentum   varchar(8) NOT NULL,
  confidence_cash_collection    varchar(8) NOT NULL,
  confidence_profitability      varchar(8) NOT NULL,
  confidence_debt_aging         varchar(8) NOT NULL,
  confidence_repayment_velocity varchar(8) NOT NULL,
  confidence_tenure_depth       varchar(8) NOT NULL,
  overall_score    integer NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  base_amount      numeric(12,2) NOT NULL CHECK (base_amount >= 0),
  multiplier       numeric(5,2)  NOT NULL CHECK (multiplier >= 0 AND multiplier <= 10.0),
  recommended_limit numeric(12,2) NOT NULL CHECK (recommended_limit >= 0 AND recommended_limit <= 100000000),
  engine_max_applied numeric(12,2),
  final_limit       numeric(12,2) NOT NULL CHECK (final_limit >= 0 AND final_limit <= 100000000),
  triggered_by varchar(32) NOT NULL CHECK (triggered_by IN (
    'event:postSalesOrder','event:confirmSalesOrder','event:recordPayment',
    'event:allocatePayment','event:postLedgerRow','event:voidInvoice',
    'event:reverseSalesOrder','event:disputeInvoice','event:resolveDispute',
    'event:setEngineMax','event:setStance','event:stanceEdited',
    'nightly','manualTrigger','shadowMode','bulkRevert','reconciliation'
  )),
  triggered_by_command_id uuid REFERENCES command_journal(id),
  applied boolean NOT NULL,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_credit_assessments_customer_idx
  ON customer_credit_assessments(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_credit_assessments_stance_idx
  ON customer_credit_assessments(stance_id);
```

- [ ] **Step 2: Commit**

```bash
git add migrations/0033_credit_engine.sql
git commit -m "feat(credit-engine): add customer_credit_assessments table to migration"
```

### Task 1.3: Migration — recompute queue and user_dismissed_banners

**Files:**
- Modify: `migrations/0033_credit_engine.sql`

- [ ] **Step 1: Append recompute queue and dismissed-banners tables**

```sql

CREATE TABLE IF NOT EXISTS credit_recompute_queue (
  id bigserial PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  enqueued_by varchar(64) NOT NULL,
  command_id uuid REFERENCES command_journal(id),
  attempts integer NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  last_error text,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed_terminal'))
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_recompute_queue_pending_unique
  ON credit_recompute_queue(customer_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS credit_recompute_queue_status_idx
  ON credit_recompute_queue(status, enqueued_at);

CREATE TABLE IF NOT EXISTS user_dismissed_banners (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banner_key varchar(64) NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, banner_key)
);
```

- [ ] **Step 2: Commit**

```bash
git add migrations/0033_credit_engine.sql
git commit -m "feat(credit-engine): add credit_recompute_queue and user_dismissed_banners tables"
```

### Task 1.4: Migration — customer column additions

**Files:**
- Modify: `migrations/0033_credit_engine.sql`

- [ ] **Step 1: Append the ALTER TABLE for customers**

```sql

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS engine_max numeric(12,2),
  ADD COLUMN IF NOT EXISTS stance_id uuid REFERENCES credit_engine_stances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_limit_source varchar(16) NOT NULL DEFAULT 'manual'
    CHECK (credit_limit_source IN ('engine', 'manual')),
  ADD COLUMN IF NOT EXISTS engine_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS engine_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS engine_disabled_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS engine_disabled_reason text,
  ADD COLUMN IF NOT EXISTS last_assessment_id uuid REFERENCES customer_credit_assessments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_limit_manual_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_limit_manual_set_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS credit_limit_manual_reason text,
  ADD COLUMN IF NOT EXISTS credit_limit_reminder_days integer,
  ADD COLUMN IF NOT EXISTS credit_limit_last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_limit_snooze_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS customers_credit_limit_source_idx ON customers(credit_limit_source)
  WHERE credit_limit_source = 'manual';
CREATE INDEX IF NOT EXISTS customers_engine_disabled_idx ON customers(engine_disabled_at)
  WHERE engine_disabled_at IS NOT NULL;

ALTER TABLE customers
  ADD CONSTRAINT customers_engine_source_has_assessment CHECK (
    credit_limit_source = 'manual' OR last_assessment_id IS NOT NULL
  ) NOT VALID;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/0033_credit_engine.sql
git commit -m "feat(credit-engine): add credit engine columns to customers table"
```

### Task 1.5: Apply migration locally to verify

**Files:** (none modified)

- [ ] **Step 1: Apply the migration**

```bash
pnpm db:migrate
```

Expected output ends with `Applied 0033_credit_engine.sql`.

- [ ] **Step 2: Verify schema additions via psql**

```bash
psql "$DATABASE_URL" -c "\d customers" | grep -E "credit_limit_source|engine_enabled|engine_max|stance_id"
psql "$DATABASE_URL" -c "\d credit_engine_stances"
psql "$DATABASE_URL" -c "\d customer_credit_assessments"
psql "$DATABASE_URL" -c "\d credit_recompute_queue"
```

Expected: each `\d` prints the table with the columns from the migration.

- [ ] **Step 3: No commit needed** — migration was committed in Tasks 1.1–1.4.

### Task 1.6: Add drizzle table definitions for stances and config

**Files:**
- Modify: `src/server/schema.ts`

- [ ] **Step 1: Append the new table definitions at the end of `src/server/schema.ts`**

```typescript

export const creditEngineStances = pgTable('credit_engine_stances', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  description: text('description'),
  weightRevenueMomentum: integer('weight_revenue_momentum').notNull(),
  weightCashCollection: integer('weight_cash_collection').notNull(),
  weightProfitability: integer('weight_profitability').notNull(),
  weightDebtAging: integer('weight_debt_aging').notNull(),
  weightRepaymentVelocity: integer('weight_repayment_velocity').notNull(),
  weightTenureDepth: integer('weight_tenure_depth').notNull(),
  isSeeded: boolean('is_seeded').notNull().default(false),
  createdAt: now(),
  updatedAt: updated()
});

export const creditEngineConfig = pgTable('credit_engine_config', {
  id: id(),
  globalDefaultStanceId: uuid('global_default_stance_id')
    .notNull()
    .references(() => creditEngineStances.id, { onDelete: 'restrict' }),
  coldStartMinPostedInvoices: integer('cold_start_min_posted_invoices').notNull().default(3),
  coldStartMinTenureDays: integer('cold_start_min_tenure_days').notNull().default(60),
  manualOverrideReminderDefaultDays: integer('manual_override_reminder_default_days').notNull().default(60),
  manualOverrideSnoozeCapDays: integer('manual_override_snooze_cap_days').notNull().default(365),
  shadowMode: boolean('shadow_mode').notNull().default(true),
  updatedAt: updated(),
  updatedBy: uuid('updated_by').references(() => users.id)
});
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/schema.ts
git commit -m "feat(credit-engine): add stances and config drizzle definitions"
```

### Task 1.7: Add drizzle table definitions for assessments + queue + history + banners

**Files:**
- Modify: `src/server/schema.ts`

- [ ] **Step 0: Extend the drizzle imports at the top of `src/server/schema.ts` to include `bigserial`**

Update the import block (currently lines 1-13) so it includes `bigserial`:

```typescript
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
```

- [ ] **Step 1: Append the remaining new tables to `src/server/schema.ts`**

```typescript

export const customerCreditAssessments = pgTable('customer_credit_assessments', {
  id: id(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  stanceId: uuid('stance_id').notNull().references(() => creditEngineStances.id, { onDelete: 'restrict' }),
  scoreRevenueMomentum: integer('score_revenue_momentum').notNull(),
  scoreCashCollection: integer('score_cash_collection').notNull(),
  scoreProfitability: integer('score_profitability').notNull(),
  scoreDebtAging: integer('score_debt_aging').notNull(),
  scoreRepaymentVelocity: integer('score_repayment_velocity').notNull(),
  scoreTenureDepth: integer('score_tenure_depth').notNull(),
  confidenceRevenueMomentum: varchar('confidence_revenue_momentum', { length: 8 }).notNull(),
  confidenceCashCollection: varchar('confidence_cash_collection', { length: 8 }).notNull(),
  confidenceProfitability: varchar('confidence_profitability', { length: 8 }).notNull(),
  confidenceDebtAging: varchar('confidence_debt_aging', { length: 8 }).notNull(),
  confidenceRepaymentVelocity: varchar('confidence_repayment_velocity', { length: 8 }).notNull(),
  confidenceTenureDepth: varchar('confidence_tenure_depth', { length: 8 }).notNull(),
  overallScore: integer('overall_score').notNull(),
  baseAmount: numeric('base_amount', { precision: 12, scale: 2 }).notNull(),
  multiplier: numeric('multiplier', { precision: 5, scale: 2 }).notNull(),
  recommendedLimit: numeric('recommended_limit', { precision: 12, scale: 2 }).notNull(),
  engineMaxApplied: numeric('engine_max_applied', { precision: 12, scale: 2 }),
  finalLimit: numeric('final_limit', { precision: 12, scale: 2 }).notNull(),
  triggeredBy: varchar('triggered_by', { length: 32 }).notNull(),
  triggeredByCommandId: uuid('triggered_by_command_id').references(() => commandJournal.id),
  applied: boolean('applied').notNull(),
  idempotencyKey: text('idempotency_key').unique(),
  createdAt: now()
});

export const creditRecomputeQueue = pgTable('credit_recompute_queue', {
  // SQL column is `bigserial`. Use drizzle bigserial mode 'bigint' for 64-bit safety.
  // Returned as a JS string from drizzle to avoid Number precision loss past 2^53.
  // Callers that need numeric arithmetic on this id must parse explicitly.
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).notNull().defaultNow(),
  enqueuedBy: varchar('enqueued_by', { length: 64 }).notNull(),
  commandId: uuid('command_id').references(() => commandJournal.id),
  attempts: integer('attempts').notNull().default(0),
  lastAttemptedAt: timestamp('last_attempted_at', { withTimezone: true }),
  lastError: text('last_error'),
  status: varchar('status', { length: 16 }).notNull().default('pending')
});

export const creditEngineConfigHistory = pgTable('credit_engine_config_history', {
  id: id(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: uuid('changed_by').notNull().references(() => users.id),
  commandId: uuid('command_id').references(() => commandJournal.id),
  preState: jsonb('pre_state').notNull(),
  postState: jsonb('post_state').notNull()
});

export const creditEngineStanceHistory = pgTable('credit_engine_stance_history', {
  id: id(),
  stanceId: uuid('stance_id').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: uuid('changed_by').notNull().references(() => users.id),
  commandId: uuid('command_id').references(() => commandJournal.id),
  action: varchar('action', { length: 16 }).notNull(),
  preState: jsonb('pre_state'),
  postState: jsonb('post_state'),
  affectedCustomerCount: integer('affected_customer_count')
});

export const userDismissedBanners = pgTable('user_dismissed_banners', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bannerKey: varchar('banner_key', { length: 64 }).notNull(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow()
});
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/schema.ts
git commit -m "feat(credit-engine): add assessments, queue, history, banners drizzle definitions"
```

### Task 1.8: Extend `customers` drizzle definition with engine columns

**Files:**
- Modify: `src/server/schema.ts` (lines 64-73, the `customers` table definition)

- [ ] **Step 1: Update the `customers` definition to include all new columns**

Replace the existing `customers` definition (currently lines ~64-73) with:

```typescript
export const customers = pgTable('customers', {
  id: id(),
  name: varchar('name', { length: 180 }).notNull(),
  creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull().default('0'),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull().default('0'),
  tags: text('tags').array().notNull().default([]),
  notes: text('notes'),
  engineMax: numeric('engine_max', { precision: 12, scale: 2 }),
  stanceId: uuid('stance_id'),
  creditLimitSource: varchar('credit_limit_source', { length: 16 }).notNull().default('manual'),
  engineEnabled: boolean('engine_enabled').notNull().default(false),
  engineDisabledAt: timestamp('engine_disabled_at', { withTimezone: true }),
  engineDisabledBy: uuid('engine_disabled_by'),
  engineDisabledReason: text('engine_disabled_reason'),
  lastAssessmentId: uuid('last_assessment_id'),
  creditLimitManualSetAt: timestamp('credit_limit_manual_set_at', { withTimezone: true }),
  creditLimitManualSetBy: uuid('credit_limit_manual_set_by'),
  creditLimitManualReason: text('credit_limit_manual_reason'),
  creditLimitReminderDays: integer('credit_limit_reminder_days'),
  creditLimitLastReviewedAt: timestamp('credit_limit_last_reviewed_at', { withTimezone: true }),
  creditLimitSnoozeCount: integer('credit_limit_snooze_count').notNull().default(0),
  createdAt: now(),
  updatedAt: updated()
});
```

Note: cross-table references (to `creditEngineStances`, `customerCreditAssessments`, `users`) are intentionally omitted from this drizzle definition to avoid forward-declaration ordering issues; the DB-level FKs (in the migration) are what enforce referential integrity. Drizzle queries continue to work fine without the `.references(...)` chain.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/schema.ts
git commit -m "feat(credit-engine): extend customers drizzle definition with engine columns"
```

### Task 1.9: Seed default stances and engine config

**Files:**
- Modify: `src/server/seed.ts`

- [ ] **Step 1: Extend the truncate list in `src/server/seed.ts` to include the new credit-engine tables.** Without this, re-seeding leaves stale rows in the new tables and the stance/config insert behavior is order-dependent. Find lines 39-47 (the `truncate table ... restart identity cascade` block) and add the new tables to the list. The exact replacement:

```sql
      truncate table
        "session", command_journal, backup_snapshots, photography_queue, archive_runs, period_locks, correction_journal_entries,
        matchmaking_matches, vendor_supply, customer_needs, tag_catalog,
        client_ledger_entries, invoice_disputes, credit_overrides, connector_requests, fulfillment_lines, pick_lists,
        vendor_payments, vendor_bills, payment_allocations, payments, invoices, sales_order_lines, sales_orders,
        purchase_receipt_lines, purchase_receipts, inventory_movements, batches, purchase_order_lines, purchase_orders,
        customer_credit_assessments, credit_recompute_queue,
        credit_engine_config_history, credit_engine_stance_history,
        credit_engine_config, credit_engine_stances,
        user_dismissed_banners,
        items, customers, vendors, users
      restart identity cascade
```

`CASCADE` handles FK ordering, but listing the new tables before `customers` keeps the SQL easy to audit visually. After this edit, run `pnpm db:seed` once to confirm no errors before proceeding to Step 2.

- [ ] **Step 2: Locate the existing seed function and add a credit-engine seed section**

Find the end of the main seed function (the one called from `main()`). Before its final return / commit, insert:

```typescript
  // ---- Credit Engine seed (Phase 1) ----
  const stances = [
    { name: 'Balanced',            description: 'Default; even-handed', revM: 20, cashC: 20, profit: 15, debt: 15, vel: 20, tenure: 10 },
    { name: 'Prioritize Cash',     description: 'Reward customers who pay fast and pay in full', revM: 5,  cashC: 35, profit: 5,  debt: 20, vel: 30, tenure: 5  },
    { name: 'Prioritize Revenue',  description: 'Reward growth and volume', revM: 35, cashC: 10, profit: 25, debt: 10, vel: 10, tenure: 10 },
    { name: 'Conservative',        description: 'Penalize debt and slow payers heavily', revM: 5,  cashC: 25, profit: 10, debt: 35, vel: 20, tenure: 5  },
    { name: 'Loyalty-Weighted',    description: 'Reward long-term customers', revM: 15, cashC: 15, profit: 15, debt: 15, vel: 15, tenure: 25 }
  ];

  let balancedStanceId: string | undefined;
  for (const s of stances) {
    const sum = s.revM + s.cashC + s.profit + s.debt + s.vel + s.tenure;
    if (sum !== 100) {
      throw new Error(`Stance ${s.name} weights sum to ${sum}, expected 100`);
    }
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO credit_engine_stances
         (name, description, weight_revenue_momentum, weight_cash_collection,
          weight_profitability, weight_debt_aging, weight_repayment_velocity,
          weight_tenure_depth, is_seeded)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      [s.name, s.description, s.revM, s.cashC, s.profit, s.debt, s.vel, s.tenure]
    );
    if (s.name === 'Balanced') {
      balancedStanceId = rows[0].id;
    }
  }
  if (!balancedStanceId) {
    throw new Error('Balanced stance was not seeded');
  }

  await pool.query(
    `INSERT INTO credit_engine_config (global_default_stance_id, shadow_mode)
     SELECT $1, true
     WHERE NOT EXISTS (SELECT 1 FROM credit_engine_config)`,
    [balancedStanceId]
  );
```

- [ ] **Step 3: Run the seed against a fresh DB**

```bash
pnpm db:seed
```

Expected output includes no errors. Verify with:

```bash
psql "$DATABASE_URL" -c "SELECT name, weight_revenue_momentum, weight_cash_collection, weight_profitability, weight_debt_aging, weight_repayment_velocity, weight_tenure_depth, is_seeded FROM credit_engine_stances ORDER BY name;"
psql "$DATABASE_URL" -c "SELECT id, global_default_stance_id, shadow_mode FROM credit_engine_config;"
```

Expected: 5 stances each summing to 100 with `is_seeded = t`; one config row with `shadow_mode = t`.

- [ ] **Step 4: Run the seed a SECOND time to verify idempotency** (this confirms the truncate-list patch from Step 1 works)

```bash
pnpm db:seed
```

Expected: no errors. Verify the same queries from Step 3 still return the same 5 stances and one config row (no duplicates, no missing rows).

- [ ] **Step 5: Commit**

```bash
git add src/server/seed.ts
git commit -m "feat(credit-engine): seed 5 default stances and engine config row"
```

### Task 1.10: Create confidence helper (TDD)

**Files:**
- Create: `src/server/services/creditEngine/confidence.ts`
- Create: `src/server/services/creditEngine/confidence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/confidence.test.ts
import { describe, it, expect } from 'vitest';
import { bucketConfidence, type ConfidenceLevel } from './confidence';

describe('bucketConfidence', () => {
  it('returns "high" for >= 10 data points', () => {
    expect(bucketConfidence(10)).toBe('high' satisfies ConfidenceLevel);
    expect(bucketConfidence(47)).toBe('high');
  });
  it('returns "medium" for 3..9', () => {
    expect(bucketConfidence(3)).toBe('medium');
    expect(bucketConfidence(9)).toBe('medium');
  });
  it('returns "low" for 1..2', () => {
    expect(bucketConfidence(1)).toBe('low');
    expect(bucketConfidence(2)).toBe('low');
  });
  it('returns "none" for 0', () => {
    expect(bucketConfidence(0)).toBe('none');
  });
  it('throws for negative counts', () => {
    expect(() => bucketConfidence(-1)).toThrow('dataCount must be non-negative');
  });
  it('throws for non-integer counts', () => {
    expect(() => bucketConfidence(3.5)).toThrow('dataCount must be an integer');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/server/services/creditEngine/confidence.test.ts -- --run
```

Expected: FAIL with "Cannot find module './confidence'" or similar.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/server/services/creditEngine/confidence.ts
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export function bucketConfidence(dataCount: number): ConfidenceLevel {
  if (!Number.isInteger(dataCount)) {
    throw new Error('dataCount must be an integer');
  }
  if (dataCount < 0) {
    throw new Error('dataCount must be non-negative');
  }
  if (dataCount === 0) return 'none';
  if (dataCount <= 2) return 'low';
  if (dataCount <= 9) return 'medium';
  return 'high';
}
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
pnpm test src/server/services/creditEngine/confidence.test.ts -- --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/confidence.ts src/server/services/creditEngine/confidence.test.ts
git commit -m "feat(credit-engine): add confidence bucketing helper with tests"
```

### Task 1.11: Create input guards module (TDD)

Each signal's SQL must apply universal guards (§1.0). Centralize them so changes apply everywhere.

**Files:**
- Create: `src/server/services/creditEngine/inputGuards.ts`
- Create: `src/server/services/creditEngine/inputGuards.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/inputGuards.test.ts
import { describe, it, expect } from 'vitest';
import {
  invoiceGuardClause,
  salesOrderGuardClause,
  salesOrderLineGuardClause,
  paymentGuardClause
} from './inputGuards';

describe('input guard clauses', () => {
  it('invoice guard rejects negative totals, future dates, and voided rows', () => {
    expect(invoiceGuardClause('inv')).toBe(
      `inv.total >= 0 AND inv.created_at <= now() AND inv.status != 'voided'`
    );
  });
  it('sales_order guard rejects negative totals, future-posted, and voided rows', () => {
    expect(salesOrderGuardClause('so')).toBe(
      `so.total >= 0 AND so.created_at <= now() AND so.status != 'voided'`
    );
  });
  it('sales_order_lines guard rejects non-positive qty and unit_cost', () => {
    expect(salesOrderLineGuardClause('sol')).toBe(
      `sol.qty > 0 AND sol.unit_cost > 0`
    );
  });
  it('payment guard rejects negative amounts, future, non-posted', () => {
    expect(paymentGuardClause('p')).toBe(
      `p.amount >= 0 AND p.created_at <= now() AND p.status = 'posted'`
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
pnpm test src/server/services/creditEngine/inputGuards.test.ts -- --run
```

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/inputGuards.ts
// Centralized WHERE-clause helpers enforcing §1.0 universal input guards.
// Pass the table alias used in the calling query.
export function invoiceGuardClause(a: string): string {
  return `${a}.total >= 0 AND ${a}.created_at <= now() AND ${a}.status != 'voided'`;
}
export function salesOrderGuardClause(a: string): string {
  return `${a}.total >= 0 AND ${a}.created_at <= now() AND ${a}.status != 'voided'`;
}
export function salesOrderLineGuardClause(a: string): string {
  return `${a}.qty > 0 AND ${a}.unit_cost > 0`;
}
export function paymentGuardClause(a: string): string {
  return `${a}.amount >= 0 AND ${a}.created_at <= now() AND ${a}.status = 'posted'`;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
pnpm test src/server/services/creditEngine/inputGuards.test.ts -- --run
```

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/inputGuards.ts src/server/services/creditEngine/inputGuards.test.ts
git commit -m "feat(credit-engine): add SQL input-guard helpers with tests"
```

### Task 1.12: Revenue Momentum signal — pure scoring (TDD)

Each signal file exposes two layers per the architecture note above. This task implements only the pure-math scoring function. A future Phase 2 task will add the DB-query composition.

**Files:**
- Create: `src/server/services/creditEngine/signals/revenueMomentum.ts`
- Create: `src/server/services/creditEngine/signals/revenueMomentum.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/signals/revenueMomentum.test.ts
import { describe, it, expect } from 'vitest';
import { scoreRevenueMomentum } from './revenueMomentum';

describe('scoreRevenueMomentum', () => {
  it('returns 50 when both windows have zero revenue (dataCount=0 → confidence none)', () => {
    const out = scoreRevenueMomentum({ recent: 0, baseline: 0, dataCount: 0 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('none');
  });
  it('returns 75 when baseline is zero but recent is positive', () => {
    const out = scoreRevenueMomentum({ recent: 5000, baseline: 0, dataCount: 4 });
    expect(out.score).toBe(75);
    expect(out.confidence).toBe('medium');
  });
  it('returns 50 when recent matches baseline-normalized (flat trend)', () => {
    // recent_3 = 6000, baseline_6 = 18000 → normalized recent_to_baseline = 6000*3/18000 = 1.0
    const out = scoreRevenueMomentum({ recent: 6000, baseline: 18000, dataCount: 20 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('high');
  });
  it('returns 100 when 2x baseline-normalized growth', () => {
    // recent*3 / baseline = 2.0 → score = 50 + (2-1)*50 = 100
    const out = scoreRevenueMomentum({ recent: 12000, baseline: 18000, dataCount: 15 });
    expect(out.score).toBe(100);
  });
  it('clamps to 0 on extreme decline', () => {
    // recent*3/baseline = 0 → score = 50 + (0-1)*50 = 0
    const out = scoreRevenueMomentum({ recent: 0, baseline: 18000, dataCount: 10 });
    expect(out.score).toBe(0);
  });
  it('clamps to 100 on extreme growth', () => {
    // recent*3/baseline = 10 → score = 50 + (10-1)*50 = 500 → clamp to 100
    const out = scoreRevenueMomentum({ recent: 60000, baseline: 18000, dataCount: 14 });
    expect(out.score).toBe(100);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreRevenueMomentum({ recent: -1, baseline: 100, dataCount: 1 })).toThrow();
    expect(() => scoreRevenueMomentum({ recent: 100, baseline: -1, dataCount: 1 })).toThrow();
    expect(() => scoreRevenueMomentum({ recent: 100, baseline: 100, dataCount: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
pnpm test src/server/services/creditEngine/signals/revenueMomentum.test.ts -- --run
```

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/signals/revenueMomentum.ts
import { bucketConfidence, type ConfidenceLevel } from '../confidence';

export interface RevenueMomentumInput {
  recent: number;    // sum of invoices.total in last 90 days (guards applied)
  baseline: number;  // sum of invoices.total between 270d and 90d ago (guards applied)
  dataCount: number; // count of invoices contributing to recent + baseline
}

export interface SignalResult {
  score: number;
  confidence: ConfidenceLevel;
  dataCount: number;
}

export function scoreRevenueMomentum(input: RevenueMomentumInput): SignalResult {
  if (input.recent < 0 || input.baseline < 0 || input.dataCount < 0) {
    throw new Error('revenue momentum inputs must be non-negative');
  }
  const confidence = bucketConfidence(input.dataCount);
  if (input.baseline === 0 && input.recent === 0) {
    return { score: 50, confidence, dataCount: input.dataCount };
  }
  if (input.baseline === 0) {
    return { score: 75, confidence, dataCount: input.dataCount };
  }
  const growthRatio = (input.recent * 3) / input.baseline;
  const raw = 50 + (growthRatio - 1) * 50;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, confidence, dataCount: input.dataCount };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
pnpm test src/server/services/creditEngine/signals/revenueMomentum.test.ts -- --run
```

Note on coverage: per-file coverage via `pnpm test:coverage -- <path>` is not how vitest's CLI works. The single 100% coverage gate is enforced in Task 1.24 against the full engine module via `pnpm test:coverage`. If you want a quick check now, run that and confirm `revenueMomentum.ts` reports 100%.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/signals/revenueMomentum.ts src/server/services/creditEngine/signals/revenueMomentum.test.ts
git commit -m "feat(credit-engine): add revenue momentum scoring with tests"
```

### Task 1.13: Cash Collection signal (TDD)

**Files:**
- Create: `src/server/services/creditEngine/signals/cashCollection.ts`
- Create: `src/server/services/creditEngine/signals/cashCollection.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/signals/cashCollection.test.ts
import { describe, it, expect } from 'vitest';
import { scoreCashCollection } from './cashCollection';

describe('scoreCashCollection', () => {
  it('returns 50 when no invoices in window', () => {
    const out = scoreCashCollection({ invoiced: 0, paid: 0, dataCount: 0 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('none');
  });
  it('returns 100 when fully paid', () => {
    const out = scoreCashCollection({ invoiced: 10000, paid: 10000, dataCount: 12 });
    expect(out.score).toBe(100);
    expect(out.confidence).toBe('high');
  });
  it('returns 50 when half paid', () => {
    const out = scoreCashCollection({ invoiced: 10000, paid: 5000, dataCount: 8 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('medium');
  });
  it('returns 0 when nothing paid', () => {
    const out = scoreCashCollection({ invoiced: 10000, paid: 0, dataCount: 3 });
    expect(out.score).toBe(0);
  });
  it('clamps to 100 if paid exceeds invoiced (refund edge case)', () => {
    const out = scoreCashCollection({ invoiced: 10000, paid: 12000, dataCount: 5 });
    expect(out.score).toBe(100);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreCashCollection({ invoiced: -1, paid: 0, dataCount: 1 })).toThrow();
    expect(() => scoreCashCollection({ invoiced: 100, paid: -1, dataCount: 1 })).toThrow();
    expect(() => scoreCashCollection({ invoiced: 100, paid: 100, dataCount: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/signals/cashCollection.ts
import { bucketConfidence } from '../confidence';
import type { SignalResult } from './revenueMomentum';

export interface CashCollectionInput {
  invoiced: number;
  paid: number;
  dataCount: number;
}

export function scoreCashCollection(input: CashCollectionInput): SignalResult {
  if (input.invoiced < 0 || input.paid < 0 || input.dataCount < 0) {
    throw new Error('cash collection inputs must be non-negative');
  }
  const confidence = bucketConfidence(input.dataCount);
  if (input.invoiced === 0) {
    return { score: 50, confidence, dataCount: input.dataCount };
  }
  const rate = input.paid / input.invoiced;
  const score = Math.max(0, Math.min(100, Math.round(rate * 100)));
  return { score, confidence, dataCount: input.dataCount };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/signals/cashCollection.ts src/server/services/creditEngine/signals/cashCollection.test.ts
git commit -m "feat(credit-engine): add cash collection scoring with tests"
```

### Task 1.14: Profitability signal (TDD) — CONDITIONAL on Phase 0

**Run only if Phase 0 decision was SHIP or SHIP-WITH-FALLBACK.** If DEFER, skip to Task 1.15.

**Files:**
- Create: `src/server/services/creditEngine/signals/profitability.ts`
- Create: `src/server/services/creditEngine/signals/profitability.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/signals/profitability.test.ts
import { describe, it, expect } from 'vitest';
import { scoreProfitability } from './profitability';

describe('scoreProfitability', () => {
  it('returns 50 when no revenue in window', () => {
    const out = scoreProfitability({ revenue: 0, cogs: 0, dataCount: 0 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('none');
  });
  it('returns 100 at 50% margin', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 5000, dataCount: 12 });
    expect(out.score).toBe(100);
  });
  it('returns 50 at 25% margin', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 7500, dataCount: 6 });
    expect(out.score).toBe(50);
  });
  it('returns 0 at 0% margin', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 10000, dataCount: 4 });
    expect(out.score).toBe(0);
  });
  it('clamps to 0 if cogs exceeds revenue (loss-making)', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 12000, dataCount: 5 });
    expect(out.score).toBe(0);
  });
  it('clamps to 100 above 50% margin', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 2000, dataCount: 8 });
    expect(out.score).toBe(100);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreProfitability({ revenue: -1, cogs: 0, dataCount: 1 })).toThrow();
    expect(() => scoreProfitability({ revenue: 100, cogs: -1, dataCount: 1 })).toThrow();
    expect(() => scoreProfitability({ revenue: 100, cogs: 50, dataCount: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/signals/profitability.ts
import { bucketConfidence } from '../confidence';
import type { SignalResult } from './revenueMomentum';

export interface ProfitabilityInput {
  revenue: number;
  cogs: number;
  dataCount: number;
}

export function scoreProfitability(input: ProfitabilityInput): SignalResult {
  if (input.revenue < 0 || input.cogs < 0 || input.dataCount < 0) {
    throw new Error('profitability inputs must be non-negative');
  }
  const confidence = bucketConfidence(input.dataCount);
  if (input.revenue === 0) {
    return { score: 50, confidence, dataCount: input.dataCount };
  }
  const marginRate = (input.revenue - input.cogs) / input.revenue;
  const raw = marginRate * 200; // 50% margin → 100
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, confidence, dataCount: input.dataCount };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/signals/profitability.ts src/server/services/creditEngine/signals/profitability.test.ts
git commit -m "feat(credit-engine): add profitability scoring with tests"
```

### Task 1.15: Debt Aging signal (TDD) — net-terms aware, dispute-excluding

**Files:**
- Create: `src/server/services/creditEngine/signals/debtAging.ts`
- Create: `src/server/services/creditEngine/signals/debtAging.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/signals/debtAging.test.ts
import { describe, it, expect } from 'vitest';
import { scoreDebtAging } from './debtAging';

describe('scoreDebtAging', () => {
  it('returns 100 when no open invoices', () => {
    const out = scoreDebtAging({ invoices: [], dataCount: 0 });
    expect(out.score).toBe(100);
    expect(out.confidence).toBe('none');
  });
  it('returns 100 when invoices exist but none are overdue', () => {
    const out = scoreDebtAging({
      invoices: [{ balance: 1000, daysOverdue: 0 }, { balance: 500, daysOverdue: 0 }],
      dataCount: 2
    });
    expect(out.score).toBe(100);
    expect(out.confidence).toBe('low');
  });
  it('scores ~70 at 15 days overdue (boundary)', () => {
    const out = scoreDebtAging({ invoices: [{ balance: 1000, daysOverdue: 15 }], dataCount: 1 });
    expect(out.score).toBe(70);
  });
  it('scores ~40 at 30 days overdue (boundary)', () => {
    const out = scoreDebtAging({ invoices: [{ balance: 1000, daysOverdue: 30 }], dataCount: 1 });
    expect(out.score).toBe(40);
  });
  it('scores 10 at 60+ days overdue', () => {
    const out = scoreDebtAging({ invoices: [{ balance: 1000, daysOverdue: 60 }], dataCount: 1 });
    expect(out.score).toBe(10);
    const out2 = scoreDebtAging({ invoices: [{ balance: 1000, daysOverdue: 120 }], dataCount: 1 });
    expect(out2.score).toBe(10);
  });
  it('weights aging by balance', () => {
    // 1000 @ 30d (=40) and 9000 @ 0d (=100): weighted_days = (30*1000)/10000 = 3 → score ~94
    const out = scoreDebtAging({
      invoices: [{ balance: 1000, daysOverdue: 30 }, { balance: 9000, daysOverdue: 0 }],
      dataCount: 2
    });
    expect(out.score).toBe(94);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreDebtAging({ invoices: [{ balance: -1, daysOverdue: 0 }], dataCount: 1 })).toThrow();
    expect(() => scoreDebtAging({ invoices: [{ balance: 1, daysOverdue: -1 }], dataCount: 1 })).toThrow();
    expect(() => scoreDebtAging({ invoices: [], dataCount: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/signals/debtAging.ts
import { bucketConfidence } from '../confidence';
import type { SignalResult } from './revenueMomentum';

export interface DebtAgingInvoice {
  balance: number;
  daysOverdue: number;
}

export interface DebtAgingInput {
  invoices: DebtAgingInvoice[];
  dataCount: number;
}

export function scoreDebtAging(input: DebtAgingInput): SignalResult {
  if (input.dataCount < 0) {
    throw new Error('dataCount must be non-negative');
  }
  for (const inv of input.invoices) {
    if (inv.balance < 0) {
      throw new Error('invoice balance must be non-negative');
    }
    if (inv.daysOverdue < 0) {
      throw new Error('daysOverdue must be non-negative');
    }
  }
  const confidence = bucketConfidence(input.dataCount);
  const totalBalance = input.invoices.reduce((a, b) => a + b.balance, 0);
  if (totalBalance === 0) {
    return { score: 100, confidence, dataCount: input.dataCount };
  }
  const weightedOverdue =
    input.invoices.reduce((sum, inv) => sum + inv.daysOverdue * inv.balance, 0) / totalBalance;

  let rawScore: number;
  if (weightedOverdue === 0)            rawScore = 100;
  else if (weightedOverdue < 15)        rawScore = 100 - weightedOverdue * (30 / 15);
  else if (weightedOverdue < 30)        rawScore = 70  - (weightedOverdue - 15) * (30 / 15);
  else if (weightedOverdue < 60)        rawScore = 40  - (weightedOverdue - 30) * (30 / 30);
  else                                  rawScore = 10;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  return { score, confidence, dataCount: input.dataCount };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/signals/debtAging.ts src/server/services/creditEngine/signals/debtAging.test.ts
git commit -m "feat(credit-engine): add net-terms-aware debt aging scoring with tests"
```

### Task 1.16: Repayment Velocity signal (TDD)

**Files:**
- Create: `src/server/services/creditEngine/signals/repaymentVelocity.ts`
- Create: `src/server/services/creditEngine/signals/repaymentVelocity.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/signals/repaymentVelocity.test.ts
import { describe, it, expect } from 'vitest';
import { scoreRepaymentVelocity } from './repaymentVelocity';

describe('scoreRepaymentVelocity', () => {
  it('returns 50 when no paid invoices', () => {
    const out = scoreRepaymentVelocity({ avgDaysLate: 0, dataCount: 0 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('none');
  });
  it('returns 100 when avg 0 days late', () => {
    const out = scoreRepaymentVelocity({ avgDaysLate: 0, dataCount: 10 });
    expect(out.score).toBe(100);
  });
  it('returns 60 at 10 days late (boundary)', () => {
    const out = scoreRepaymentVelocity({ avgDaysLate: 10, dataCount: 5 });
    expect(out.score).toBe(60);
  });
  it('returns 0 at 30+ days late', () => {
    const out = scoreRepaymentVelocity({ avgDaysLate: 30, dataCount: 4 });
    expect(out.score).toBe(0);
    const out2 = scoreRepaymentVelocity({ avgDaysLate: 90, dataCount: 4 });
    expect(out2.score).toBe(0);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreRepaymentVelocity({ avgDaysLate: -1, dataCount: 1 })).toThrow();
    expect(() => scoreRepaymentVelocity({ avgDaysLate: 0, dataCount: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/signals/repaymentVelocity.ts
import { bucketConfidence } from '../confidence';
import type { SignalResult } from './revenueMomentum';

export interface RepaymentVelocityInput {
  avgDaysLate: number;
  dataCount: number;
}

export function scoreRepaymentVelocity(input: RepaymentVelocityInput): SignalResult {
  if (input.avgDaysLate < 0 || input.dataCount < 0) {
    throw new Error('repayment velocity inputs must be non-negative');
  }
  const confidence = bucketConfidence(input.dataCount);
  if (input.dataCount === 0) {
    return { score: 50, confidence, dataCount: 0 };
  }
  // 0d → 100, 10d → 60, 30d+ → 0; slope = -4 per day
  const raw = 100 - input.avgDaysLate * 4;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, confidence, dataCount: input.dataCount };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/signals/repaymentVelocity.ts src/server/services/creditEngine/signals/repaymentVelocity.test.ts
git commit -m "feat(credit-engine): add repayment velocity scoring with tests"
```

### Task 1.17: Tenure Depth signal (TDD)

**Files:**
- Create: `src/server/services/creditEngine/signals/tenureDepth.ts`
- Create: `src/server/services/creditEngine/signals/tenureDepth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/signals/tenureDepth.test.ts
import { describe, it, expect } from 'vitest';
import { scoreTenureDepth } from './tenureDepth';

describe('scoreTenureDepth', () => {
  it('returns 0 for brand new customer (0 days)', () => {
    expect(scoreTenureDepth({ daysActive: 0 }).score).toBe(0);
  });
  it('returns 50 at 180 days', () => {
    expect(scoreTenureDepth({ daysActive: 180 }).score).toBe(50);
  });
  it('returns 75 at 365 days', () => {
    expect(scoreTenureDepth({ daysActive: 365 }).score).toBe(75);
  });
  it('returns 90 at 730 days', () => {
    expect(scoreTenureDepth({ daysActive: 730 }).score).toBe(90);
  });
  it('returns 100 at 1095+ days', () => {
    expect(scoreTenureDepth({ daysActive: 1095 }).score).toBe(100);
    expect(scoreTenureDepth({ daysActive: 5000 }).score).toBe(100);
  });
  it('linearly interpolates between checkpoints (e.g., 90 days)', () => {
    expect(scoreTenureDepth({ daysActive: 90 }).score).toBe(25);
  });
  it('confidence is always "high" regardless of tenure (tenure is a single fact, not a sample)', () => {
    expect(scoreTenureDepth({ daysActive: 30 }).confidence).toBe('high');
    expect(scoreTenureDepth({ daysActive: 1000 }).confidence).toBe('high');
  });
  it('throws on negative tenure', () => {
    expect(() => scoreTenureDepth({ daysActive: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/signals/tenureDepth.ts
import type { SignalResult } from './revenueMomentum';

export interface TenureDepthInput {
  daysActive: number;
}

export function scoreTenureDepth(input: TenureDepthInput): SignalResult {
  if (input.daysActive < 0) {
    throw new Error('daysActive must be non-negative');
  }
  let raw: number;
  if (input.daysActive < 180)       raw = (input.daysActive * 50) / 180;
  else if (input.daysActive < 365)  raw = 50 + ((input.daysActive - 180) * 25) / 185;
  else if (input.daysActive < 730)  raw = 75 + ((input.daysActive - 365) * 15) / 365;
  else if (input.daysActive < 1095) raw = 90 + ((input.daysActive - 730) * 10) / 365;
  else                              raw = 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, confidence: 'high', dataCount: 1 };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/signals/tenureDepth.ts src/server/services/creditEngine/signals/tenureDepth.test.ts
git commit -m "feat(credit-engine): add tenure depth scoring with tests"
```

### Task 1.18: Scoring (weighted aggregation + multiplier mapping) (TDD)

**Files:**
- Create: `src/server/services/creditEngine/scoring.ts`
- Create: `src/server/services/creditEngine/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/scoring.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateOverallScore, mapScoreToMultiplier, type Weights, type SignalScores } from './scoring';

const balancedWeights: Weights = {
  revenueMomentum: 20, cashCollection: 20, profitability: 15,
  debtAging: 15, repaymentVelocity: 20, tenureDepth: 10
};

describe('aggregateOverallScore', () => {
  it('combines signals using weights', () => {
    const scores: SignalScores = {
      revenueMomentum: 60, cashCollection: 92, profitability: 44,
      debtAging: 84, repaymentVelocity: 68, tenureDepth: 71
    };
    // 60*20 + 92*20 + 44*15 + 84*15 + 68*20 + 71*10 = 1200+1840+660+1260+1360+710 = 7030 → /100 = 70.3 → 70
    expect(aggregateOverallScore(scores, balancedWeights)).toBe(70);
  });
  it('returns 0 when all scores are 0', () => {
    const scores: SignalScores = {
      revenueMomentum: 0, cashCollection: 0, profitability: 0,
      debtAging: 0, repaymentVelocity: 0, tenureDepth: 0
    };
    expect(aggregateOverallScore(scores, balancedWeights)).toBe(0);
  });
  it('returns 100 when all scores are 100', () => {
    const scores: SignalScores = {
      revenueMomentum: 100, cashCollection: 100, profitability: 100,
      debtAging: 100, repaymentVelocity: 100, tenureDepth: 100
    };
    expect(aggregateOverallScore(scores, balancedWeights)).toBe(100);
  });
  it('throws if weights do not sum to 100', () => {
    const bad: Weights = { ...balancedWeights, tenureDepth: 50 };
    const scores: SignalScores = {
      revenueMomentum: 50, cashCollection: 50, profitability: 50,
      debtAging: 50, repaymentVelocity: 50, tenureDepth: 50
    };
    expect(() => aggregateOverallScore(scores, bad)).toThrow('weights must sum to 100');
  });
  it('throws if any score is out of range', () => {
    const scores: SignalScores = {
      revenueMomentum: -1, cashCollection: 50, profitability: 50,
      debtAging: 50, repaymentVelocity: 50, tenureDepth: 50
    };
    expect(() => aggregateOverallScore(scores, balancedWeights)).toThrow('score');
  });
});

describe('mapScoreToMultiplier', () => {
  it('maps scores to default multiplier table', () => {
    expect(mapScoreToMultiplier(0)).toBe(0.0);
    expect(mapScoreToMultiplier(19)).toBe(0.0);
    expect(mapScoreToMultiplier(20)).toBe(0.5);
    expect(mapScoreToMultiplier(39)).toBe(0.5);
    expect(mapScoreToMultiplier(40)).toBe(1.0);
    expect(mapScoreToMultiplier(59)).toBe(1.0);
    expect(mapScoreToMultiplier(60)).toBe(2.0);
    expect(mapScoreToMultiplier(70)).toBe(2.0);
    expect(mapScoreToMultiplier(79)).toBe(2.0);
    expect(mapScoreToMultiplier(80)).toBe(3.0);
    expect(mapScoreToMultiplier(89)).toBe(3.0);
    expect(mapScoreToMultiplier(90)).toBe(4.0);
    expect(mapScoreToMultiplier(100)).toBe(4.0);
  });
  it('throws on out-of-range scores', () => {
    expect(() => mapScoreToMultiplier(-1)).toThrow();
    expect(() => mapScoreToMultiplier(101)).toThrow();
    expect(() => mapScoreToMultiplier(50.5)).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/scoring.ts
export interface Weights {
  revenueMomentum: number;
  cashCollection: number;
  profitability: number;
  debtAging: number;
  repaymentVelocity: number;
  tenureDepth: number;
}

export interface SignalScores {
  revenueMomentum: number;
  cashCollection: number;
  profitability: number;
  debtAging: number;
  repaymentVelocity: number;
  tenureDepth: number;
}

function assertScore01to100(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${name} score must be an integer in [0,100]`);
  }
}

export function aggregateOverallScore(scores: SignalScores, weights: Weights): number {
  const weightSum =
    weights.revenueMomentum + weights.cashCollection + weights.profitability +
    weights.debtAging + weights.repaymentVelocity + weights.tenureDepth;
  if (weightSum !== 100) {
    throw new Error(`weights must sum to 100 (got ${weightSum})`);
  }
  assertScore01to100(scores.revenueMomentum,    'revenueMomentum');
  assertScore01to100(scores.cashCollection,     'cashCollection');
  assertScore01to100(scores.profitability,      'profitability');
  assertScore01to100(scores.debtAging,          'debtAging');
  assertScore01to100(scores.repaymentVelocity,  'repaymentVelocity');
  assertScore01to100(scores.tenureDepth,        'tenureDepth');

  const weighted =
    scores.revenueMomentum    * weights.revenueMomentum +
    scores.cashCollection     * weights.cashCollection +
    scores.profitability      * weights.profitability +
    scores.debtAging          * weights.debtAging +
    scores.repaymentVelocity  * weights.repaymentVelocity +
    scores.tenureDepth        * weights.tenureDepth;
  return Math.round(weighted / 100);
}

export function mapScoreToMultiplier(score: number): number {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error(`score must be an integer in [0,100] (got ${score})`);
  }
  if (score < 20)  return 0.0;
  if (score < 40)  return 0.5;
  if (score < 60)  return 1.0;
  if (score < 80)  return 2.0;
  if (score < 90)  return 3.0;
  return 4.0;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/scoring.ts src/server/services/creditEngine/scoring.test.ts
git commit -m "feat(credit-engine): add weighted score aggregation and multiplier mapping"
```

### Task 1.19: Base amount calculation (TDD)

**Files:**
- Create: `src/server/services/creditEngine/base.ts`
- Create: `src/server/services/creditEngine/base.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/base.test.ts
import { describe, it, expect } from 'vitest';
import { computeBaseAmount, median } from './base';

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });
  it('returns middle element of odd-length sorted array', () => {
    expect(median([10, 50, 30])).toBe(30);
  });
  it('returns mean of two middle elements of even-length array', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe('computeBaseAmount', () => {
  it('returns 0 when no signals at all', () => {
    expect(computeBaseAmount({ avgMonthlyRevenue6mo: 0, invoiceTotals12mo: [] })).toBe(0);
  });
  it('takes max(avgMonthlyRevenue, medianInvoice)', () => {
    expect(computeBaseAmount({ avgMonthlyRevenue6mo: 10000, invoiceTotals12mo: [5000, 7000, 9000] })).toBe(10000);
    expect(computeBaseAmount({ avgMonthlyRevenue6mo: 5000, invoiceTotals12mo: [15000, 20000] })).toBe(17500);
  });
  it('throws on negative monthly revenue', () => {
    expect(() => computeBaseAmount({ avgMonthlyRevenue6mo: -1, invoiceTotals12mo: [] })).toThrow();
  });
  it('throws on any negative invoice total', () => {
    expect(() => computeBaseAmount({ avgMonthlyRevenue6mo: 0, invoiceTotals12mo: [100, -1] })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/base.ts
export interface BaseInput {
  avgMonthlyRevenue6mo: number;
  invoiceTotals12mo: number[];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeBaseAmount(input: BaseInput): number {
  if (input.avgMonthlyRevenue6mo < 0) {
    throw new Error('avgMonthlyRevenue6mo must be non-negative');
  }
  for (const v of input.invoiceTotals12mo) {
    if (v < 0) throw new Error('invoice totals must be non-negative');
  }
  return Math.max(input.avgMonthlyRevenue6mo, median(input.invoiceTotals12mo));
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/base.ts src/server/services/creditEngine/base.test.ts
git commit -m "feat(credit-engine): add base amount calculation with tests"
```

### Task 1.20: Effective stance resolution (TDD)

**Files:**
- Create: `src/server/services/creditEngine/effectiveStance.ts`
- Create: `src/server/services/creditEngine/effectiveStance.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/effectiveStance.test.ts
import { describe, it, expect } from 'vitest';
import { resolveEffectiveStanceId } from './effectiveStance';

describe('resolveEffectiveStanceId', () => {
  it('returns the customer override when set', () => {
    expect(resolveEffectiveStanceId({
      customerStanceId: 'cust-stance-uuid',
      globalDefaultStanceId: 'global-uuid'
    })).toBe('cust-stance-uuid');
  });
  it('returns the global default when customer override is null', () => {
    expect(resolveEffectiveStanceId({
      customerStanceId: null,
      globalDefaultStanceId: 'global-uuid'
    })).toBe('global-uuid');
  });
  it('throws if global default is missing', () => {
    expect(() => resolveEffectiveStanceId({
      customerStanceId: null,
      globalDefaultStanceId: null as unknown as string
    })).toThrow('globalDefaultStanceId is required');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/effectiveStance.ts
export interface ResolveStanceInput {
  customerStanceId: string | null;
  globalDefaultStanceId: string;
}

export function resolveEffectiveStanceId(input: ResolveStanceInput): string {
  if (!input.globalDefaultStanceId) {
    throw new Error('globalDefaultStanceId is required');
  }
  return input.customerStanceId ?? input.globalDefaultStanceId;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/effectiveStance.ts src/server/services/creditEngine/effectiveStance.test.ts
git commit -m "feat(credit-engine): add effective stance resolution with tests"
```

### Task 1.21: Cold-start gate (TDD)

**Files:**
- Create: `src/server/services/creditEngine/coldStart.ts`
- Create: `src/server/services/creditEngine/coldStart.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/services/creditEngine/coldStart.test.ts
import { describe, it, expect } from 'vitest';
import { isColdStartReady } from './coldStart';

const defaults = { minPostedInvoices: 3, minTenureDays: 60 };

describe('isColdStartReady', () => {
  it('returns false when no invoices and no tenure', () => {
    expect(isColdStartReady({
      postedInvoiceCount: 0, tenureDays: 0, computedBase: 0, config: defaults
    })).toBe(false);
  });
  it('returns false when tenure met but no invoices', () => {
    expect(isColdStartReady({
      postedInvoiceCount: 0, tenureDays: 60, computedBase: 0, config: defaults
    })).toBe(false);
  });
  it('returns false when invoices met but tenure not yet', () => {
    expect(isColdStartReady({
      postedInvoiceCount: 5, tenureDays: 30, computedBase: 5000, config: defaults
    })).toBe(false);
  });
  it('returns false when invoices and tenure met but base is 0', () => {
    expect(isColdStartReady({
      postedInvoiceCount: 5, tenureDays: 90, computedBase: 0, config: defaults
    })).toBe(false);
  });
  it('returns true when all three conditions met', () => {
    expect(isColdStartReady({
      postedInvoiceCount: 3, tenureDays: 60, computedBase: 1, config: defaults
    })).toBe(true);
    expect(isColdStartReady({
      postedInvoiceCount: 100, tenureDays: 1000, computedBase: 50000, config: defaults
    })).toBe(true);
  });
  it('honors config overrides', () => {
    const config = { minPostedInvoices: 5, minTenureDays: 90 };
    expect(isColdStartReady({
      postedInvoiceCount: 4, tenureDays: 100, computedBase: 1000, config
    })).toBe(false);
    expect(isColdStartReady({
      postedInvoiceCount: 5, tenureDays: 90, computedBase: 1000, config
    })).toBe(true);
  });
  it('throws on negative inputs', () => {
    expect(() => isColdStartReady({
      postedInvoiceCount: -1, tenureDays: 0, computedBase: 0, config: defaults
    })).toThrow();
    expect(() => isColdStartReady({
      postedInvoiceCount: 0, tenureDays: -1, computedBase: 0, config: defaults
    })).toThrow();
    expect(() => isColdStartReady({
      postedInvoiceCount: 0, tenureDays: 0, computedBase: -1, config: defaults
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// src/server/services/creditEngine/coldStart.ts
export interface ColdStartConfig {
  minPostedInvoices: number;
  minTenureDays: number;
}

export interface ColdStartInput {
  postedInvoiceCount: number;
  tenureDays: number;
  computedBase: number;
  config: ColdStartConfig;
}

export function isColdStartReady(input: ColdStartInput): boolean {
  if (input.postedInvoiceCount < 0 || input.tenureDays < 0 || input.computedBase < 0) {
    throw new Error('cold-start inputs must be non-negative');
  }
  return (
    input.postedInvoiceCount >= input.config.minPostedInvoices &&
    input.tenureDays >= input.config.minTenureDays &&
    input.computedBase > 0
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/creditEngine/coldStart.ts src/server/services/creditEngine/coldStart.test.ts
git commit -m "feat(credit-engine): add cold-start gate with tests"
```

### Task 1.22: Create the index.ts barrel

**Files:**
- Create: `src/server/services/creditEngine/index.ts`

- [ ] **Step 1: Create the barrel file re-exporting the public surface**

```typescript
// src/server/services/creditEngine/index.ts
export { bucketConfidence, type ConfidenceLevel } from './confidence';
export {
  invoiceGuardClause,
  salesOrderGuardClause,
  salesOrderLineGuardClause,
  paymentGuardClause
} from './inputGuards';
export { scoreRevenueMomentum, type SignalResult } from './signals/revenueMomentum';
export { scoreCashCollection } from './signals/cashCollection';
export { scoreProfitability } from './signals/profitability';
export { scoreDebtAging } from './signals/debtAging';
export { scoreRepaymentVelocity } from './signals/repaymentVelocity';
export { scoreTenureDepth } from './signals/tenureDepth';
export {
  aggregateOverallScore,
  mapScoreToMultiplier,
  type Weights,
  type SignalScores
} from './scoring';
export { computeBaseAmount, median } from './base';
export { resolveEffectiveStanceId } from './effectiveStance';
export { isColdStartReady, type ColdStartConfig } from './coldStart';
```

**Note:** if the Phase 0 decision was DEFER for profitability, remove the `scoreProfitability` line (and delete `signals/profitability.ts` + its test).

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run full test:coverage to verify 100% on engine module**

```bash
pnpm test:coverage
```

Expected: all signal/scoring/base/etc tests pass; coverage 100% for `src/server/services/creditEngine/**` (excluding `index.ts` which only re-exports and is excluded in `vitest.config.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/server/services/creditEngine/index.ts
git commit -m "feat(credit-engine): add module barrel export"
```

### Task 1.23: End-to-end smoke check — seed + signals on a real customer

**Files:**
- Create: `src/server/services/creditEngine/smoke.test.ts`

This is an integration-style test that touches the real DB to confirm seeds work and a worked-example scoring produces the spec's expected value.

- [ ] **Step 1: Write the smoke test**

```typescript
// src/server/services/creditEngine/smoke.test.ts
// Integration smoke: confirms seed loaded the Balanced stance and that the
// hand-calculated worked example from spec §2.3 reproduces with the engine
// helpers wired together end-to-end (math only, no signal SQL yet).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../db';
import {
  aggregateOverallScore,
  mapScoreToMultiplier,
  computeBaseAmount,
  type Weights,
  type SignalScores
} from './index';

describe('engine smoke', () => {
  beforeAll(async () => {
    const { rows } = await pool.query<{ name: string }>(
      `SELECT name FROM credit_engine_stances WHERE name = 'Balanced'`
    );
    if (rows.length === 0) {
      throw new Error('Balanced stance not seeded — run pnpm db:seed first');
    }
  });

  afterAll(async () => {
    // Don't pool.end() — vitest reuses the connection across files
  });

  it('reproduces the §2.3 Harbor Logistics worked example', () => {
    // Per spec §2.3 (using Balanced stance weights 20/20/15/15/20/10):
    const weights: Weights = {
      revenueMomentum: 20, cashCollection: 20, profitability: 15,
      debtAging: 15, repaymentVelocity: 20, tenureDepth: 10
    };
    const scores: SignalScores = {
      revenueMomentum: 60, cashCollection: 92, profitability: 44,
      debtAging: 84, repaymentVelocity: 68, tenureDepth: 71
    };
    const overall = aggregateOverallScore(scores, weights);
    expect(overall).toBe(70);

    const multiplier = mapScoreToMultiplier(overall);
    expect(multiplier).toBe(2.0);

    const base = computeBaseAmount({ avgMonthlyRevenue6mo: 15000, invoiceTotals12mo: [12000, 15000, 18000] });
    expect(base).toBe(15000);

    expect(base * multiplier).toBe(30000);
  });
});
```

- [ ] **Step 2: Run the smoke test**

```bash
pnpm test src/server/services/creditEngine/smoke.test.ts -- --run
```

Expected: PASS. If the `beforeAll` fails ("Balanced stance not seeded"), run `pnpm db:seed` and re-run the test.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/creditEngine/smoke.test.ts
git commit -m "test(credit-engine): add smoke test reproducing §2.3 worked example"
```

### Task 1.24: Final coverage check and Phase 1 close-out

- [ ] **Step 1: Run full coverage**

```bash
pnpm test:coverage
```

Expected: 100% on lines/branches/functions/statements across `src/server/services/creditEngine/**` (excluding `index.ts` per vitest.config.ts).

- [ ] **Step 2: Run full type check and build**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Run the existing test suite to confirm no regressions**

```bash
pnpm test -- --run
```

Expected: all previously-passing tests still pass.

- [ ] **Step 4: Verify migration cleanly applies on a fresh DB**

If you have a way to reset the dev DB (e.g., a sandbox or test database):

```bash
pnpm db:migrate
pnpm db:seed
```

Expected: both commands exit 0, schema reflects all new tables and columns, seeded stances are present.

- [ ] **Step 5: No commit needed.** Phase 1 is complete.

---

## Self-Review Notes

**Spec coverage check:**
- §1.0 input guards — Task 1.11 ✓
- §1.1 revenue momentum — Task 1.12 ✓
- §1.2 cash collection — Task 1.13 ✓
- §1.3 profitability (conditional) — Task 1.14 ✓
- §1.4 debt aging (net-terms aware) — Task 1.15 ✓ (scoring layer; SQL net-terms-from-due-date is a Phase 2 compose-layer task)
- §1.5 repayment velocity — Task 1.16 ✓
- §1.6 tenure depth — Task 1.17 ✓
- §1.7 confidence — Task 1.10 ✓
- §2 math model — Task 1.18 (aggregate + multiplier), Task 1.19 (base) ✓
- §3 stance system — Task 1.9 (seed) + Task 1.20 (effective resolution) ✓
- §4 data model — Tasks 1.1–1.4 (migration), 1.6–1.8 (drizzle) ✓
- §9 cold-start — Task 1.21 ✓
- Phase 0 audit gate — Tasks 0.1–0.5 ✓

**Out of scope (planned separately):**
- §5 worker / queue processing — Phase 2 plan
- §6 event hooks — Phase 3 plan
- §7 nightly safety net — Phase 9 plan
- §8 override commands — Phase 4 plan
- §10 shadow mode bulk-revert — Phase 5 plan
- §11 UI — Phase 6 plan
- §13 commands beyond seeds — Phase 4 plan
- §15 observability — Phase 7 plan
- §16 operator doc — Phase 8 plan

The signal SQL compose layer (each signal's `compute*(tx, customerId, now)` function that runs the actual query, applies input guards, and returns `{score, confidence, dataCount}` by calling the pure-math scorer) is intentionally deferred to Phase 2. That layer needs the worker context to exist first — and Phase 2 will TDD each compose function against seeded fixture customers in an integration-test style.

**Type consistency:** all signal-result types use the `SignalResult` interface exported from `revenueMomentum.ts`. Re-exported via `index.ts`. All signal-input types are file-local. `Weights`, `SignalScores`, `ColdStartConfig`, `ConfidenceLevel` are the only shared types beyond `SignalResult`.

**No placeholders:** every step has actual code or actual commands. The only `<ACTUAL>` placeholders are in Task 0.5's findings document — those must be filled with the real audit numbers before commit.
