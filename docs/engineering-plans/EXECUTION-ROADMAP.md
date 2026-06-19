# Atomic Execution Roadmap — Foundational Uplift + Contractor Readiness

> **For agentic workers:** Each task is self-contained with agent type, gates, verification, and reviewer. Dispatch agents with task ID + description only — no context loading required.

**Source plan:** `docs/engineering-plans/merged-foundational-uplift.md`  
**Branch:** `docs/mercury-ux-retrofit-master-plan`  
**Total tasks:** 108 atomic

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `[P]` | Parallelizable — no dependency on other in-progress tasks |
| `[S]` | Sequential — must wait for named predecessors |
| `[PW]` | Parallel within wave — gates on wave start, not siblings |

### Agent Types

| Agent | Model | Use |
|-------|-------|-----|
| `explore` | Kimi k2.6 | Read-only discovery, audits, file scanning |
| `terminal` | DeepSeek V4 Pro | Shell commands, git, typecheck, test runs, lint |
| `build` | DeepSeek V4 Pro | Default implementation |
| `fast-build` | DeepSeek V4 Pro | Routine/low-risk edits, docs, config |
| `opus-build` | Claude Opus 4.7 | High-risk implementation (commandBus, tRPC, catch fixes) |
| `claude-architect` | Claude Opus 4.7 | Architecture decisions, tradeoffs |

### Reviewers

| Reviewer | Model | When |
|----------|-------|------|
| `qa-reviewer` | Claude Sonnet 4.6 | T1+ first-pass review |
| `cross-reviewer` | GPT-5.5 | T2+ cross-model verification |
| `aqa-reviewer` | Claude Opus 4.7 | Meaningful done claims, domain extraction PRs |
| `none` | — | T0 trivial edits |

### Risk Tiers

| Tier | Triggers | Review Chain |
|------|----------|-------------|
| T0 | Trivial, reversible, no user impact | none |
| T1 | Single-file change, low-risk domain | qa-reviewer |
| T2 | Multi-file, cross-component, meaningful change | qa-reviewer + cross-reviewer |
| T2-Critical | T2 + money/auth/data-integrity/migration | qa-reviewer + cross-reviewer + aqa-reviewer |

### Verification
All verification uses `fast-runner exec terp-operator -- <command>` per TERP Operator fast-runner policy.

---

## Phase 0: Pre-Extraction Gates (8 tasks)

**Goal:** Validate that extraction is safe before any code moves. All gates must pass before Phase 1 begins.

---

### P0.B — Import-Time Side-Effect Audit
- **Agent:** `explore`
- **Gating:** None [P]
- **Action:** Scan `src/server/services/commandBus.ts` for all import-time side effects: singleton registration, DB connection initialization, registry population, module-level state. Document each in `docs/engineering-plans/function-route-mapping.md` §Side-Effects with: line number, what it does, extraction strategy.
- **Verify:** Every side effect has a documented extraction strategy.
- **Review:** `qa-reviewer`
- **Risk:** T2

### P0.C — Test Baseline
- **Agent:** `terminal`
- **Gating:** None [P, parallel with P0.B]
- **Action:** Run `pnpm test` on fast-runner. Record total tests, passed, failed, skipped counts. Save output to `docs/audits/pre-extraction-test-baseline.txt`.
- **Verify:** Baseline file exists with exact counts. All currently-failing tests identified.
- **Review:** `qa-reviewer`
- **Risk:** T1

### P0.E — Path Alias Configuration
- **Agent:** `fast-build`
- **Gating:** None [P, parallel with P0.B/P0.C]
- **Action:** Add to `tsconfig.json` `compilerOptions.paths`: `@/domains/*`, `@/client/*`, `@/server/*`, `@/shared/*`. Add matching aliases to `vite.config.ts` `resolve.alias`.
- **Verify:** `pnpm typecheck && pnpm build` passes with aliases configured, zero files moved. Fast-runner.
- **Review:** `qa-reviewer`
- **Risk:** T2

### P0.F — Function-to-Domain Mapping
- **Agent:** `explore`
- **Gating:** P0.B complete [S]
- **Action:** Map all 93 commandBus exported functions to their target domain module. Map all query routes in `queries.ts` to target domain routers. Document in `docs/engineering-plans/function-route-mapping.md`. Every function gets a home. pick/ gets its own domain. intake already has structure from P0.D canary.
- **Verify:** 93 functions mapped; 0 orphans. Query routes mapped; cross-entity routes identified for merge router.
- **Review:** `qa-reviewer`
- **Risk:** T2

### P0.G — Route-to-Domain Mapping
- **Agent:** `explore`
- **Gating:** P0.F complete [S]
- **Action:** Complete the query-route side of the mapping document. Identify which routes stay in the merge router (cross-entity). Document tRPC procedure dependencies for each domain router.
- **Verify:** Every query route in `queries.ts` has a target domain router or documented merge-router rationale.
- **Review:** `qa-reviewer`
- **Risk:** T2

