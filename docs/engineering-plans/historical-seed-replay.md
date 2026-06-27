# One-Time Historical Seed via Real-Command Replay

_Status: DRAFT — pending design-review + plan-review gates_
_Branch: `claude/database-alpha-beta-setup-u01whk`_
_Owner: Evan_

## Goal

Produce a **one-time** seed that fills the entire system with ~12 months of
historical data that is indistinguishable from data entered through real
operations. Every invoice, ledger entry, inventory movement, credit
assessment, and `command_journal` row must be **derived by the production
code path**, not hand-inserted — so the data is internally consistent and
honors every invariant the real system enforces.

This artifact is restored into the persistent **alpha** and **beta**
databases (see the alpha/beta environment plan) as their starting dataset.

## Why the existing seed is not enough

`src/server/realisticSeed.ts` direct-inserts rows and **fabricates**
`command_journal` entries with a `commandRow()` helper. The journal, ledgers,
invoices, and credit scores are asserted, not derived — any invariant the
real command path enforces can be silently violated, and the data only looks
real on the surface.

## Chosen approach (decisions)

| Decision | Choice |
|---|---|
| Clock control | **B — inject a `clock` module** (`clock.now()`), sweep write-path `new Date()` → `clock.now()`, fitness-test guard |
| History span | **12 months** at current `DEMO_*` scale |
| Artifact | **`pg_dump` → `seed-historical.sql`**, restored into alpha/beta |

Rationale: handler/write-path time is sourced from JS `new Date()` (348 sites
across `src/server` + `src/domains`); DB-side `default now()` is only ~9
columns. So a Node-level injectable clock covers essentially the entire
timestamp surface without faking Postgres. It is deterministic, repeatable,
and doubles as the permanent fix for the seed date-drift problem. (Rejected
alternative: `libfaketime` — no code change, but new dependency, must fake
Postgres too, and is fiddly to step instant-by-instant.)

## Architecture findings that constrain the plan

- Real entry point: `executeCommand(input, user, io)` →
  `runCommand(tx, name, payload, user, commandId, reason)` → registered
  `defineCommand` handler (154 commands) → post-commit side effects.
- **Credit scoring is queued, not synchronous**:
  `enqueueCustomerRecompute()` writes `credit_recompute_queue`, drained by
  `cron:credit-engine-nightly`. Balance reconciliation is also a cron.
  → The replay must run these drains after the command stream.
- **Receipts** (invoice / payment / vendor-payout / PO-finalization PDFs) are
  created **post-commit** off `pool` and stamp time too → covered by the
  clock since they run in the same process.
- A few payment commands already accept an optional `date`/`createdAt`
  payload field; most commands do not, which is why a global clock is needed.

## Work breakdown

### Phase 0 — Safety & determinism rails
- Hard guard: refuse to run unless `ALLOW_DEMO_SEED=true` **and** the target
  DB host is on an allowlist (never production).
- Seed all randomness from `DEMO_RANDOM_SEED`.
- Anchor the timeline to a **fixed end-date parameter** (not `Date.now()`) so
  the generator is reproducible byte-for-byte.

### Phase 1 — Clock module
- `src/server/services/clock.ts`: `now()` (defaults to `new Date()`),
  `set(instant)`, `reset()`. Single source of "current instant".
- Mechanical sweep: write-path `new Date()` → `clock.now()` in
  `src/server/services/**`, `src/domains/**/commands*`, receipt creators.
  (Queries / sockets / logging `new Date()` are out of scope.)
- Fitness test: forbid raw `new Date()` in the write path (allowlist the
  clock module).

### Phase 2 — Timeline generator (`scripts/seed-historical/timeline.ts`)
Pure function: config (12-month span, `DEMO_*` scale) → ordered list of
operations with intended instants, in realistic order and cadence:
vendors/contacts → POs (draft → approve → receive / batch intake) → sales
orders (draft → price → confirm → post → fulfill → invoice) → payments
(log → allocate) → disputes / client credits / barter settlements → vendor
bills/payments → **period closeouts/locks emitted only after that month's
activity** (so backdated writes into a locked period are correctly rejected,
exactly as production) → backups.

### Phase 3 — Replay driver (`scripts/seed-historical/run.ts`)
For each op: `clock.set(op.instant)` then call the **real**
`executeCommand(op.input, op.actor, ioStub)` with a no-op Socket.IO stub and
the correct RBAC actor. Idempotency keys make it re-runnable.

### Phase 4 — Async derivations
Advance clock to end-of-history; run the **credit recompute drain** and
**balance reconciliation** (same code as the nightly crons) so assessments
and balances populate from the historical data.

### Phase 5 — Artifact capture
`pg_dump` → versioned `seed-historical.sql`. Document restore into alpha/beta.
Storage-side artifacts (JSONL journal, receipt PDFs) are regenerable;
decide per-need whether to bundle.

### Phase 6 — Adversarial validation
Extend `audit:realistic-demo` (or a new audit) to assert: timestamps spread
across the full span (not clustered at now), balances reconcile, ledger sums
tie to invoices/payments, inventory never negative, credit assessments exist
for active customers, no period-lock violations. These pass **by
construction** if the data is truly real — that is the proof.

## Risks
- **Period-lock ordering** — closeouts must follow their month's activity.
- **Queued derivations** — credit/reconciliation must be drained (Phase 4).
- **Refactor surface** — ~348 write-path `new Date()` sites; mechanical but
  must be guarded by the fitness test to prevent regressions.
- **Prod safety** — heavy replay must never touch production (Phase 0 guard).

## Gate status
Per repo workflow rules this multi-file plan must pass the **design-review
gate** and **plan-review gate** before implementation begins.
