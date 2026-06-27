# One-Time Historical Seed via Real-Command Replay

_Status: DRAFT v2 — revised after design-review gate (1 BLOCK + 4 CONCERNS), pending plan-review gate_
_Branch: `claude/database-alpha-beta-setup-u01whk`_
_Owner: Evan_

## Goal

Fill the entire system with ~12 months of historical data **derived by the
production code path** (real commands, not hand-inserted rows), so the data is
internally consistent, honors every invariant, and looks like a real year of
operations. The artifact is restored into the persistent **alpha**/**beta**
databases as their starting dataset.

## Why the existing seed is not enough

`src/server/realisticSeed.ts` direct-inserts rows and **fabricates**
`command_journal` entries. The journal, ledgers, invoices, and credit scores
are asserted, not derived — any invariant the real path enforces can be
silently violated.

## Decisions (revised after design review)

| Decision | Choice | Why changed |
|---|---|---|
| Clock control | **A — `libfaketime` around an ephemeral Postgres + the replay driver** | Design-review BLOCK: DB-side `defaultNow()` is ~43 columns and owns `created_at` on financial tables (credit engine reads it). A JS-only `clock` module (old Option B) cannot backdate these. faketime fakes JS **and** Postgres time uniformly — no code sweep, no auth/session/token hazards. |
| History span | **12 months**, with seasonality/ramp + onboarding + churn | flat 12mo reads as fake (PM) |
| Artifact | **`pg_dump` → `seed-historical.sql`**, secrets excluded | regenerable, not truly one-time (CTO) |
| Framing | **Regenerable artifact**, not "one-time" | schema churn (85+ migrations) rots the dump (CTO) |

Rejected: the global `clock` singleton sweep (Option B) — factually broken for
DB-stamped `created_at`; also a global-mutable-state / parallel-safety hazard.
`ctx.now` envelope injection was considered (CTO) but has the same broken-for-DB
problem and a far larger surface than estimated, since most inserts omit
`createdAt` and rely on the DB default. faketime avoids the entire class.

## Architecture findings that constrain the plan (grounded in code)

- Real entry: `executeCommand(input, user, io)` → `runCommand(tx, …)` →
  registered `defineCommand` handler (154 commands) → post-commit side effects.
- **`io` stub is trivial**: only `io.to('authenticated').emit(…)` is called
  (`socket-emitter.ts:25`); `{ to: () => ({ emit() {} }) }` suffices.
- **Time is DB-dominated, not JS-dominated** (corrected): `schema.ts:24`
  `now()` helper → `.defaultNow()` on ~41 columns + `updated()` on 2. Invoice
  and ledger inserts pass **no** `createdAt` (`sales-orders/commands.ts:905,910`)
  → Postgres stamps wall-clock. **This is why faketime (faking PG) is required.**
- **Credit engine reads `created_at`** over 6/12-month windows
  (`worker.ts:456-465,505`, `debtAging.ts:77`). If `created_at` were wall-clock,
  all history looks brand-new and the engine math is wrong. faketime fixes this.
- **Credit scoring + balance reconciliation are queued/cron**, drained via
  `recomputeAllCustomers(pool, {source:'nightly'})` (`orchestrator.ts:24`) and
  `reconcileCustomerBalances(pool, now)` (`balanceReconciliation.ts:64`) — both
  plain pool functions, callable from the driver. **Drain at MONTHLY checkpoints**
  (not once) so `customerCreditAssessments` renders a real trend (Designer).
- **Period locks are only enforced on 3 paths** (`assertPeriodUnlocked`:
  correction journal `:1618`, period adjustments `:2376`, below-floor sales
  exception `:962`). Normal sale/payment/PO into a locked period is **not**
  rejected — so the timeline must order closeouts correctly by construction;
  we do **not** rely on lock-rejection as validation (corrects v1's claim).
- **Surrogate keys are nondeterministic** (`gen_random_uuid()`, `randomUUID()`
  for commandId, `Math.random()` in `code()` `commandBus.ts:717`). Repeatability
  goal is therefore **"deterministic business content, nondeterministic
  surrogate keys,"** not byte-for-byte (Architect #8).

## Work breakdown

### Phase 0 — Safety & determinism rails
- **Default-deny prod guard** (Security): parse the host from the live pool
  connection, require a match against an explicit `SEED_DB_HOST_ALLOWLIST`, and
  **throw on parse failure or empty allowlist even when `ALLOW_DEMO_SEED=true`**.
  Add a test proving a prod-looking host is refused regardless of env. (Recall
  `seed.ts` `truncate … cascade`s every table, so a misfire is catastrophic.)
- Seed app-level RNG from `DEMO_RANDOM_SEED`; anchor the timeline to a **fixed
  end-date parameter**. Document that surrogate keys still vary run-to-run.

### Phase 1 — faketime replay harness
- `scripts/seed-historical/` runs an **ephemeral Postgres** (docker
  `postgres:16-alpine`, as `qa-env-setup.sh` already does) and the Node driver
  **both under `libfaketime`**, driven by a `FAKETIME` timestamp file the driver
  rewrites before each step. No application code changes; no `new Date()` sweep.
- Migrate the ephemeral DB (`pnpm db:migrate`) before replay.

### Phase 2 — Timeline generator (`scripts/seed-historical/timeline.ts`)
Pure function: config → ordered ops with intended instants. **Must include a
command-family coverage matrix** (all 154 commands marked in-scope /
out-of-scope-with-reason / follow-up). Required coverage (PM):
- Happy path across **every** family: intake, PO (draft→approve→receive),
  sales (draft→price→confirm→post→fulfill→invoice), payments (log→allocate),
  vendor bills/payments, contacts/appointments, media (upload→publish),
  inventory transfers, barter, matchmaking, closeout.
- **Edge states** (or it reads as fake): cancelSalesOrder, cancelPurchaseOrder,
  refund/unallocate payment, voidVendorPayment, reverseCommandById,
  dispute→resolve/reject, below-floor exceptions.
- **Credit-decision history**: setCustomerStance, createCreditEngineStance,
  setCustomerCreditLimit, overrides, snoozes — at intervals across the span.
- **Shape model**: seasonality/ramp, customer/vendor onboarding over time, some
  churned/inactive accounts, defined rates of cancelled/disputed/refunded flows.
- **Role-correct actors per op** (Security): never blanket-owner; manager/owner
  actions rare. Phase 6 asserts no journal row used a role above the command min.
- **End-of-window open-work tail**: leave realistic draft POs, confirmed-unposted
  orders, open picks, scheduled future vendor payments, pending overrides, open
  disputes/matches — so the system looks live, not fully settled.

### Phase 3 — Replay driver (`scripts/seed-historical/run.ts`)
For each op: advance the FAKETIME file to `op.instant`, then call the **real**
`executeCommand(op.input, op.actor, ioStub)`. Idempotency keys make it re-runnable.

### Phase 4 — Async derivations at checkpoints
At the end of **each simulated month**, advance the fake clock to month-end and
run `recomputeAllCustomers` + `reconcileCustomerBalances`, so assessments and
balances accumulate as a trend rather than a single end-of-history point.

### Phase 5 — Artifact capture (secrets excluded)
`pg_dump` → `seed-historical.sql`, **excluding secret-bearing data** (Security):
`--exclude-table-data=session`, `--exclude-table-data=photo_upload_tokens`, and
either exclude or deterministically re-hash `users.password_hash` to a known demo
password. **Bundle `storage/media`** (and decide on receipt PDFs/JSONL) alongside
the SQL, or have the replay write placeholder media files, so photo tabs and
lot-media timeline events render (Designer).

### Phase 6 — Restore tooling + docs
- `pnpm seed:historical` (generate) and `pnpm seed:historical:restore`
  (drop/recreate + `psql < seed-historical.sql` + unpack media) with concrete
  commands and required env vars documented for alpha/beta operators (Designer).
- **End-date vs restore-time**: either keep the dump end-date near restore time,
  or add a post-restore "re-anchor recent activity to now()" step, so 30-day
  widgets (aging inventory, matchmaking, finder reasons) aren't empty (Designer).
- **Regenerate-on-migration** trigger/checklist so the dump doesn't silently rot
  against schema changes (CTO).

### Phase 7 — Adversarial validation (`audit:realistic-demo` extension)
Assert: timestamps spread across the full span (not clustered at now); balances
reconcile; ledger sums tie to invoices/payments; inventory never negative; credit
assessments exist **with multi-point history** per active customer; edge-state
flows present at target rates; no journal row over-privileged. These pass **by
construction** if the data is real — that passing is the proof.

## Risks
- **faketime correctness** — must fake BOTH the Postgres process and the driver;
  verify a probe row's `created_at` lands in the past before full replay.
- **Surrogate-key nondeterminism** — artifact content is deterministic, keys are
  not; do not promise byte-for-byte.
- **Media/secret handling in the dump** — Phase 5 must be verified, not assumed.
- **Prod safety** — default-deny host guard (Phase 0) is the single most
  important control; `truncate cascade` makes a misfire catastrophic.
- **Schema drift** — regenerable, not one-time (Phase 6 trigger).

## Dependency
Blocks on the alpha/beta persistent-environment work. **TODO: link the concrete
plan doc** (currently only the branch `claude/database-alpha-beta-setup-u01whk`
exists) with a definition-of-ready before Phase 1 starts (CTO).

## Gate status
Design-review gate (v1): **1 BLOCK (Architect) + 4 CONCERNS** → addressed in
this v2. Next: plan-review gate (Feasibility, Completeness, Scope & Alignment).
