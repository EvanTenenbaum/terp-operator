# Credit Engine — Handoff for Next Agent

**Date:** 2026-05-19
**From:** Backend-implementation agent (PR #50)
**To:** Next agent (likely UI + remaining-phase implementation)
**Branch state:** `feature/credit-engine-phase-0-1-v2` pushed to origin; draft PR open at <https://github.com/EvanTenenbaum/terp-operator/pull/50>

---

## TL;DR

You're picking up a Customer Credit Limits feature that has its **entire backend complete** (engine math, queue/worker, event hooks, 12 commands, divergence report + shadow KPI, tRPC routes, operator docs). All committed and pushed. **What remains: React UI, observability, nightly cron, polish, live browser QA.**

The code is in a **git worktree at `../terp-credit-engine-worktree/`** (relative to `/Users/evan/spec-erp-docker/Local Computer work etc/terp-agro`). The worktree exists because the main checkout has a concurrent photography-Phase-0 agent committing to it; **do not work in main checkout** until that agent is finished or you'll get cross-contamination.

---

## Where Things Live

| Artifact | Path |
|---|---|
| Design spec v4 (3 review gates passed) | `docs/superpowers/specs/2026-05-18-customer-credit-limits-system-design.md` |
| Implementation plan v2 (plan review gate passed) | `docs/superpowers/plans/2026-05-18-credit-engine-phase-0-1.md` |
| Data audit findings (Phase 0) | `docs/credit-engine-data-audit-2026-05-18.md` |
| Operator docs (Phase 8) | `docs/credit-engine.md` |
| Migration | `migrations/0033_credit_engine.sql` |
| Drizzle schema | `src/server/schema.ts` (8 new tables + extended `customers`) |
| Seed | `src/server/seed.ts` (5 stances + config row with shadow_mode=true) |
| Engine code | `src/server/services/creditEngine/` |
| Event hooks | `src/server/services/commandBus.ts` (search for `enqueueCustomerRecompute`) |
| Commands | `src/server/services/commandBus.ts` (12 new handlers near the bottom) |
| Command catalog | `src/shared/commandCatalog.ts` (12 new entries) |
| tRPC routes | `src/server/routers/credit.ts` + mounted in `src/server/routers/index.ts` |
| Audit script | `scripts/credit-engine-data-audit.ts` |

---

## What's Done (in this PR)

- **Phase 0**: Data audit + go/no-go decisions (all signals SHIP; broaden dispute filter to `('open', 'investigating')`)
- **Phase 1**: Schema, drizzle, seeds, 6 pure-math signal calculators, scoring, base, stance resolution, cold-start gate
- **Phase 2**: `enqueueCustomerRecompute`, signal SQL compose layer, `processOneRecompute` orchestrator, `reapStaleProcessingRows`, `recomputeAllCustomers`, `reconcileLimitDrift`
- **Phase 3**: Event hooks wired into `commandBus.ts` at: `confirmSalesOrder`, `postSalesOrder`, `logPayment`, `allocatePayment`, `postTransactionLedgerRow` (customer branch), `createCorrectionJournalEntry` (dispute path), `reverseCommandById` (all customer-affecting reversal branches). Reversal correctness integration test passes.
- **Phase 4**: 12 commands implemented and tested:
  - Override: `setCustomerCreditLimit`, `revertCustomerCreditToEngine`, `snoozeCustomerCreditReminder`
  - Engine management: `setCustomerEngineMax`, `setCustomerStance`, `disableCreditEngineForCustomer`, `enableCreditEngineForCustomer`
  - Stance lifecycle: `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance`
  - Config: `setCreditEngineConfig`, `bulkRevertCustomersToEngine`
- **Phase 5**: `divergenceReport` query + shadow-mode KPI
- **Phase 6a**: 5 tRPC query endpoints with server-side role gates (`credit.customerCreditAssessments`, `credit.creditEngineStances`, `credit.divergenceReport`, `credit.creditReviewQueue`, `credit.creditRecomputeQueueHealth`)
- **Phase 8**: Operator-facing `docs/credit-engine.md`

**Quality state:**
- 431 tests passing
- 100% engine coverage (355/355 statements, 238/238 branches, 43/43 functions, 327/327 lines on `src/server/services/creditEngine/**`)
- TypeScript strict, no `any`
- No `--no-verify` anywhere
- All commits squashable per-task; commit log is the source of truth

**Known pre-existing failures (NOT in scope):** `src/tests/performance.test.ts` has two timing-sensitive assertions that fail on this machine (`< 10ms`, `< 100ms`). They fail on `main` too. Don't try to fix; ignore in CI considerations.

---

## What's Outstanding

| Phase | Description | Estimated effort |
|---|---|---|
| **6b — Customer profile credit panel** | React component for the credit section on customer profile: plain-English signal chips (Critical/Weak/OK/Strong/Excellent), engine-vs-manual delta with risk framing, edit-limit confirmation modal, cold-start state (○ pending glyphs, not ✗), assessment history toggle | ~3-4 components |
| **6c — Sales workspace inline indicator** | Tiny non-blocking inline notice when current order + balance would exceed engine recommendation but is still within manual limit | 1 component |
| **6d — Credit Review Queue page** | New `/credit-review` route, role-gated (manager+) in nav with count badge. Three filter tabs: stale manual, engine-disabled-frozen, near-snooze-cap. Sortable rows, action buttons. Real-time badge refresh via `credit-review-changed` event + 60s polling. | 1 page + 3 tab components |
| **6e — Settings → Credit Engine page** | Owner-only. Global config form (stance default, cold-start thresholds, snooze cap, shadow_mode toggle). Stance grid (5 seeded + custom). Stance create/edit modal with weight sliders that must sum to 100, auto-balance toggle, normalize button, preview pane showing 12 sampled customers' projected limit deltas. | 1 page + slider component + preview pane |
| **6f — Shadow-mode orientation banner** | One-time banner persisting for the full shadow_mode duration; dismissible per-user via `user_dismissed_banners` table (already created); auto-dismisses when shadow_mode flips false. Link to `docs/credit-engine.md`. | 1 component |
| **7 — Observability + CI gate** | Metrics exports per spec §15 (queue depth, oldest pending age, processing duration histogram, failures, stale-processing count, near-threshold counter). Structured SIEM log events. Alerts. **CI gate enforcing negative-role tests for every role-gated procedure** (Phase 7 launch gate per spec §16) | medium |
| **9 — Nightly safety net** | `pnpm credit-engine:nightly` script + in-app polling loop with `pg_advisory_lock(CREDIT_WORKER_LOCK_KEY)` + reaper integration + dirty-row optimization | medium |
| **10 — Polish** | `bulkRevertCustomersToEngine` KPI gating refinements, paginated assessment-history view, manual operator-trigger from profile, validation error UX polish | small |
| **Live browser QA** | Drive dev server with Playwright; exercise profile credit panel, Credit Review Queue, stance settings sliders, sales workspace, cold-start state; capture screenshots; file & fix bugs | gated on Phase 6 |

---

## Critical Codebase Conventions Discovered

These were learned the hard way during Phase 0-5 implementation. Honor them:

1. **Worktree isolation is non-negotiable.** Another agent in main checkout will cause branch-switch race conditions and stray commits on your branch. Always work in `../terp-credit-engine-worktree/`. To push: `cd "../terp-credit-engine-worktree" && AGENT_INTEGRATOR=1 git push`. (The pre-push guard requires `AGENT_INTEGRATOR=1` for intentional integrator pushes from worktrees.)

2. **Migration numbers**: latest in repo is now `0033`. The next migration is `0034`. Latest commit was `6c9d983`.

3. **Column naming**: spec says `issued_at`/`posted_at`; actual schema uses `created_at` on `invoices` and `sales_orders`. Use `created_at` in all signal SQL. (The spec has a known stale-terminology issue; don't auto-correct it — just use schema reality in code.)

4. **`invoices.due_date` is `NOT NULL`** per schema. Don't write null-rate audits on it; measure terms distribution instead (`due_date - created_at`).

5. **Dispute filter**: use `status IN ('open', 'investigating')`, not just `'open'`. The spec said `'open'` but the realistic seed has both active statuses. This is reflected in code already; mention it in any future spec patches.

6. **Role values**: TERP's `Role` enum is `'owner' | 'manager' | 'operator' | 'viewer'`. The spec referenced 'sales' role in some places; that doesn't exist. Use `'manager'` where spec says 'sales'.

7. **`setCustomerCreditLimit` owner-elevation**: catalog sets min role to `'manager'`. Function elevates to require `'owner'` when `amount > 1.5 * latestAssessment.recommendedLimit`. This is a function-level check on top of the catalog floor.

8. **Test pattern**: `*.test.ts` colocated with source. Integration tests share a single Postgres database; **`vitest.config.ts` has `fileParallelism: false`** for this reason — don't revert it.

9. **Coverage gate**: `.coverage-thresholds.json` says 100%. Enforcement: `pnpm test:coverage` (NOT `pytest --cov`; that was a template artifact, already fixed). The coverage include glob is `src/server/services/creditEngine/**/*.ts` with `index.ts` and `*.test.ts` excluded. Keep engine at 100%.

10. **TDD discipline**: every pure-math function in `creditEngine/` was test-first. Maintain this for new code in that directory. Integration tests (router tests, worker tests) are acceptable as integration-style.

11. **`drizzle-orm/pg-core`**: `bigserial` import is required for `credit_recompute_queue.id` (drizzle `bigserial('id', { mode: 'bigint' }).primaryKey()`). Already in `schema.ts`.

12. **`ON CONFLICT` against partial unique indexes**: Postgres allows targeting them by re-stating the WHERE predicate, e.g.:
    ```sql
    INSERT INTO credit_recompute_queue (customer_id, ...) VALUES (...)
    ON CONFLICT (customer_id) WHERE status = 'pending' DO NOTHING
    ```
    Works on the Postgres version TERP uses.

13. **Idempotency on assessment insert**: pattern is `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id` then fallback `SELECT id WHERE idempotency_key = $1`. Both paths must yield an id so `customers.last_assessment_id` is never NULL on the engine path.

14. **commandBus.ts patterns**: each command handler takes `(tx, payload, ...args, commandId)` and returns `CommandResult`. Returns shape: `{ ok: true, toast: '...', affectedIds: [...] }`. Use existing helpers: `stringValue(payload.field)`, `numberValue(...)`, `booleanValue(...)`, etc. The runCommand switch is around line 286.

15. **tRPC role gates**: use the `requireRole(['owner'])` pattern from `src/server/routers/credit.ts` (already in code). Server-side `ctx.user.role` check, throws `TRPCError({ code: 'FORBIDDEN' })`. Negative-role tests required per Security N3.

16. **Shadow mode default**: seeded `shadow_mode = true`. Engine writes assessments but does NOT write to `customers.credit_limit` until shadow_mode is flipped to false (via `setCreditEngineConfig` or `bulkRevertCustomersToEngine`).

---

## Open Spec Decisions (still need user signoff before relevant phase)

These are documented in `docs/superpowers/specs/2026-05-18-customer-credit-limits-system-design.md` §17:

1. **Shadow-mode KPI thresholds (75% / ±30%)** — decision required before Phase 5 enforcement / before `bulkRevertCustomersToEngine` is invoked in production. Defaults are coded; user should confirm or override.
2. **Behavioral KPIs** (operator-action targets in §18) — measurement infra exists; concrete numerical targets to be set when measurement data accumulates.

---

## Recovery Context

Mid-Phase-0, a concurrent photography agent corrupted the original `feature/credit-engine-phase-0-1` branch in main checkout with mixed commits. Recovery created the v2 worktree branch on a clean slate.

The polluted original branch may still exist in main checkout. Cleanup (when convenient):
```bash
# Run from the main checkout, NOT from worktree:
git branch -D feature/credit-engine-phase-0-1
```

Do NOT delete the worktree itself unless you intend to abandon this work.

---

## How to Continue

### Setup (fresh agent)

```bash
# From the main checkout, switch to the worktree:
cd "/Users/evan/spec-erp-docker/Local Computer work etc/terp-credit-engine-worktree"

# Verify you're on the right branch:
git branch --show-current   # should print: feature/credit-engine-phase-0-1-v2

# Make sure deps are installed (worktree has its own node_modules):
pnpm install

# Verify migration applied + seed in place:
pnpm db:migrate              # should be a no-op
docker exec terp-agro-postgres psql -U terp_agro -d terp_agro -c "SELECT name FROM credit_engine_stances ORDER BY name;"
# Expected: 5 rows (Balanced, Conservative, Loyalty-Weighted, Prioritize Cash, Prioritize Revenue)

# Verify everything still passes:
pnpm typecheck                # should be clean
pnpm test src/server/services/creditEngine/ -- --run    # should pass all engine tests
pnpm test:coverage 2>&1 | tail -8    # should report 100% on engine
```

If any of these fail, STOP and investigate before continuing.

### Recommended first task: Phase 6b — Customer Profile Credit Panel

This is the smallest UI piece and unblocks user feedback on the visual language. Steps:

1. Read `docs/credit-engine.md` for the operator's mental model
2. Read spec §11.1 in `docs/superpowers/specs/2026-05-18-customer-credit-limits-system-design.md` for the ASCII UI mockup
3. Look at existing customer profile components (search `src/client/` for files with "CustomerProfile" or "customer-profile")
4. Look at how existing components consume tRPC queries (search `src/client/` for `trpc.queries`)
5. Plan the credit panel as a new React component plugging into the existing customer profile structure
6. Wire it to `trpc.credit.customerCreditAssessments` (paginated) and embed delta-from-engine framing
7. TDD where possible (component tests with Testing Library); end-to-end live test via dev server

### After Phase 6b: ask the user before continuing

Phase 6 UI components are best done with iterative design feedback. After Phase 6b lands, present it to the user (or take a screenshot via Playwright) and get sign-off on the visual language before building 6c/6d/6e. Don't try to build all the UI in one autonomous shot — the back-and-forth on details (chip colors, tooltip copy, slider behavior) is genuinely valuable.

---

## Files modified by this PR (summary)

```
57 changed files, +11,989 / -13 lines
```

Major buckets:
- `migrations/0033_credit_engine.sql` (new, 154 lines)
- `src/server/schema.ts` (+ ~100 lines, drizzle definitions for 8 new tables + customers extension)
- `src/server/seed.ts` (+ ~50 lines for credit engine seed)
- `src/server/services/commandBus.ts` (+ ~1,200 lines for 12 commands + event hook wiring)
- `src/server/services/creditEngine/` (new directory, 23 files: 6 signals + scoring + base + stance + cold-start + worker + enqueue + reaper + orchestrator + reconciliation + divergenceReport + tests + smoke + index)
- `src/server/routers/credit.ts` + `credit.test.ts` (new, ~1,100 lines)
- `src/shared/commandCatalog.ts` (+ ~40 lines for 12 new entries)
- `docs/credit-engine.md` (new, 349 lines, operator-facing)
- `docs/credit-engine-data-audit-2026-05-18.md` (new, Phase 0 findings)
- `docs/superpowers/specs/2026-05-18-customer-credit-limits-system-design.md` (committed; v4 with 4 changelogs)
- `docs/superpowers/plans/2026-05-18-credit-engine-phase-0-1.md` (committed; v2 with patches)

---

## Contact

Original implementation work was by an autonomous Claude session. Decisions are documented in:
- This handoff (`docs/credit-engine-handoff-2026-05-19.md`)
- The PR description at <https://github.com/EvanTenenbaum/terp-operator/pull/50>
- The spec changelogs at the bottom of the design spec
- The plan v2 changelog at the bottom of the implementation plan

Questions about *why* a decision was made: check the spec changelog or commit messages. Questions about *what* the code does: read the operator docs (`docs/credit-engine.md`) first, then the code.