### P0.A.SH1 — Extract Shared: Journal
- **Agent:** `opus-build`
- **Gating:** P0.E + P0.F complete [S]
- **Action:** Extract journal append logic from `commandBus.ts` to `src/domains/shared/journal.ts`. Re-export from `commandBus.ts`. This is the first code move — must be clean.
- **Verify:** `pnpm typecheck && pnpm test` zero regression vs P0.C baseline. Fast-runner.
- **Review:** `qa-reviewer` + `cross-reviewer`
- **Risk:** T2-Critical (first extraction, shared dependency)

### P0.A.SH2 — Extract Shared: Socket Emitter
- **Agent:** `opus-build`
- **Gating:** P0.A.SH1 complete [S]
- **Action:** Extract socket emission logic from `commandBus.ts` to `src/domains/shared/socket-emitter.ts`. Re-export from `commandBus.ts`.
- **Verify:** `pnpm typecheck && pnpm test` zero regression. Fast-runner.
- **Review:** `qa-reviewer` + `cross-reviewer`
- **Risk:** T2-Critical

### P0.D — tRPC Typecheck Simulation (Intake Canary)
- **Agent:** `opus-build`
- **Gating:** P0.A.SH1 + P0.A.SH2 + P0.F complete [S]
- **Action:** Extract intake domain as a canary to validate the tRPC type inference chain. Move intake commands to `src/domains/intake/`. Add shim re-exports from `commandBus.ts`. Run `pnpm typecheck` end-to-end including client bundle. Verify tRPC RouterOutputs/RouterInputs preserved. Do NOT migrate consumers yet — just validate types.
- **Verify:** `pnpm typecheck` passes including client bundle. `pnpm build` succeeds. tRPC types preserved through re-export chain.
- **Review:** `qa-reviewer` + `cross-reviewer` + `aqa-reviewer`
- **Risk:** T2-Critical (validates the entire extraction pattern)

---

## Phase 1: Backend Domain Extraction (46 tasks)

**Goal:** Split commandBus.ts and queries.ts into domain modules. **Wave 1 is sequential** (to avoid merge conflicts on shared receipt/credit code). **Wave 2 is fully parallel.**

### Phase 1 Wave 1 — Sequential Core Domains

Each domain follows the 5-step pattern: CHARS → EXTRACT → CATCHES → MIGRATE → PRUNE. Next domain starts only after previous domain's PRUNE completes (to avoid commandBus.ts merge conflicts).

---

#### Purchase Orders (P1.PO.*) — 5 tasks

- **P1.PO.CHARS** [S after P0.D]
  - **Agent:** `build`
  - **Action:** Write characterization tests for every PO function listed in P0.F under target-domain=`purchase-orders`. Tests in `src/domains/purchase-orders/__tests__/__characterization__/`. Run against current monolith to capture behavior.
  - **Verify:** `pnpm vitest run src/domains/purchase-orders` green against current monolith.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P1.PO.EXTRACT** [S after P1.PO.CHARS]
  - **Agent:** `opus-build`
  - **Action:** Move PO functions to `src/domains/purchase-orders/{commands.ts,receipts.ts,index.ts}`. Re-export from `commandBus.ts`.
  - **Verify:** `pnpm typecheck && pnpm build && pnpm test` zero regression vs P0.C baseline. Fast-runner.
  - **Review:** `qa-reviewer` + `cross-reviewer`
  - **Risk:** T2-Critical

- **P1.PO.CATCHES** [S after P1.PO.EXTRACT]
  - **Agent:** `opus-build`
  - **Action:** Fix every silent catch in extracted PO code. Structured logger with command/entity context. Operator-visible notification for receipt/journal failures. Add tests for log + notification paths.
  - **Verify:** New tests pass. `rg "catch \(" src/domains/purchase-orders` shows no `console.warn` or empty catch bodies.
  - **Review:** `qa-reviewer` + `cross-reviewer`
  - **Risk:** T2-Critical (data integrity)

- **P1.PO.MIGRATE** [S after P1.PO.CATCHES]
  - **Agent:** `build`
  - **Action:** Update Mercury routers + tRPC procedures to import from `@/domains/purchase-orders`.
  - **Verify:** `rg "from.*services/commandBus" src/server/routers | rg -i "po|purchase"` returns 0.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P1.PO.PRUNE** [S after P1.PO.MIGRATE]
  - **Agent:** `fast-build`
  - **Action:** Remove extracted PO bodies from `commandBus.ts`. Keep shims only for symbols still consumed elsewhere.
  - **Verify:** `wc -l src/server/services/commandBus.ts` strictly decreased. Full test suite green.
  - **Review:** `qa-reviewer` + `aqa-reviewer` (meaningful done claim — first domain extracted)
  - **Risk:** T2-Critical

