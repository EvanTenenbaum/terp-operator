# Historical Seed via Real-Command Replay

_Status: DRAFT v3 — cleared design-review gate; plan-review gate returned 3× CONCERNS (no FAIL), all must-fixes folded in below_
_Branch: `claude/database-alpha-beta-setup-u01whk`_
_Owner: Evan_

## Goal

Fill the system with historical data **derived by the production code path**
(real commands, not hand-inserted rows), so it is internally consistent, honors
every invariant, and looks like a real stretch of operations. The artifact is
restored into the persistent **alpha**/**beta** databases as their starting data.

## Why the existing seed is not enough

`src/server/realisticSeed.ts` direct-inserts rows and **fabricates**
`command_journal` entries. Ledgers, invoices, and credit scores are asserted,
not derived — any invariant the real path enforces can be silently violated.

## Scope (v1 vs later) — per Scope-reviewer cut/defer guidance

**v1 (ship a playable dataset):** Phase 0 prod guard · Phase 1 faketime harness ·
**Phase 1.5 bootstrap** · Phase 2 timeline (happy-path across families + a small
fixed edge-state set + open-work tail) · Phase 3 replay · single end-of-history
drain · Phase 5 artifact (secrets excluded) · Phase 6 restore tooling · Phase 7
basic validation.

**Deferred to v2:** exhaustive 141-command coverage matrix · monthly drain
checkpoints (credit trend) · re-anchor-to-now step · regenerate-on-migration
tooling. Byte-for-byte determinism is a **non-goal** (surrogate keys vary).

## Decisions (after both gates)

| Decision | Choice |
|---|---|
| Clock control | **`libfaketime`** faking **both** the driver and a **glibc** Postgres to the **same instant per op** |
| Span | a configurable stretch (target ~12 months) with seasonality/ramp + onboarding + churn |
| Artifact | **`pg_dump` → `seed-historical.sql`**, secret data excluded |

## Architecture findings (grounded in code; corrected by the gates)

- Real entry: `executeCommand(input, user, io)` (`commandBus.ts:792`) →
  `runCommand` → registered handler. **141** `defineCommand` registrations
  across 13 `commandDefs` domains (corrected from "154").
- **`io` stub is trivial**: only `io.to('authenticated').emit(…)`
  (`socket-emitter.ts:25`) → `{ to: () => ({ emit() {} }) }`.
- Driving `executeCommand`/drains from a tsx script is a **proven pattern** —
  `scripts/customer-balance-reconciliation-cron.ts:19-24` already imports `pool`
  and calls `reconcileCustomerBalances(pool, now)`. Drains:
  `recomputeAllCustomers(pool, {source})` (`orchestrator.ts:24`, enqueues+drains)
  and `reconcileCustomerBalances(pool, now)` (`balanceReconciliation.ts:64`).
- **Time is DB-stamped on the write side**: `schema.ts:24` `now()` → `.defaultNow()`
  on **~55** `created_at` columns; sales-post invoice + `clientLedgerEntries`
  pass no `createdAt` (`sales-orders/commands.ts:903-911`). So PG must be faked.
  - **Correction (Feasibility #4):** the credit engine's window math reads
    `created_at` against a **JS-passed `now` arg** to the drains, not DB `now()`.
    So faking PG is required for **write-side `created_at` coherence**, *not* for
    credit-window reads. Narrower justification than v2 stated.
- **Clock-coherence hazard (Feasibility #5):** one insert path mixes
  `created_at` (PG default) with `dueDate: oneWeek()`, `postedAt`/`updatedAt:
  new Date()`, and `code()`/`Date.now()` (JS). **Both clocks must be faked to the
  same instant per op** or rows show past `created_at` but wall-clock
  `postedAt`/`updatedAt` — a consistency bug Phase 7 must assert against.
- **Period locks** enforced on only ~3 paths (`assertPeriodUnlocked`
  `commandBus.ts:1618,2376,3092`); normal sale/payment/PO into a locked period is
  **not** rejected. Timeline must order closeouts correctly by construction; we
  do not rely on lock-rejection as validation.
- **Surrogate keys nondeterministic** (`gen_random_uuid()`, `randomUUID()`,
  `Math.random()` in `code()` `:717`) → "deterministic business content,
  nondeterministic keys."

## Work breakdown

### Phase 0 — Default-deny prod-safety guard (land first; non-negotiable)
Parse the host from the live pool connection; require a match against an explicit
`SEED_DB_HOST_ALLOWLIST`; **throw on parse failure or empty allowlist even when
`ALLOW_DEMO_SEED=true`**. Test that a prod-looking host is refused regardless of
env. (`seed.ts` `truncate … cascade`s every table — a misfire is catastrophic.)

### Phase 1 — faketime harness (spike-first)
- **Glibc Postgres image** (debian `postgres:16`, **not** alpine/musl —
  Feasibility #1/#2) with libfaketime preloaded; driver also under `LD_PRELOAD`.
- Shared `FAKETIME_TIMESTAMP_FILE` (mount) with `FAKETIME_NO_CACHE`; atomic
  per-op rewrite. **Coherence contract:** advance JS + PG to the same instant
  before each op.
- **Probe gate:** before building anything else, prove a libfaketime-preloaded
  Postgres stamps a backdated `created_at` on a probe row. If the probe fails,
  fall back to a `created_at`-override hook / session GUC. **Do not proceed on
  faith** (this is greenfield — no existing faketime usage in the repo).

### Phase 1.5 — Dependency-order bootstrap (NEW — Completeness #2-5, required)
Deterministic pre-replay step for entities with **no command path** (seed-only):
- **Users/actors** — no `createUser` command exists; replay needs actors for
  `ctx.user`/RBAC. Seed role-correct users.
- **`tag_catalog`** — no command; `applyTags` only consumes it.
- **`credit_engine_stances` + `credit_engine_config`** — referenced by id before
  any credit command can run.
- Confirm ordering for **payment processors** (`createPaymentProcessor`),
  **system settings**, **transaction types** as needed.
Without this, Phase 3 cannot start.

### Phase 2 — Timeline generator (`scripts/seed-historical/timeline.ts`)
Pure function: config → ordered, role-correct ops with intended instants.
- **v1 coverage:** happy path across **named families** — intake, PO, sales,
  payments, vendor bills/payments, contacts/appointments, media, inventory
  transfers, barter, matchmaking, **connector requests, referee/referral,
  customer needs, item/SKU creation, warehouse alerts, period
  lock/archive/adjustments** (families Completeness #6 flagged as missing) —
  plus a fixed edge-state set (cancel, refund/unallocate, voidVendorPayment,
  dispute→resolve/reject, `reverseCommandById`, below-floor exception) and an
  **end-of-window open-work tail** (draft POs, confirmed-unposted orders, open
  picks, scheduled future payments, pending overrides, open disputes/matches).
- **Shape model:** seasonality/ramp, onboarding over time, some churned accounts,
  defined cancel/dispute/refund rates. Manager/owner actions rare.
- **v2:** the full 141-command in/out-with-reason matrix.

### Phase 3 — Replay driver (`scripts/seed-historical/run.ts`)
Per op: advance the faketime file to `op.instant`, call the **real**
`executeCommand(op.input, op.actor, ioStub)`. Idempotency keys → re-runnable.

### Phase 4 — Derivations
v1: single end-of-history `recomputeAllCustomers` + `reconcileCustomerBalances`.
v2: drain at each simulated month-end so credit assessments form a real trend.

### Phase 5 — Artifact capture (secrets excluded — Security)
`pg_dump` excluding secret data: `--exclude-table-data=session`,
`--exclude-table-data=photo_upload_tokens`; **deterministically re-hash
`users.password_hash` to a documented demo password for every seeded user**
(Completeness #7). **Resolve side-effects explicitly** (Completeness #8): JSONL
journal (`appendJsonlJournal` writes ~365 dated files — append-only, not read on
restore → safe to drop), receipt PDFs, and `storage/media` (bundle or write
placeholders so photo tabs / lot-media timeline events render).

### Phase 6 — Restore tooling + docs
`pnpm seed:historical` (generate) and `pnpm seed:historical:restore`
(drop/recreate + `psql < seed-historical.sql` + unpack media), with concrete
commands, env vars (`ALLOW_DEMO_SEED`, `SEED_DB_HOST_ALLOWLIST`,
`DEMO_RANDOM_SEED`, end-date), and the **demo login credentials** surfaced for
alpha/beta operators. New scripts live under `scripts/seed-historical/` and are
tooling, not `src/` domain code, so they stay outside `.coverage-thresholds.json`
(Scope must-fix). No switch edits / new commands → ADR-0002 respected.

### Phase 7 — Validation (`audit:realistic-demo` extension)
Consistency: timestamps spread across the span (not clustered at now);
`created_at`/`postedAt`/`updatedAt` coherent per op; balances reconcile; ledgers
tie to invoices/payments; inventory never negative; credit assessments exist; no
journal row over-privileged. **Believability (new, Completeness note):** assert
distributional targets — volume curve, customer concentration, and
cancel/dispute/refund/role-mix rates matching the Phase 2 shape model — not just
the single edge-rate check.

## Dependency (Scope + CTO must-fix)
The alpha/beta persistent-environment plan does **not yet exist as a doc** (only
the branch). **Decouple v1**: the seed produces `seed-historical.sql`
independently of where it's restored. Do not start Phase 1 blocked on a phantom
doc; link a real alpha/beta plan with a definition-of-ready before wiring restore.

## Gate record
- **Design gate (v1):** 1 BLOCK (Architect — DB `created_at` premise) + 4
  CONCERNS (PM, Security, Designer, CTO) → addressed in v2.
- **Plan gate (v2):** CONCERNS ×3 — Feasibility (alpine/musl faketime, clock
  coherence, narrowed justification), Completeness (141 not 154, missing
  bootstrap, login, side-effects), Scope (trim wrapper, decouple dependency) →
  folded into this v3.
