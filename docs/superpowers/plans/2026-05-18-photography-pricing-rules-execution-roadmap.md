# Execution Roadmap: Photography Module + Pricing Rules v4

> **Status:** Approved with fixes — QA reviewed 2026-05-18 and findings applied (see below)
> **Created:** 2026-05-18
> **Scope:** Complete end-to-end execution from current state (Phase 0 in PR #47) to both features shipped in production
> **Estimated calendar time:** 5-7 weeks elapsed, ~185-235 person-hours of focused work (revised upward from initial 140-180 after QA calibration)
> **Soak (Phase F):** Defined as 7 days of active monitoring (disk %, upload success rate, orphan count, view consistency) with daily review by the operator or designated monitoring contact, NOT passive waiting. Rollback triggers fire automatically; ship is "durable" when 7 consecutive days pass with no trigger.

---

## Executive summary

Current state (2026-05-18):
- Photography Phase 0 = PR #47 open, awaiting merge (CI green, no reviews yet)
- Photography Phase 1-3 = planned, not started
- Pricing Rules v4 (#39) = blocked, deferred per prioritization decision
- Pricing Rules schema unblock (#42) = open, independent
- **PR #46 (TER-1070 backend/frontend parity, 10 surfaces)** = open on `ter-1070-parity-frontend`, must be audited for file overlap with Photography Phase D
- **`feature/credit-engine-phase-0-1-v2`** = active parallel branch with 10+ commits; migration `0033_credit_engine.sql` is staged there, COLLIDING with Photography's planned 0033

This roadmap sequences eight phases (A-H) with explicit gates, identifies parallel-work seams (with hazards), and specifies which work is subagent-driven vs human-paced. **Migration numbering for Phase B is unresolved until Phase A reconciles with credit-engine.**

---

## Phase ledger

| # | Phase | Source plan | Dependency | Calendar | Work hours |
|---|---|---|---|---|---|
| **A** | Phase 0 merge + cross-branch reconciliation | PR #47 | — | 1-3 days (review wait + reconciliation) | 3-5 hr (PR feedback + audits) |
| **B** | Photography Phase 1: DB + Upload route + Serving route + tests | `2026-05-17-photography-module.md` Tasks 1-12 | A merged | 1-1.5 weeks | ~40-60 hr (work + dispatch overhead + rebase) |
| **C** | Pricing Rules schema unblock | Issue #42 | B merged (serialized; previously claimed parallel — withdrawn) | 2-3 days | ~8 hr |
| **D** | Photography Phase 2: Commands + Frontend + E2E | `2026-05-17-photography-module.md` Tasks 13-18 + new 18.5/18.6 | B done; PR #46 resolved | 1-1.5 weeks | ~40-50 hr |
| **E** | Photography Phase 3: Monitoring + Polish + Retention (deferred items split out) | `2026-05-17-photography-module.md` Phase 3 section, partial | D done | 0.5-1 week | ~20 hr |
| **F** | Photography ships + soak | — | E done | 7+ days (soak only) | ~4 hr (monitoring) |
| **G** | Pricing Rules v4 spec recovery + brainstorming | NEW brainstorming session | C done; F done | 3-5 days | ~10 hr (with subagent prep) |
| **H** | Pricing Rules v4 implementation | NEW plan written in G | G done | 2 weeks | ~60-80 hr |

Total: **5-7 calendar weeks, ~185-235 person-hours** (calibrated upward from original 140-180 after QA review found Phase B underestimated and added new Phase D/E tasks).

---

## Phase A: Phase 0 PR merge + cross-branch reconciliation

**Goal:** Get PR #47 reviewed and merged. Resolve migration-number collision and confirm no other in-flight branches conflict with Phase B-D.

**Tasks:**
1. **Migration number reconciliation (NEW, blocks Phase B):**
   - Run `git log --all --diff-filter=A --pretty=format:'%h %s' -- 'migrations/0033*.sql' 'migrations/0034*.sql' 'migrations/0035*.sql'` to inventory contested numbers
   - Confirmed as of 2026-05-18: `feature/credit-engine-phase-0-1-v2` has commit `325a040` adding `migrations/0033_credit_engine.sql`
   - Decide merge order with operator (Evan): if credit-engine lands first, photography moves to **0034-0036**; if photography lands first, credit-engine rebases
   - Document the decision in this roadmap and propagate to the Phase 1 plan's header
2. **Open-PR audit (NEW, blocks Phase D file scope):** **COMPLETED 2026-05-18.** Findings:
   - **PR #46 (TER-1070, 5,361 additions)** modifies `src/server/routers/queries.ts` (adds `refereeCredits` query — direct overlap with Phase D Task 15a/15b), `src/client/views/OperationsViews.tsx`, `.coverage-thresholds.json`, `package.json`, `vitest.config.ts`, plus 11 new client components/tests
   - **Coverage config:** PR #46 has ALREADY migrated `.coverage-thresholds.json` from pytest to vitest (per PR body D1(b) decision) and installed `@vitest/coverage-v8` + `@testing-library/react` + `jsdom`
   - **Recommended sequencing:** PR #46 merges FIRST, then PR #47, then Phase B begins. Rationale: PR #46 establishes the vitest+coverage infrastructure that Phase B/D tests need; #46 also fixes the coverage config problem this roadmap originally listed as Task 3.
   - **Alternative:** If PR #46 is in review hold, PR #47 can merge first and PR #46 rebases. The queries.ts conflict is mechanical (different stub locations) and resolvable in <30 min by the second-merging PR's author.
3. **Coverage config fix:** **RESOLVED** by PR #46 — see Task 2 above. This task is no longer required if #46 lands before Phase B; otherwise becomes a Phase B prerequisite.
4. PR #47 review monitoring via `gh pr view 47 --comments`
5. Address review comments using subagent dispatch per comment cluster (`metaswarm:handling-pr-comments` skill)
6. Re-request review if substantive changes
7. Merge once approved

**Subagent usage:** YES — one subagent per review comment cluster (avoids context pollution). Tasks 1-3 are direct operator-collaboration, not subagent-driven.

**Gate to next phase:**
- Migration numbering reconciled and documented
- PR #46 file overlap mapped; coordination plan with #46 author exists OR Phase D scope adjusted
- Coverage config either fixed or explicitly downgraded
- PR #47 merged to `main`
- Pre-existing `performance.test.ts` timing flake noted but does NOT block

**Risk:**
- Reviewer may request architecture changes (e.g. "don't use Express for upload, find a tRPC way"). Mitigation: the prioritization spec and rework plan already justify the Express-for-binary decision; cite them in PR discussion if challenged.
- Operator may resolve migration-collision in favor of credit-engine; photography Phase 1 needs to absorb the renumber before Phase B begins. Time cost: ~30 min to rewrite migration filenames in the Phase 1 source plan.

---

## Phase B: Photography Phase 1 (Foundation)

**Goal:** Migrations 0033-0035 live, upload route accepts authenticated multipart, serving route streams files with auth + range requests, full unit + integration tests passing.

**Source plan tasks (18 tasks total, Phase 1 covers 1-12):**

| Task | What | Subagent strategy |
|---|---|---|
| 1 | Environment setup (.env, storage dir, .gitignore) | Direct (5 min, no review needed) |
| 2 | Migration 0033: `batch_media` table | Subagent + spec review (schema is contractually significant) |
| 3 | Migration 0034: retention policies + cleanup log | Subagent + spec review |
| 4 | Migration 0035: `batch_media_summary` view | Subagent + spec review |
| 5-6 | mediaValidation service (TDD: tests then impl) | Subagent + spec + code review (security-critical) |
| 7-8 | mediaStorage service (TDD) | Subagent + spec + code review (already scaffolded in Phase 0) |
| 9-10 | Upload route (TDD) | Subagent + spec + code review (auth-critical, multipart-critical) |
| 11-12 | Serving route (TDD) | Subagent + spec + code review (auth-critical, streaming-critical) |

**Phase B gate to Phase D:**
- All 12 Phase 1 tasks committed to a `feature/photography-phase-1` branch off main (after Phase 0 merges)
- 0033-0035 applied cleanly to fresh DB + seeded DB
- Upload route: integration test exercises auth, multipart, file validation, disk-space pre-flight, success path, all error paths
- Serving route: integration test exercises auth, streaming, range requests, missing-file 404
- Security tests pass: path traversal, file spoofing, unauthenticated access, IDOR (operator reading another operator's batch's media)
- `pnpm test` green except known performance flake
- `pnpm typecheck` clean
- PR opened and approved

**Subagent budget:** ~11 implementer subagents + ~22 review subagents = ~33 subagent invocations.

**Risk:**
- Multer + file streaming + auth integration may surface bugs not caught by per-task tests. Mitigation: dedicated integration test in Task 9-10 that exercises the full flow end-to-end before declaring Phase 1 done.
- Migration apply on seeded DB may surface FK or index conflicts. Mitigation: Task 2-4 each include a "apply migration to fresh DB AND seeded DB" verification step.

---

## Phase C: Pricing Rules schema unblock

**Goal:** Issue #42's acceptance criteria met — but FIRST resolve whether the unblock target table is `items` (catalog) or `batches` (inventory instance).

**Critical pre-Phase-C decision:** Issue #42 says add `subcategory`/`brand` to **`items`** table. But verification shows **`batches.subcategory`** (line 200 of `src/server/schema.ts`) and **`batches.brandId`** (line 192, FK to brands) already exist. The right denormalization target depends on whether pricing rules evaluate at the catalog SKU level (items) or the inventory instance level (batches), which is unresolved.

**Phase C must NOT begin until the operator confirms target table.**

**Sequencing change from the original draft:** Phase C is now **serialized AFTER Phase B**, not parallel. Both phases write `src/server/schema.ts` (Phase B appends `batch_media` Drizzle definition; Phase C appends or modifies `items`/`batches` definition). Parallel branches would produce merge conflicts even when the textual sections are distant, because Drizzle Kit migration generation reads the whole file. The earlier-claimed B↔C parallelism is **withdrawn**.

**Tasks (synthesized from issue #42, pending target-table decision):**

1. **Pre-task: Operator decision on target table** (`items` vs `batches`). Update Issue #42 with the answer.
2. Decision: NULL-allowed in pricing rule conditions vs. backfill-first?
   - Surface to operator (Evan) for input
   - Default recommendation: NULL-allowed (cleaner ship path; rules just won't match dimension-less items)
3. Migration 003X_add_<table>_subcategory_brand.sql — ALTER ADD COLUMN subcategory text (if items target) OR refactor pricing-rule-evaluator to read from batches (if batches target — no schema change needed, just spec update)
4. Update `src/server/schema.ts` Drizzle definitions
5. Backfill strategy:
   - If small dataset (<1000 rows), inline backfill in same migration with hardcoded mapping
   - If large, separate backfill script + operator review of mapping
6. Update Issue #42 with completion comment + close
7. Update Issue #39 with "schema work done; spec recovery pending" comment

**Subagent usage:** Light — one implementer for the migration, one reviewer. Operator decisions in Tasks 1-2 are not subagent-able.

**Phase C gate:** Target-table decision documented in Issue #42 closure, migration applied, table has both columns (or batches-driven path confirmed), existing tests still pass, issue #42 closed.

---

## Phase D: Photography Phase 2 (Core Features)

**Goal:** Backend commands operational, frontend MediaView and MediaUploadMobile working, E2E tests green.

**Source plan tasks (13-18):**

| Task | What | Subagent strategy |
|---|---|---|
| 13-14 | Media commands (uploadBatchMedia, setBatchMediaRole, publishBatchMedia, deleteBatchMedia) | Subagent + spec + code review (transactional + row locks) |
| 15a | Photography grid query — fill the Phase 0 stub at `queries.ts:1003` (gridSql) | Subagent + spec review |
| 15b | Photography grid query — fill the Phase 0 stub at `queries.ts:1045` (deterministicHeaders) | Subagent + spec review |
| 16a | MediaView React component | Subagent + spec + code review |
| 16b | Replace placeholder label `'Photography'` in `IdentityRibbon.tsx:26` with the UX-confirmed label | Direct edit |
| 17a | Sidebar nav addition | Direct edit |
| 17b | `accessPolicy.ts` `defaultOperatorViews` inclusion — **operator decision required**: photography ON by default for all operators, or per-user enablement? | Direct edit after decision |
| 18 | MediaUploadMobile (camera, upload, progress) | Subagent + spec + code review (mobile UX is fiddly) |
| 18.5 | **ENABLE_PHOTOGRAPHY feature flag wiring** — read env var; routes return 503 when false (currently the flag is named in docs but NOT created anywhere) | Subagent + spec review |
| 18.6 | **Backfill existing `batches.photoUrl` URLs into `batch_media`** as `role='primary_photo', status='published'` so MediaView shows current photos from day 1 — without this, Phase F ship causes a user-facing regression where existing batch photos disappear | Subagent + spec + code review |

**Plus E2E:**

| 19 | Playwright E2E spec covering photographer mobile flow + office curation flow | Subagent + manual verification on real iPhone |

**Phase D gate to Phase E:**
- All commands have transaction tests + concurrent-modification tests (e.g., two users setting primary simultaneously must conflict cleanly)
- MediaView renders the photography grid with at least 10 seeded batches having media
- MediaUploadMobile completes upload in <30s on real iPhone (the user-pain metric from the spec)
- E2E spec passes locally
- PR opened and approved

**Subagent budget:** ~6 implementer subagents + ~12 review subagents + 1 E2E coordinator = ~19 subagent invocations.

**Risk:**
- Real-device iPhone testing is not subagent-able. Mitigation: gate requires manual operator confirmation.
- Frontend state management for upload progress is error-prone (cancellation, retries, offline queue). Mitigation: Phase 2 ships only happy-path; offline queue is Phase 3.

---

## Phase E: Photography Phase 3 (Polish + Monitoring + Retention)

**Goal:** Production-readiness — monitoring dashboards, retention policy execution, UX polish. Explicitly call out what's IN scope vs DEFERRED so scope-cutting is intentional, not silent.

**In scope (Phase E):**

1. **Monitoring:**
   - Disk-space alert wired into existing health endpoint (>80% triggers warning)
   - Orphaned file detection cron (daily) with logging
   - Upload success-rate tracking (>95% target, log misses)
   - View consistency audit cron
2. **UX polish (essential):**
   - Offline queue + retry for mobile uploads
   - Drag-and-drop desktop upload
   - Bulk publish + bulk delete operations
3. **Retention policies:**
   - Cron that applies policies (with `--dry-run` flag default)
   - Manual approval gate before destructive ops
   - Soft-delete to `.trash/` with 30-day purge

**DEFERRED to post-ship backlog (these are in `2026-05-17-photography-upgrade-design.md` but intentionally cut from this roadmap to bound ship effort):**

| Spec item | Why deferred | Tracked where |
|---|---|---|
| `replaceBatchMedia` command (spec line 587) | Workaround: delete + re-upload. Operator can ship without. | NEW post-ship issue at Phase F end |
| MediaDrawer component (spec line 606) | Workaround: MediaView is full-screen. Drawer is nice-to-have. | NEW post-ship issue |
| Bulk CSV import (spec line 678) | Not on photographer's MVP critical path | NEW post-ship issue |
| `batches.photoUrl` 30-day dual-read window (spec lines 627-652) | Replaced by Phase D Task 18.6 backfill. Dual-read is no longer needed if the backfill happens at flag-flip time. | Implicit in 18.6 |
| `DROP COLUMN photo_url` (spec Phase 4) | Deferred until 90 days after Phase F to ensure no consumers regress | NEW post-ship issue, calendared |
| Media history tracking (spec line 684) | Compliance feature, not user-facing. Phase 4 in source plan. | NEW post-ship issue |
| WebP thumbnails | Performance optimization, not blocker | NEW post-ship issue |
| Load testing | Should happen pre-ship if disk capacity is uncertain; deferred unless Phase F soak surfaces issues | Conditional |

**Subagent strategy:** One subagent per cluster (monitoring, UX polish, retention). Each gets a sub-plan written first then executed via the same per-task implementer + review loop.

**Phase E gate to Phase F (ship):**
- Monitoring runs without errors for 24 hr in staging
- Retention dry-run identifies the right files in seeded data
- All Phase 1-3 PRs merged
- Feature flag `ENABLE_PHOTOGRAPHY=true` set as default (the flag is now actually created — see Phase D Task 18.5)
- `batches.photoUrl` backfill validated on staging (see Phase D Task 18.6)
- Post-ship backlog issues created for deferred items

---

## Phase F: Ship + soak

**Goal:** Enable photography for all users, observe for 7 days, declare success.

**Activities (no subagent work):**
- Day 1: Deploy + monitor disk usage every hour
- Days 2-7: Daily review of metrics (upload success rate, orphans, view consistency)
- Day 7: If all green, declare ship complete and proceed to Phase G

**Rollback triggers (from existing spec):**
- Upload success rate <90% for 24 hr
- Disk exhaustion incident
- Critical security vulnerability discovered
- User complaints >10/day

**Phase F gate to Phase G:**
- 7 days production soak passed
- No rollback triggers fired
- `/self-reflect` ran post-ship and learnings captured
- Operator (Evan) confirms ship is durable

---

## Phase G: Pricing Rules v4 spec recovery + brainstorming

**Goal:** Re-derive the lost detailed spec for Pricing Rules v4 (the `/tmp/` source is gone), produce a fresh design doc, get operator approval.

**Tasks:**
1. Read Issue #39 body for partial spec content
2. Interview operator on missing details:
   - How are conditions combined (AND vs OR within a rule, AND between rules)?
   - What's the precedence when an item matches multiple rules?
   - Below-floor behavior: hard block vs soft warning vs manager override threshold?
   - Default rule mechanics: opt-in per customer vs always-applies-unless-overridden?
   - Audit trail: do we snapshot the rule at confirmSalesOrder time? (Issue #39 says yes, but verify with operator.)
3. Brainstorm via `superpowers:brainstorming` skill
4. Write spec to `docs/superpowers/specs/<date>-pricing-rules-v4-design.md`
5. Self-review + operator approval gate
6. Invoke `superpowers:writing-plans` for the implementation plan
7. Update Issue #39 with link to recovered spec + plan; close Issue #42 if not already

**Subagent usage:** Brainstorming is operator-interactive (not subagent-able). writing-plans CAN use a subagent for grounding.

**Phase G gate to Phase H:** Spec written, plan written, operator approves both.

---

## Phase H: Pricing Rules v4 implementation

**Goal:** Ship the feature per the plan written in Phase G.

**Likely task structure (subject to G's plan):**
- Migrations for `pricing_rules`, `pricing_rule_conditions`, `customer_pricing_rules` tables (~3 tasks)
- Snapshot columns on `salesOrderLines` (~1 task)
- Backend commands: create/update/delete rule, assign to customer, repricing logic (~5 tasks)
- Modify `priceSalesOrder` and `confirmSalesOrder` with `allowBelowFloor` + manager check (~2 tasks)
- Frontend: `pricingRules` Admin view, condition editor, customer drawer Pricing tab, sales line columns + below-floor warning (~5 tasks)
- E2E (~1 task)

**Estimated: 17 tasks, similar subagent strategy to Photography Phase 2.**

**Phase H gate to ship:** All tasks done, PR merged, operator confirms behavior on staging.

---

## Parallel-work seams

Three points where calendar time can compress if a second agent or person works in parallel (the original draft listed four; **B ↔ C is withdrawn** because both phases write `src/server/schema.ts` — see Phase C section):

1. **A ↔ pre-work** (PR #47 review + Phase A's reconciliation/audit tasks) — Tasks 1-3 of Phase A can be done in parallel with waiting for PR #47 review.
2. **B-end ↔ D-start** (Phase 1 PR review window + Phase 2 frontend prep) — While Phase 1 PR is in review, the Phase 2 frontend (MediaView, MediaUploadMobile) can be drafted against the Phase 1 contract.
3. **F-soak ↔ G-brainstorm** (Photography soak + Pricing Rules brainstorming) — Soak is mostly monitoring; G can run during the soak window so H is ready immediately.

**Sensitivity to seams (calendar impact):**

| Seams exploited | Calendar |
|---|---|
| All 3 | 4-5 weeks |
| 2 of 3 (drop F↔G) | 5-6 weeks |
| 1 of 3 (drop B↔D and F↔G) | 6-7 weeks |
| 0 (fully serial) | 6-7 weeks (Phase F soak is the bottleneck regardless) |

The B ↔ C parallelism was withdrawn after QA found the schema.ts overlap hazard. Reinstating it would require a strict rebase protocol that the original draft didn't specify.

---

## Subagent usage strategy

**When to use subagent-driven-development:**
- Any task touching ≥2 files
- Any TDD task (tests + impl + review)
- Any security-sensitive code (auth, file paths, SQL)
- Any task with non-trivial migration

**When to skip subagents (direct edit by me):**
- Trivial doc updates (<10 lines)
- Single-line enum additions where cascading impact is obvious
- Single-file refactors with no API change
- PR feedback comments that are <5-line edits

**Review depth ladder:**
- Trivial: direct verification by reading the commit
- Small (1 file, mostly mechanical): combined spec + quality review
- Standard (TDD, 2-3 files): full per-task implementer + spec + code quality
- Critical (security, auth, migration, money): full per-task + final cross-cutting review

**Parallelization within subagent dispatch:**
- Independent tasks (e.g., migrations 0033/0034/0035 schema-only) can dispatch as separate concurrent subagents
- Sequential dependency tasks (test → impl → review) must serialize

---

## Risks and mitigations (roadmap-level)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PR #47 reviewer requests Express → tRPC architecture change | MEDIUM | HIGH | Cite prioritization spec + rework plan; this was a deliberate decision documented before code was written |
| Phase B integration test surfaces auth wiring bugs not caught per-task | MEDIUM | MEDIUM | Dedicated end-to-end integration test in Task 9-10 |
| iPhone testing for Phase D blocks calendar (no device available) | LOW-MEDIUM | HIGH | Use BrowserStack / iOS simulator as fallback; operator schedules dedicated iPhone session at Phase D start |
| Pricing Rules spec recovery (Phase G) reveals scope is much larger than `/tmp/` 649 lines implied | MEDIUM | MEDIUM | Phase G has an explicit operator-approval gate; if scope blows up, re-prioritize |
| Sharp build breaks across pnpm v11 (or any future major) | LOW | HIGH | Allowlist already in place; future-proofing not needed |
| Photography soak (Phase F) fails on disk usage | MEDIUM | HIGH | Disk space monitoring + dry-run retention policy; can flip flag off without code rollback |
| Two parallel sessions corrupt each other's work | MEDIUM | HIGH | Per-phase feature branches; never two parallel writes to same files; B↔C parallelism withdrawn |
| **Credit-engine branch (`feature/credit-engine-phase-0-1-v2`) lands first and claims migration 0033** | **CONFIRMED IN PROGRESS** | MEDIUM | Phase A Task 1 reconciles numbering; Photography moves to 0034-0036 if needed (~30 min rewrite) |
| **PR #46 (TER-1070, 10 surfaces) modifies files in Phase D scope** | UNKNOWN | MEDIUM-HIGH | Phase A Task 2 audits via `gh pr diff 46 --name-only`; if conflict, serialize after #46 |
| **Operator (Evan) unavailable during Phase F 7-day soak** | MEDIUM | HIGH | Pre-Phase-F: confirm Evan's calendar OR define secondary monitoring contact OR extend soak past absence |
| **`batches.photoUrl` photos not visible in MediaView at flag-flip** | HIGH if backfill skipped | HIGH (regression on Day 1) | Phase D Task 18.6 backfills before flag-flip |
| **Coverage gate is theatrical** (`.coverage-thresholds.json` runs pytest in TS repo) | CONFIRMED BROKEN | MEDIUM | Phase A Task 3 fixes or downgrades the gate before any "coverage check" claim is made |
| **`ENABLE_PHOTOGRAPHY` feature flag is referenced but never created** | CONFIRMED MISSING | MEDIUM | Phase D Task 18.5 creates the flag |

---

## Definition of done for the whole roadmap

This roadmap is "done" when:

1. ✅ PR #47 merged to main
2. ✅ Photography Phase 1-3 PRs merged
3. ✅ Photography soaked 7 days, no rollback triggers fired
4. ✅ Pricing Rules v4 spec recovered, plan written
5. ✅ Pricing Rules v4 implementation PR merged + operator confirms staging
6. ✅ Issue #42 closed at Phase C completion
7. ✅ Issue #40 receives Phase 1 / Phase 2 / Phase 3 completion comments at each phase exit; closed after Phase F soak passes
8. ✅ Issue #39 closed after Phase H ships
9. ✅ Post-ship backlog issues created for deferred items (replaceBatchMedia, MediaDrawer, bulk CSV import, photo_url drop, media history tracking, WebP thumbnails)
10. ✅ Operator runbook updated with: disk-full incident procedure, rate-limiter tuning instructions, retention policy execution log location
11. ✅ Photographer onboarded (one screen-share session, ~30 min)
12. ✅ Monitoring metrics pinned in production dashboard
13. ✅ `/self-reflect` ran at each phase boundary and learnings captured
14. ✅ `docs/PHOTOGRAPHY_MODULE.md` updated to "production" status
15. ✅ A retrospective comment posted to operator summarizing what was learned

---

## Open questions to resolve before executing

**Must be answered TODAY (block roadmap finalization):**

1. **PR #47 reviewer assignment:** Who's reviewing? Auto-assigned, or CODEOWNERS, or manual request? PR currently has `reviewDecision: ""` — no reviewer assigned.
2. **Migration number reconciliation:** Does credit-engine land first (Photography becomes 0034-0036) or vice versa? Operator must pick before Phase B can start.
3. **Phase C target table:** `items` (catalog) or `batches` (instance)? Wrong choice forces rework after Pricing Rules v4 spec recovery (Phase G). Operator must pick before Phase C can start — but can be answered in parallel with Phase B.

**Should be answered before Phase D:**

4. **PR #46 file overlap:** Does TER-1070 (10 surfaces) touch Phase D scope (queries.ts, accessPolicy.ts, IdentityRibbon.tsx)?
5. **`accessPolicy.ts defaultOperatorViews` default:** Photography ON by default for all operators on Day 1, or per-user enablement?

**Should be answered before Phase F:**

6. **Operator calendar windows:** Confirm Evan's availability for the 7-day Phase F soak and the ~4 hr Phase G interview. Map them onto a real week. If Evan is unavailable, define secondary monitoring contact.
7. **Soak window timing:** What's the calendar position of Phase F? Does it overlap with any business-critical period (year-end close, etc.) that would make rollback impossible?

**Should be answered before Phase D:**

8. **iPhone for Phase D:** Available for testing? When? BrowserStack/simulator fallback acceptable?

**Should be answered before Phase G:**

9. **Pricing Rules scope recovery:** Is there any external backup of the lost `/tmp/pricing-rules-v4-native-prompt.md`? If yes, recovery is shorter; if no, full re-derivation needed.

**No longer ambiguous (resolved during this roadmap rework):**

- ~~Parallel agent availability for Phase C~~ — Phase C is now serialized after Phase B. No parallel session needed.

---

## What this roadmap deliberately does NOT do

- Does not specify implementation code (those live in the per-phase task plans)
- Does not estimate at sub-task granularity (rolls up to phase totals)
- Does not lock in specific commit messages or branch names beyond the convention `feature/photography-phase-N` / `feature/pricing-rules-v4`
- Does not prescribe specific subagent prompts (those use the templates in `superpowers:subagent-driven-development`)
- Does not pre-resolve the open questions above — they live as decision points