#### Payments (P1.PAY.*) — 5 tasks [S after P1.PO.PRUNE]

- **P1.PAY.CHARS** — Agent `build`. Characterization for payments + vendor payouts. **Verify/Review:** as PO.
- **P1.PAY.EXTRACT** — Agent `opus-build`. Target `src/domains/payments/`. **Review:** qa + cross.
- **P1.PAY.CATCHES** — Agent `opus-build`. Fix payment + vendor-payout silent catches. **Review:** qa + cross.
- **P1.PAY.MIGRATE** — Agent `build`. Migrate consumers. **Review:** qa.
- **P1.PAY.PRUNE** — Agent `fast-build`. **Review:** qa + aqa. Risk: T2-Critical (money path).

#### Sales Orders (P1.SAL.*) — 5 tasks [S after P1.PAY.PRUNE]

- **P1.SAL.CHARS** — Agent `build`. Characterization for sales confirmation, exceptions, sales-line commands.
- **P1.SAL.EXTRACT** — Agent `opus-build`. Target `src/domains/sales-orders/`. Largest Mercury surface area.
- **P1.SAL.CATCHES** — Agent `opus-build`. Fix sales-side silent catches; socket emission failure must surface.
- **P1.SAL.MIGRATE** — Agent `build`. Mercury SalesView calls through tRPC — migration in router layer.
- **P1.SAL.PRUNE** — Agent `fast-build`. **Review:** qa + aqa. Risk: T2-Critical.

#### Credit (P1.CRED.*) — 5 tasks [S after P1.SAL.PRUNE]

- **P1.CRED.CHARS** — Agent `build`. Characterization for credit recompute triggers + creditEngine enqueue.
- **P1.CRED.EXTRACT** — Agent `opus-build`. Target `src/domains/credit/`. Note: creditEngine may already live outside commandBus.
- **P1.CRED.CATCHES** — Agent `opus-build`. Credit recompute failures must surface.
- **P1.CRED.MIGRATE** — Agent `build`. Migrate consumers.
- **P1.CRED.PRUNE** — Agent `fast-build`. **Review:** qa + aqa. Risk: T2-Critical (credit affects every customer).

---

### Phase 1 Wave 2 — Parallel Independent Domains

All gated by P1.CRED.PRUNE. Four domains touch disjoint commandBus.ts regions — truly parallel across 4 opus-build agents.

#### Inventory (P1.INV.*) — 5 tasks [PW, gated by P1.CRED.PRUNE]
- CHARS → EXTRACT → CATCHES → MIGRATE → PRUNE. Target `src/domains/inventory/`. Reviews: qa for CHARS/MIGRATE, qa+cross for EXTRACT, qa+aqa for PRUNE.

#### Pick (P1.PICK.*) — 5 tasks [PW, gated by P1.CRED.PRUNE]
- CHARS → EXTRACT → CATCHES → MIGRATE → PRUNE. Target `src/domains/pick/`. Reviews: qa for CHARS/MIGRATE, qa+cross for EXTRACT, qa+aqa for PRUNE.

#### Media (P1.MED.*) — 5 tasks [PW, gated by P1.CRED.PRUNE]
- CHARS → EXTRACT → CATCHES → MIGRATE → PRUNE. Target `src/domains/media/`. Storage-failure paths in CATCHES. Reviews as above.

#### Intake Followup (P1.INT-FUP.*) — 3 tasks [PW, gated by P1.CRED.PRUNE]
- **P1.INT-FUP.CATCHES** — Agent `opus-build`. Apply catch remediation to intake domain (extracted as canary in P0.D). Review: qa + cross.
- **P1.INT-FUP.MIGRATE** — Agent `build`. Migrate remaining consumers. Review: qa.
- **P1.INT-FUP.PRUNE** — Agent `fast-build`. Remove intake shims from commandBus.ts. Review: qa + aqa.

---

### Phase 1 Router Split — 7 tasks

Gated by P1.CRED.PRUNE. Wave 2 domains can extract in parallel with router split (they touch different regions).

- **P1.RT.CIRC** [S after P1.CRED.PRUNE]
  - **Agent:** `opus-build`
  - **Action:** Resolve queries.ts ↔ gridWhere.ts circular dependency. Extract shared types to `src/shared/grid-types.ts`.
  - **Verify:** `pnpm typecheck` passes. `madge --circular src/server/routers/` returns 0 for routers.
  - **Review:** `qa-reviewer` + `cross-reviewer`
  - **Risk:** T2

- **P1.RT.PO** [PW after P1.RT.CIRC, parallel with P1.RT.SAL/P1.RT.PAY/P1.RT.INV/P1.RT.INT]
  - **Agent:** `build`
  - **Action:** Create `src/server/routers/purchase-orders.router.ts`. Move PO query routes, tab queries, detail from queries.ts. Register in `routers/index.ts`.
  - **Verify:** `pnpm typecheck && pnpm test`. All PO queries work. Router merge clean.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P1.RT.SAL** [PW] — Agent `build`. Create `sales-orders.router.ts`. Same pattern as P1.RT.PO.
