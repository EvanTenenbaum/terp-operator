# Credit Engine — Prompt for the Next Agent

**Date created:** 2026-05-19
**Use this when:** invoking a fresh Claude (or other) agent to continue the Customer Credit Limits feature
**Pair with:** `docs/credit-engine-handoff-2026-05-19.md` (full status + conventions)
**PR being continued:** <https://github.com/EvanTenenbaum/terp-operator/pull/50>

---

## How to use this

Copy the block between the `===` lines below and paste it as the first message to the new agent. The agent will then read the handoff doc and pick up where the previous agent stopped.

The agent must work in the worktree at `/Users/evan/spec-erp-docker/Local Computer work etc/terp-credit-engine-worktree` on branch `feature/credit-engine-phase-0-1-v2`. Do not let it work in the main checkout — there's a concurrent photography agent there.

---

## The Prompt

=== COPY FROM HERE ===

You are taking over a Customer Credit Limits System backend that's complete through the tRPC layer. Your job is the React UI (Phase 6b-e) plus observability (Phase 7), nightly cron (Phase 9), polish (Phase 10), and finally live browser QA — then ship the existing draft PR.

START HERE — read this file end to end before touching anything:
  /Users/evan/spec-erp-docker/Local Computer work etc/terp-credit-engine-worktree/docs/credit-engine-handoff-2026-05-19.md

It contains: full status, file locations, codebase conventions discovered the hard way (worktree isolation, migration numbering, `created_at` not `issued_at`, dispute filter broadening, role enforcement patterns, vitest fileParallelism=false, etc.), open spec decisions, and your recommended first task with setup steps.

Critical context that overrides anything else you might read:

1. WORKTREE ISOLATION. Work ONLY in `/Users/evan/spec-erp-docker/Local Computer work etc/terp-credit-engine-worktree` on branch `feature/credit-engine-phase-0-1-v2`. The main checkout (`../terp-agro`) has a concurrent photography-Phase-0 agent committing to it; touching anything there will corrupt both branches. To push from the worktree, use `AGENT_INTEGRATOR=1 git push`.

2. The DRAFT PR is open at https://github.com/EvanTenenbaum/terp-operator/pull/50. It already documents everything that shipped. Keep adding commits to `feature/credit-engine-phase-0-1-v2`; when you finish a major chunk, update the PR description with new sections. Don't open a new PR.

3. BACKEND IS DONE — Phases 0-5, 6a (tRPC routes), and 8 (operator docs) are committed and tested with 100% engine coverage (431 tests passing). DO NOT re-implement any backend logic. If you need a new tRPC route or a tweak to a command, ADD it; don't refactor what's there. Read the operator docs at `docs/credit-engine.md` to understand what already works.

4. RECOMMENDED FIRST TASK: Phase 6b (Customer Profile Credit Panel). It's the smallest UI piece and unblocks visual-language sign-off from the user. After it lands, PAUSE and present it to the user (screenshot via Playwright) before building 6c/6d/6e. The Phase 6 UI components are best done with iterative design feedback, not autonomous one-shot.

5. CODEBASE CONVENTIONS (see handoff doc for the full list, but key ones):
   - TypeScript strict, no `any`
   - vitest with `fileParallelism: false` (DB-integration tests share Postgres — DON'T REVERT)
   - 100% coverage threshold on `src/server/services/creditEngine/**` (the engine module)
   - No `--no-verify` ever
   - tRPC role gates: `requireRole(['owner'])` pattern from `src/server/routers/credit.ts`
   - Test pattern: `*.test.ts` colocated with source
   - TDD for pure math; integration tests acceptable for DB-bound code
   - Frequent small commits, never amend

6. THE SPEC IS LOCKED. Design spec v4 at `docs/superpowers/specs/2026-05-18-customer-credit-limits-system-design.md` passed 3 rounds of review gates (PM/Architect/Designer/Security/CTO). Don't redesign. If you find a real issue, document it in a changelog and proceed with the spec as written.

7. THE PHASE 0+1 IMPLEMENTATION PLAN at `docs/superpowers/plans/2026-05-18-credit-engine-phase-0-1.md` was for backend only and has been executed. For Phase 6+ you'll need to draft a new plan. Follow the same skill pattern: superpowers:writing-plans → plan review gate (3 reviewers: Feasibility, Completeness, Scope & Alignment, all PASS required) → execution. UI plans should specifically address: which existing TERP components/routes to extend, how tRPC queries integrate via @tanstack/react-query, ag-grid usage patterns, and shared form/modal patterns.

8. OPEN SPEC DECISIONS (need user signoff before relevant code goes live):
   a. Shadow-mode KPI thresholds (75% / ±30%) — confirm before bulkRevertCustomersToEngine is invoked in production
   b. Operator-behavior KPIs in §18 — numerical targets to set once measurement data accumulates

When you start: run the setup verification commands in the handoff doc to confirm the database state, engine coverage, and typecheck are all clean. If any check fails, STOP and report what's broken before doing anything else.

After Phase 6b ships and the user has signed off on the visual language, continue through Phases 6c, 6d, 6e, 7, 9, 10, then run live browser QA via Playwright against the dev server. Document QA findings in `docs/credit-engine-qa-<date>.md`. Fix any bugs found. When everything passes, mark the PR ready for review (remove draft status) and ensure the PR description reflects the final state.

The user has authorized autonomous continuation through all remaining phases + browser QA + PR-ready handoff. Pause only for: (a) genuine blockers, (b) decisions the open-spec list says need user signoff, (c) after Phase 6b is built — for visual-language sign-off before continuing the UI work.

=== COPY UNTIL HERE ===