- **P1.RT.PAY** [PW] — Agent `build`. Create `payments.router.ts`.
- **P1.RT.INV** [PW] — Agent `build`. Create `inventory.router.ts`.
- **P1.RT.INT** [PW] — Agent `build`. Create `intake.router.ts`.
- **P1.RT.PRUNE** [S after all router .PO/.SAL/.PAY/.INV/.INT complete]
  - **Agent:** `fast-build`
  - **Action:** Remove extracted routes from `queries.ts`.
  - **Verify:** `wc -l src/server/routers/queries.ts` < 500.
  - **Review:** `qa-reviewer` + `aqa-reviewer`
  - **Risk:** T2

### Phase 1 Frontend Cleanup — 1 task

- **P1.FE.SAL-CIRC** [P, gated by P1.CRED.PRUNE, parallel with Wave 2 + Router Split]
  - **Agent:** `build`
  - **Action:** Resolve SalesView.tsx ↔ SalesBrowseMode.tsx ↔ SalesBuildMode.tsx circular dependencies. Extract shared types to `src/client/views/sales/types.ts`.
  - **Verify:** `pnpm typecheck` passes. `madge --circular src/client/views/` returns 0 for sales views.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

---

## Phase 2: Reliability Layer (17 tasks)

**Goal:** Fix error handling, logging, types, and CI. Available for parallel work after Phase 0 gates pass and Phase 1 Wave 1 begins (reliability fixes don't touch extracted domain code).

---

### Structured Logging — 4 tasks

- **P2.LOG.SERVER** [P, gated by P0.E]
  - **Agent:** `build`
  - **Action:** Create `src/server/services/logger.ts` — structured JSON logger with levels (debug, info, warn, error), context (module, requestId), and pretty-print for dev. Tests in `src/server/services/logger.test.ts`.
  - **Verify:** Tests pass. Logger produces valid JSON with required fields.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P2.LOG.CLIENT** [P, parallel with P2.LOG.SERVER]
  - **Agent:** `build`
  - **Action:** Create `src/client/services/logger.ts` — wrapper that suppresses in production, routes to dev telemetry. Exported as singleton.
  - **Verify:** Tests pass. No output in NODE_ENV=production. Output visible in development.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P2.LOG.MIGRATE-SERVER** [S after P2.LOG.SERVER + Phase 1 Wave 2 complete]
  - **Agent:** `build`
  - **Action:** Replace all server-side `console.log/warn/error` with structured logger. Target: `commandBus.ts` remaining lines, `backgroundWorkers.ts`, `seed.ts`, `migrate.ts`, `sockets.ts`, receipt services.
  - **Verify:** `rg "console\.(log|warn|error)" src/server/ -g '!*.test.*' | wc -l` ≤ 2 (logger.ts only).
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P2.LOG.MIGRATE-CLIENT** [S after P2.LOG.CLIENT + Phase 1 Wave 2 complete]
  - **Agent:** `build`
  - **Action:** Replace client-side `console.log/warn/error` with client logger. Target: `filterEvaluator.ts`, `SalesView.tsx`, `MediaBatchDrawer.tsx`, `MediaUploadMobile.tsx`, `CommandPalette.tsx`, `SettingsView.tsx`.
  - **Verify:** `rg "console\.(log|warn|error)" src/client/ -g '!*.test.*' | wc -l` ≤ 2 (client logger only).
  - **Review:** `qa-reviewer`
  - **Risk:** T1

### Type Safety — 4 tasks (SEQUENTIAL within this group)

- **P2.TS.FIX-PROMISES** [P, gated by Phase 1 Wave 2 complete]
  - **Agent:** `build`
  - **Action:** Fix all 14 unhandled promise chains (audit H4). Add `.catch()` or wrap in try/catch. Target files: `main.tsx`, `MediaBatchDrawer.tsx`, `InventoryFinderPanel.tsx`, `FeedbackCapture.tsx`, `useCommandRunner.ts`, `VendorContextDrawer.tsx`, `PickLineScreen.tsx`, `DashboardView.tsx`, `RecoveryView.tsx`, `MobileInventoryView.tsx`, `MobileCatalogView.tsx`, `SalesView.tsx` (2), `MatchmakingView.tsx` (2).
  - **Verify:** Each add/void chain has error handling. Tests verify rejection paths.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P2.TS.ADD-RULE** [S after P2.TS.FIX-PROMISES]
  - **Agent:** `fast-build`
  - **Action:** Add `@typescript-eslint/no-floating-promises: error` to eslint.config.js.
  - **Verify:** `pnpm lint` passes with zero floating-promise violations.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P2.TS.AS-ANY** [S after P2.TS.ADD-RULE, parallel with P2.TS.ESLINT-DISABLE]
  - **Agent:** `build`
  - **Action:** Replace all 28 production `as any` casts with proper types. Prioritize: `commandBus.ts` (remaining), `AdvancedFilterBuilder.tsx`, `sockets.ts`, `queries.ts` (remaining), `MobilePaymentsView.tsx`, `SalesView.tsx`, `ItemsView.tsx`, `realisticSeed.ts`, `filters.ts`.
  - **Verify:** `rg "as any" src/ -g '!*.test.*' | wc -l` = 0.
  - **Review:** `qa-reviewer` + `cross-reviewer`
  - **Risk:** T2

- **P2.TS.ESLINT-DISABLE** [S after P2.TS.ADD-RULE, parallel with P2.TS.AS-ANY]
  - **Agent:** `build`
  - **Action:** Audit all 34 `eslint-disable` comments. Remove or document with justification. Target: `react-hooks/exhaustive-deps` (9 instances — verify each), `no-explicit-any` (12 instances — remove as `as any` is eliminated), `no-console` (7 instances — logger replaces).
  - **Verify:** `rg "eslint-disable" src/ -g '!*.test.*' | wc -l` ≤ 5 (documented only).
  - **Review:** `qa-reviewer`
  - **Risk:** T1

### CI + Pre-Commit — 3 tasks

- **P2.CI.WORKFLOW** [P, gated by P0.E]
  - **Agent:** `fast-build`
  - **Action:** Create `.github/workflows/ci.yml` — runs on PR: `pnpm typecheck`, `pnpm lint`, `pnpm test`. Required status check.
  - **Verify:** Workflow file exists. Can be triggered on PR.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P2.CI.PRECOMMIT** [P, gated by P0.E, parallel with P2.CI.WORKFLOW]
  - **Agent:** `fast-build`
  - **Action:** Create pre-commit config (lefthook.yml or .pre-commit-config.yaml). Hooks: `eslint --fix`, `prettier --write`, `pnpm typecheck` (staged files).
  - **Verify:** Pre-commit runs on `git commit`. Fast path for clean changes.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P2.CI.TEMPLATE** [P, gated by P0.E, parallel with above]
  - **Agent:** `fast-build`
  - **Action:** Create `.github/PULL_REQUEST_TEMPLATE.md` with checklist: typecheck, lint, tests, no as-any, no console.log, path aliases, error states, domain README.
  - **Verify:** Template appears when creating PR on GitHub.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

### Error Boundaries — 3 tasks

- **P2.EB.ROUTE** [P, gated by P0.E]
  - **Agent:** `build`
  - **Action:** Create `src/client/components/ErrorBoundary/RouteErrorBoundary.tsx` — wraps route component, shows error UI with retry + go-home. Apply to all 13 refactored Mercury views.
  - **Verify:** Each view file has ErrorBoundary wrapper. Test: render error → UI shown, retry → remounts.
  - **Review:** `qa-reviewer` + `cross-reviewer`
  - **Risk:** T2

- **P2.EB.GRID** [P, parallel with P2.EB.ROUTE]
  - **Agent:** `build`
  - **Action:** Create `src/client/components/ErrorBoundary/GridErrorBoundary.tsx` — preserves unsaved cell edits on error. Apply to GridView template and OperatorGrid.
  - **Verify:** Grid error preserves cell state. Test verifies.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P2.EB.DRAWER** [P, parallel with P2.EB.ROUTE]
  - **Agent:** `build`
  - **Action:** Create `src/client/components/ErrorBoundary/DrawerErrorBoundary.tsx` — closes drawer on error, shows toast. Apply to DetailSlideover, ContextDrawer.
  - **Verify:** Drawer error → drawer closes, toast visible. Test verifies.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

### Data-Fetching Error States — 3 tasks

- **P2.DF.SHELL-PALETTE** [P, gated by P0.E]
  - **Agent:** `build`
  - **Action:** Add error states + loading skeletons to Shell.tsx and CommandPalette.tsx. Use `isError` from tRPC queries. Error UI: inline message with retry.
  - **Verify:** Shell shows error state when query fails. CommandPalette shows error state.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P2.DF.TABS** [P, parallel with P2.DF.SHELL-PALETTE]
  - **Agent:** `build`
  - **Action:** Add error states to 12 drawer tab components (PoLinesTab, PoVendorTab, PoLinkedIntakeTab, PaymentLinkedOrdersTab, etc.) + VendorBillDetailsTab + RelationshipDrawer + SocketContext.
  - **Verify:** Each tab component checks `isError` and renders error UI.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P2.DF.OTHER** [P, parallel with above]
  - **Agent:** `build`
  - **Action:** Add error states to remaining data-fetching components: ReceiptPreviewOverlay, ReceiptPanel, RecentSheetsPanel, ProcessorFeesGrid, CreditQueueHealthWidget, ShadowModeBanner.
  - **Verify:** Each component checks `isError` and renders error UI.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

---

## Phase 3: Quality Hardening (20 tasks)

**Goal:** Fill test gaps, add integration tests, documentation, conventions, dependency management.

---

### Critical Test Coverage — 5 tasks

- **P3.TEST.SCHEMA** [P, gated by P0.C]
  - **Agent:** `build`
  - **Action:** Write tests for `src/server/schema.ts` and `src/client/config/entity-schemas.ts`. Verify: constraints, type mappings, relation integrity, entity schema field definitions.
  - **Verify:** `pnpm vitest run src/server/schema.test.ts src/client/config/entity-schemas.test.ts` green.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P3.TEST.SEED** [P, gated by P0.C]
  - **Agent:** `build`
  - **Action:** Write tests for `src/server/realisticSeed.ts`. Verify: seed produces valid state, all constraints satisfied, all required entities present.
  - **Verify:** Seed test passes. Run against test DB.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P3.TEST.FILTER** [P, gated by P0.C]
  - **Agent:** `build`
  - **Action:** Write tests for `src/client/components/FilterToolbar.tsx` (913 lines, untested). Cover: filter construction, progressive disclosure, tag chip interaction, clear/reset.
  - **Verify:** FilterToolbar tests pass. Coverage ≥ 80% for filter logic.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P3.TEST.COMBOBOX** [P, gated by P0.C, parallel with above]
  - **Agent:** `build`
  - **Action:** Write tests for `src/client/components/editors/ComboboxCellEditor.tsx` (677 lines, untested). Cover: autocomplete, keyboard navigation, option loading, Enter commit, Escape cancel.
  - **Verify:** ComboboxCellEditor tests pass. Coverage ≥ 80%.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P3.TEST.ADVFILTER** [P, gated by P0.C, parallel with above]
  - **Agent:** `build`
  - **Action:** Write tests for `src/client/components/AdvancedFilterBuilder.tsx` (559 lines, untested). Cover: filter construction, validation, value casting, application.
  - **Verify:** AdvancedFilterBuilder tests pass. Coverage ≥ 80%.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

### Domain Integration Tests — 8 tasks

One per extracted domain. All parallel, gated by that domain's PRUNE completing.

- **P3.INT.PO** [S after P1.PO.PRUNE, PW]
  - **Agent:** `build`
  - **Action:** Integration test for purchase-orders domain. Exercise: create PO → finalize → verify receipt creation → verify journal append → verify socket emit. Run against test DB.
  - **Verify:** Integration test passes. Covers full command → DB → query → projection chain.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

- **P3.INT.PAY** [S after P1.PAY.PRUNE, PW] — Same pattern for payments domain.
- **P3.INT.SAL** [S after P1.SAL.PRUNE, PW] — Same pattern for sales-orders domain.
- **P3.INT.CRED** [S after P1.CRED.PRUNE, PW] — Same pattern for credit domain.
- **P3.INT.INV** [S after P1.INV.PRUNE, PW] — Same pattern for inventory domain.
- **P3.INT.PICK** [S after P1.PICK.PRUNE, PW] — Same pattern for pick domain.
- **P3.INT.MED** [S after P1.MED.PRUNE, PW] — Same pattern for media domain.
- **P3.INT.INT** [S after P1.INT-FUP.PRUNE, PW] — Same pattern for intake domain.

### Documentation — 4 tasks

- **P3.DOC.ARCH** [P, gated by Phase 1 Wave 2 complete]
  - **Agent:** `fast-build`
  - **Action:** Write `ARCHITECTURE.md` — module map, data flow diagram (ASCII), key design decisions, domain descriptions.
  - **Verify:** File exists, covers all domains, accurate.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P3.DOC.CONTRIB** [P, parallel with P3.DOC.ARCH]
  - **Agent:** `fast-build`
  - **Action:** Write `CONTRIBUTING.md` — setup, conventions, PR process, commit format, branch workflow.
  - **Verify:** File exists, covers all required sections.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P3.DOC.JSDOC** [P, gated by Phase 1 Wave 2 complete]
  - **Agent:** `build`
  - **Action:** Add JSDoc to all exported functions in `src/domains/*/index.ts` and `src/server/routers/*.router.ts`. Include @param, @returns, @throws.
  - **Verify:** Every exported function in domain modules has JSDoc.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P3.DOC.ADR** [P, gated by Phase 1 Wave 2 complete]
  - **Agent:** `fast-build`
  - **Action:** Write `docs/decisions/0001-domain-module-architecture.md` — why domain modules, why this structure, alternatives considered, consequences.
  - **Verify:** ADR file exists, follows template.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

### Conventions — 2 tasks

- **P3.CONV.COMMIT** [P, gated by P0.E]
  - **Agent:** `fast-build`
  - **Action:** Add commitlint config. Enforce: `[TAG] domain: description (LINEAR-ID)`. Tags: FIX, FEAT, REF, TEST, DOC, CHORE, PERF, SEC.
  - **Verify:** Invalid commit message rejected. Valid accepted.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P3.CONV.DEPS** [P, gated by Phase 1 Wave 2 complete]
  - **Agent:** `fast-build`
  - **Action:** Pin production dependencies to exact versions in package.json. Document upgrade process. Remove verified unused deps.
  - **Verify:** `pnpm outdated` count reduced. No unused deps. `pnpm install && pnpm build` works with pins.
  - **Review:** `qa-reviewer`
  - **Risk:** T2

### Audit — 1 task

- **P3.AUDIT.FINAL** [S after all Phase 3 tasks complete]
  - **Agent:** `terminal`
  - **Action:** Run final audit against all success metrics. Measure: file sizes, `as any` count, `console.*` count, error boundary coverage, test gaps, commit discipline.
  - **Verify:** Report saved to `docs/audits/post-uplift-audit.md`. All metrics meet targets.
  - **Review:** `aqa-reviewer`
  - **Risk:** T2

---

## Phase 4: Contractor Handoff Readiness (17 tasks)

**Goal:** A new contractor clones the repo and makes their first clean PR within an hour.

---

### Core Handoff Docs — 4 tasks

- **P4.ONBOARD** [P, gated by Phase 3 complete]
  - **Agent:** `fast-build`
  - **Action:** Write `ONBOARDING.md` (repo root). 30-minute read: what TERP Operator is, tech stack, quick start, architecture diagram, domain map, feature walkthrough, conventions summary, test commands, where to find more. Replaces `docs/agent-orientation/*` (archive old docs).
  - **Verify:** File exists. Covers all sections. A placeholder contractor can follow it.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P4.ANTIPATTERNS** [P, parallel with P4.ONBOARD]
  - **Agent:** `fast-build`
  - **Action:** Write `docs/conventions/anti-patterns.md`. Before/after examples from this codebase: god files, silent catches, as-any, console.log, no error boundaries, deep imports, untested logic. Each with real pre-uplift example and correct post-uplift pattern.
  - **Verify:** File exists. Every anti-pattern has before/after code examples.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P4.CONVENTIONS** [P, parallel with P4.ONBOARD]
  - **Agent:** `fast-build`
  - **Action:** Write `docs/conventions/README.md`. One page: commit format, file naming, import order, component structure, state management, API calls, styling.
  - **Verify:** File exists. Covers all convention categories.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P4.ENVREF** [P, parallel with P4.ONBOARD]
  - **Agent:** `fast-build`
  - **Action:** Write `docs/reference/environment-variables.md`. Every env var from `server/env.ts` and Vite config: name, default, required, description.
  - **Verify:** File exists. Every env var documented.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

### Module API Contracts — 9 tasks

One README.md per domain module. All parallel, gated by that domain's Phase 1 PRUNE.

- **P4.READ.ME-PO** [S after P1.PO.PRUNE, PW] — Write `src/domains/purchase-orders/README.md`. Public API, depends on, consumed by, tests.
- **P4.READ.ME-PAY** [S after P1.PAY.PRUNE, PW] — Same for payments.
- **P4.READ.ME-SAL** [S after P1.SAL.PRUNE, PW] — Same for sales-orders.
- **P4.READ.ME-CRED** [S after P1.CRED.PRUNE, PW] — Same for credit.
- **P4.READ.ME-INV** [S after P1.INV.PRUNE, PW] — Same for inventory.
- **P4.READ.ME-PICK** [S after P1.PICK.PRUNE, PW] — Same for pick.
- **P4.READ.ME-MED** [S after P1.MED.PRUNE, PW] — Same for media.
- **P4.READ.ME-INT** [S after P1.INT-FUP.PRUNE, PW] — Same for intake.
- **P4.READ.ME-SHARED** [S after P0.A.SH2, PW] — Same for shared. All agents: `fast-build`. All reviewers: `qa-reviewer`. All risk: T1.

### Dev Environment — 2 tasks

- **P4.VERIFY** [P, gated by Phase 3 complete]
  - **Agent:** `fast-build`
  - **Action:** Create `scripts/verify-dev-setup.sh` — runs `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Add to package.json as `"verify": "bash scripts/verify-dev-setup.sh"`.
  - **Verify:** `pnpm run verify` passes on clean clone. Fails clearly if env broken.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

- **P4.DOC.UPDATE** [P, gated by Phase 3 complete, parallel with P4.VERIFY]
  - **Agent:** `fast-build`
  - **Action:** Update stale docs for post-uplift reality: `docs/agent-orientation/*` → archive or redirect to ONBOARDING.md; `docs/engineering-plans/AGENTS.md` → update paths, anti-patterns; `docs/design-system/INDEX.md` → verify component locations; `AGENTS.md` (repo root) → update domain references.
  - **Verify:** No doc references pre-uplift file paths that no longer exist.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

### PR Template — 1 task

- **P4.PRTEMPLATE** [P, gated by P0.E]
  - **Agent:** `fast-build`
  - **Action:** Create `.github/PULL_REQUEST_TEMPLATE.md` with checklist: typecheck, lint, tests, no as-any/console.log/eslint-disable, path aliases, error states, domain README updated, semantic commit tags. (Note: may already exist from P2.CI.TEMPLATE — if so, enhance it.)
  - **Verify:** Template appears when creating PR.
  - **Review:** `qa-reviewer`
  - **Risk:** T1

---

## Dependency Graph

```
P0.B ──┐
P0.C ──┤ (parallel)
P0.E ──┤
        ├──→ P0.F ──→ P0.G
        │                │
        │   P0.A.SH1 ──→ P0.A.SH2 ──→ P0.D (intake canary)
        │                              │
        │     ┌────────────────────────┘
        │     ▼
        │   P1.PO.CHARS → EXTRACT → CATCHES → MIGRATE → PRUNE
        │                                                  │
        │   P1.PAY.CHARS → EXTRACT → CATCHES → MIGRATE → PRUNE
        │                                                  │
        │   P1.SAL.CHARS → EXTRACT → CATCHES → MIGRATE → PRUNE
        │                                                  │
        │   P1.CRED.CHARS → EXTRACT → CATCHES → MIGRATE → PRUNE
        │                                                  │
        │     ┌────────────────────────────────────────────┘
        │     ▼
        │   ┌── P1.INV.* (5 tasks) ──┐
        │   ├── P1.PICK.* (5 tasks) ─┤  (Wave 2 — parallel)
        │   ├── P1.MED.* (5 tasks) ──┤
        │   ├── P1.INT-FUP.* (3) ────┘
        │   ├── P1.RT.* (7 tasks) ─── (Router split — parallel with Wave 2)
        │   └── P1.FE.SAL-CIRC
        │
        ├──→ Phase 2 reliability tasks (gated by P0.E, parallel with Phase 1)
        │
        └──→ Phase 3 quality tasks (gated by Phase 1 domain PRUNEs)
                │
                └──→ Phase 4 handoff tasks (gated by Phase 3)
```

---

## Parallel Execution Plan

### Wave 0: Immediate Launch (8 tasks)

| Task | Agent | Parallel |
|------|-------|----------|
| P0.B | explore | ✅ with P0.C, P0.E |
| P0.C | terminal | ✅ with P0.B, P0.E |
| P0.E | fast-build | ✅ with P0.B, P0.C |

After P0.B completes: P0.F (explore) can launch alongside P0.A.SH1 (opus-build).  
After P0.E completes: P2.CI.WORKFLOW, P2.CI.PRECOMMIT, P2.CI.TEMPLATE, P2.LOG.SERVER, P2.LOG.CLIENT, P3.CONV.COMMIT all unlock.

### Wave 1: Sequential Core (20 tasks, serial by domain)
4 domains × 5 steps. Each domain is serial internally. Domains are serial to avoid commandBus.ts merge conflicts.

### Wave 2: Mass Parallel (38+ tasks)
After P1.CRED.PRUNE completes, launch simultaneously:
- 4 Wave 2 domain extractions (18 tasks across INF, PICK, MED, INT-FUP)
- 7 router split tasks
- 1 frontend cleanup
- All available Phase 2 reliability tasks
- All available Phase 3 test tasks (gated by domain PRUNEs)

### Wave 3: Documentation + Handoff (24 tasks)
After all domain PRUNEs complete, launch simultaneously:
- 4 core handoff docs
- 9 module READMEs
- 2 dev environment tasks
- 4 documentation tasks
- 2 convention tasks
- 1 PR template
- 1 final audit

---

## Task Dispatch Quick Reference

Dispatch any task with: `Task ID: [P2.TS.FIX-PROMISES]. Agent: build. Read plan at docs/engineering-plans/EXECUTION-ROADMAP.md §[task section].`

| Category | Task Count | Risk Profile |
|----------|-----------|-------------|
| Phase 0 gates | 8 | T1-T2-Critical |
| Phase 1 extraction | 46 | T2-T2-Critical (domain PRUNEs: aqa-reviewer) |
| Phase 2 reliability | 17 | T1-T2 |
| Phase 3 quality | 20 | T1-T2 |
| Phase 4 handoff | 17 | T1 |
| **Total** | **108** | |

**Overall risk profile:** T2. Money-path domains (payments, credit, sales) and shared extraction are T2-Critical and get `aqa-reviewer` on PRUNE. Everything else is T2 with `qa-reviewer` + `cross-reviewer`, or T1 with `qa-reviewer` only.

---

*Roadmap synthesized from merged-foundational-uplift.md v2 (AQA-amended), Claude plan agent blueprint, and TERP Operator agent routing policy.*
