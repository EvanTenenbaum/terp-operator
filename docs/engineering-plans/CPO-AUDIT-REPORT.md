# CPO Audit Report — Mercury UX Retrofit

**Date:** 2026-06-16
**Auditor:** OpenCode (Claude Opus 4.7), CPO seat
**Branch reviewed:** `docs/mercury-ux-retrofit-master-plan`
**Audit posture:** Find what will break, what's under-specified, what's missing. No cheerleading.
**Sources:** All 10 planning docs called out in the brief + targeted reads of `src/client/`, `src/server/`, `src/shared/`.

---

## 0. Executive Summary

The UX analysis is good. The wireframes are good. The integration map is good. **The implementation plan is not.** It will not survive contact with this codebase as written.

Three structural problems define the gap between plan and reality:

1. **No backend plan.** AI-TODO.md lists 17 backend tasks (T-B-01 through T-B-18). Master task registry defines **zero** of them. No procedures, no schemas, no AC, no dependencies. The retrofit assumes a `comboboxOptions` endpoint, a `gridSummary` endpoint, a `statusCounts` endpoint, a `runBulk` procedure, an `entity-column-map.ts`, and canonical status enumerations — **none of which exist** and **none of which are specified**. This is the single biggest planning gap. It blocks Phase 0 immediately.

2. **The plan ignores ~70% of the existing infrastructure.** ContextDrawer, InspectorDrawer, GridJourney, useDrawerUrlSync, drawerByView store, gridFilters store, AdvancedFilterBuilder, columnsByView, ConfirmRoot, useCommandRunner — these already exist and partially implement what the plan calls "from scratch." The plan calls for `DetailSlideover` while ContextDrawer is a 647-line component with five drawer states (`closed | peek | standard | wide | focus`) already wired into `drawerByView` and the URL. The plan calls for `GridView template` while `GridJourney` exists at `src/client/views/operations/shared.tsx:247` and is what 6+ views already use. The plan does not say whether to extend, parallel-build, or replace these. Agents will build duplicates and create two parallel systems that drift apart.

3. **Specs are 95% missing.** Four component specs exist (combobox, slide-over, bulk bar, filter toolbar) and one template spec (grid-view). **Zero view specs, zero hook specs, zero config specs, zero template specs for MasterDetail/Dashboard/Wizard, zero backend specs.** The execution strategy explicitly forbids agents from "designing as they build" — yet that is the only way 80% of the 108 tasks can be executed today. The directories `docs/engineering-plans/specifications/views/`, `hooks/`, `config/` are empty.

Severity ranking of audit findings:

- **P0 (must fix before any agent is dispatched):** F1, F2, F4, F7, F9, F10
- **P1 (must fix before Phase 0 gate):** F3, F5, F6, F11, F13
- **P2 (must fix before Phase 3A HARD GATE):** F8, F12, F14, F15

Recommended action: **do not dispatch any agent for Phase 0 until P0 items are closed.** A 2–3 day planning sprint will save 2–3 weeks of integration debt.

---

## 1. Structural Problems From Past Iterations

### F1. The retrofit is the third UX wave on the same code. Each prior wave left residue. (P0)

Evidence from `docs/design-system/decisions-log.md` and code:

- **Wave 5–6 (mobile + relationships):** Added 7 mobile views (`MobileDashboardView`, `MobileIntakeView`, `MobilePaymentsView`, `MobileCatalogView`, `MobileContactsView`, `MobileContactProfileView`, `MobileInventoryView`). The Mercury plan barely touches these — only T-4-01 acknowledges "7 mobile views adapted" with no per-view tasks, no specs, no spec sheets. **Mobile will silently rot if the desktop retrofit ships first.**
- **Wave 7 (Jun 12):** Just added `PhotographyQueuePanel` mounted in Inventory + Sales as part of fixing UX-O02/O03/O04. The retrofit immediately wants to move it out (to a slide-over tab). Wave 7 ships, retrofit unships it. Net: thrash.
- **Wave 7 (Jun 12):** Stabilized "registry bijection" (UX-U02) and added intake/QuickLedger TSV paste. The retrofit's T-0-T6 says "fix or delete skipped unit tests" but the actual UX-E06/UX-J07/UX-H06 trackers (live in decisions log) are untouched in the master registry.

**Cost:** Three live tracks (`mercury-ux-retrofit-master-plan`, the existing UX audit waves still in flight, mobile follow-ons CAP-040/041/042 marked "deferred") will interleave commits. Conflicts on `SalesView.tsx`, `IntakeView.tsx`, `operations/shared.tsx` are certain.

**What to do:**
- [ ] Freeze in-flight UX audit work for the duration of Phase 0–1 (or finish + tag a baseline `pre-mercury-baseline`).
- [ ] Add a Phase 4 mobile sub-plan (≥7 tasks) before Phase 4 starts. Don't lump it into one task.
- [ ] Cross-reference the decisions log entries (Jun 11–15) into BUG-REGISTRY.md so they don't get lost.

---

### F2. The codebase has TWO patterns for "drawer with tabs." The plan picks a third. (P0)

Three coexisting patterns:

| Pattern | Where | Used by | Lines |
|---|---|---|---|
| `ContextDrawer` (5 states, drawerByView in uiStore, URL-synced via useDrawerUrlSync) | `src/client/components/ContextDrawer.tsx` | SalesView, PurchaseOrdersView, OrdersView, etc. | 647 |
| `InspectorDrawer` + `InspectorTab` (different abstraction, bottom-anchored tabs) | `src/client/components/templates/InspectorDrawer.tsx` | OrdersView (`inspectorTabs={...}`), `GridJourney` accepts it as a prop | 128 |
| `DetailSlideover` (planned: 4 states `closed | peek | standard | wide`, separate registry) | does not exist | nothing yet | 279-line spec |

The DetailSlideover spec at `docs/engineering-plans/specifications/components/detail-slideover.md` admits at line 4: "Replaces ContextDrawer (all 5 states) + ~15 drawer/panel components." It does not say:
- How `drawerByView` migrates (it's in `partialize` — operator session restore depends on it).
- How `useDrawerUrlSync` is adapted or replaced.
- What happens to `InspectorDrawer` and its 26+ uses of `inspectorTabs` in `GridJourney`.
- How the existing `defaultTabForEntity` resolution survives.

**Cost:** Three parallel slide-over/drawer systems. ContextDrawer doesn't get removed because views still depend on it. InspectorDrawer doesn't get removed because GridJourney uses it. DetailSlideover ships as the *new third* pattern. Future agents will not know which to use.

**What to do:**
- [ ] **Pick a strategy explicitly:** (a) extend ContextDrawer to satisfy the spec, or (b) build DetailSlideover *and write a deprecation map* that names every site to migrate plus a removal date.
- [ ] Reconcile `DrawerStateName` (`closed | peek | standard | wide | focus` — already shipped) vs `SlideoverState` (`closed | peek | standard | wide` — missing `focus`). Whichever wins, only one ships.
- [ ] InspectorDrawer is a different concept (bottom tabs, not right slide-over). Decide if it stays for Orders/Payments inspection or gets folded.

---

### F3. SalesView is 1986 lines. Plan splits the cleanup into 12 tasks. None describe verification. (P1)

`src/client/views/SalesView.tsx` = 1986 lines, ~30 commands, 6 stacked WorkspacePanels, 8 grids, 7 inline cell renderers that close over view state. The plan's Phase 3A "Refactoring" lists T-3A-01 through T-3A-12: extract 7 cell renderers, stabilize 1 column, extract 3 hooks, validate.

What's missing:

- T-3A-01 through T-3A-07 say "extract DisplayNameCell, BatchCodeCell, MarkupCell, DerivedCogsCell, PickStatusCell, WhyShownCell, LandedCostExceptionCell" but **none of these have specs** and the existing inline renderers reference `pricingRule`, `dupSource`, `marginToggle`, `releaseEligibility`, `canWrite`, `isRunning`. The plan says these become `cellRendererParams` — but doesn't enumerate which params each cell needs. Agents will re-derive.
- T-3A-12 says "All 5 SalesView test suites pass" as the gate. Those suites assert specific DOM, specific data shapes, specific text content. Extracting cell renderers will almost certainly fail some of them — and the plan doesn't say which to update and which are golden.
- The 7 cell renderers run in parallel per the dependency graph. They all touch the same file. **Merge conflicts are certain.** No sequencing or branch strategy.

**Cost:** Phase 3A is at minimum a 2-week sequential effort, not the parallel 75% the dependency graph claims. The plan claims 9/12 tasks parallel; reality is 7/12 conflicting writes to one file.

**What to do:**
- [ ] Re-spec each cell renderer task with the exact `cellRendererParams` interface, the exact `props` interface, and a checklist of preserved behaviors.
- [ ] Mark T-3A-01 through T-3A-07 as **sequential** in dependency-graph.md, not parallel. Or extract each to its own file in a single commit.
- [ ] Define which SalesView tests are "golden" (must pass unchanged) vs "DOM-fragile" (acceptable to update with rationale).

---

### F4. Status enums are wild west. The plan's state-machines silently depend on something that doesn't exist. (P0)

`src/server/schema.ts` (1383 lines) uses `varchar('status', { length: 32 })` with hard-coded defaults across PurchaseOrders, SalesOrders, Orders, Payments, Picks, Invoices, etc. There is no central status table. The shared `statuses.ts` file that AGENTS.md and the master execution doc reference (`src/shared/statuses.ts`) **does not exist**.

What status values actually exist? Inferred from defaults in schema.ts + commandBus.ts (8063 lines, 154 case statements):
- PO: draft / ordered / received / finalized / cancelled / approved / unfinalized (approx.)
- SalesOrder: draft / confirmed / posted / fulfilled / cancelled (approx.)
- Payment: open / posted / void / failed (approx.)
- Batch: draft / ready / needs_fix (per `batchPayloadSchema`)

There is **no single source of truth**. State machines (T-0-13) and BulkActionBar (T-0-09, T-1-04) both require an enumeration of statuses with their allowed transitions and role gates. T-B-01 "Canonical status enumerations" is listed in AI-TODO.md as the first backend task — and has zero specification.

**Cost:** Every downstream task (T-0-13 entity state machines, T-0-14 useEntityActions, T-1-04 BulkActionBar wiring, all of Phase 2) silently depends on T-B-01. The plan does not name this dependency anywhere. Agents will invent their own status lists from `columnsByView` text and the resulting state machines will not match `commandBus.ts` reality.

**What to do (before any Phase 0 dispatch):**
- [ ] Create `src/shared/statuses.ts` with one `z.enum` per entity, derived from grep of schema.ts defaults + commandBus.ts case statements.
- [ ] Add a typecheck-time test: every status in this file appears in `commandBus.ts` and every status `commandBus.ts` writes appears here.
- [ ] Update the schema to add `CHECK` constraints or migrate to `pgEnum` (decision: defer or do now).
- [ ] Specify T-B-01 with this concrete output, then unblock T-0-13.

---

## 2. Frontend-Backend Coupling Gaps

### F5. The plan assumes 6 backend endpoints that do not exist and are not specified. (P0)

Plan calls for:

| Procedure | Where assumed | Reality |
|---|---|---|
| `queries.comboboxOptions` | T-0-01 ComboboxCellEditor (option source) | does not exist |
| `queries.gridSummary` | T-0-11 GridSummaryStrip (KPI cards) | does not exist |
| `queries.statusCounts` | T-0-10 ViewTabBar (count badges) | does not exist |
| `commands.runBulk` | T-0-09 BulkActionBar (multi-row dispatch) | does not exist |
| Updated `queries.grid` with filter/sort/group params | T-0-15 useColumnDefs + T-B-05 | current `queries.grid` only takes `{ view }` (queries.ts:202) |
| Per-entity tab queries (T-B-08) | DetailSlideover tabs | `entityTimeline` exists; per-entity batches do not (T-B-09 mentions creating "new detail queries for entities lacking them" — no list of which) |

The current `queries.grid` is a giant SQL switch (queries.ts:202–2700+) that returns rows for a view. It does not accept filter/sort/group state. Adding that is **a significant SQL re-architecture**, not a hook update.

`commands.runBulk` is even more delicate: each command in `commandBus.executeCommand` runs in a transaction with idempotency keys, command journal entries, snapshot capture, and socket broadcasts. "Bulk dispatch" needs a policy decision per command — all-or-nothing? per-row? transactional? Currently undefined.

**Cost:** Without these endpoints, Phase 0 components are demoware. ComboboxCellEditor with no options endpoint is non-functional. GridSummaryStrip with no summary endpoint shows hard-coded values. T-1-04 BulkActionBar ships as a UI shell.

**What to do (before T-0-01):**
- [ ] Spec all 6 procedures with input/output Zod schemas. Append to BUG-REGISTRY or a new `docs/engineering-plans/backend-tasks.md`.
- [ ] Decide the bulk-dispatch semantics explicitly: all-or-nothing transaction? Per-row with partial-success report? (Spec at `docs/engineering-plans/specifications/components/bulk-action-bar.md` mentions "partial success" UI but the backend behavior is unspecified.)
- [ ] Add T-B-* tasks to master-task-registry.md (they currently only appear in AI-TODO.md as line items).

---

### F6. Slide-over tabs need backend data that doesn't exist for most entities. (P1)

DetailSlideover wants tabs like Lines, Vendor, Customer, History, Linked Intake, Receipt, etc., across PO / SalesOrder / Customer / Vendor / Lot / Payment / Pick / Invoice. The existing tab components I found in `src/client/components/drawerTabs/`:

```
PoLinesTab, PoVendorTab, PoHistoryTab, PoLinkedIntakeTab, PoCommandsTab
SalesOutputTab, SalesPricingTab, SalesCommandHistoryTab
LotMovementTab, LotHistoryTab, LotPhotosTab
VendorBillDetailsTab, VendorBillTraceTab, VendorPaymentHistoryTab
EntityTimelineTab (unified, for customer/vendor/order/lot)
PaymentLinkedOrdersTab, CommandReversalTab
```

What's **missing** vs the plan's tab manifest:

- Customer tab set: `PurchaseHistory`, `Photography`, `Credit`, `Overview` — `CustomerCreditPanel` exists but is not a tab; CustomerPurchaseHistoryPanel exists as a permanent panel.
- Inventory Finder as a slide-over (`entityType="finder"`) — no procedures, no schema, no spec.
- Receipt preview tab — `ReceiptPreviewOverlay` exists but is a different shape.
- Vendor tab for SalesOrder slide-over — does not exist.

**Cost:** "Move panel X into a slide-over tab" reads like a refactor but is actually a build-from-scratch task in 6+ places. The plan's T-1-08, T-2-07, T-3B-09 say "register tabs" — but tabs that don't exist as components can't be registered.

**What to do:**
- [ ] Per-entity tab inventory: for each `entityType`, list each planned tab, mark component status as `EXISTS` / `NEEDS_REFACTOR` / `NEEDS_BUILD`.
- [ ] Add backend procedure list for `NEEDS_BUILD` tabs.
- [ ] Add to BUG-REGISTRY or a new `docs/engineering-plans/tab-inventory.md`.

---

### F7. The "filter bridge" is harder than the plan admits. (P1)

T-0-08 says: round-trip simple-filter ↔ advanced-filter via `simpleToAdvanced` and `advancedToSimple`. The existing infrastructure:

- `useUiStore.gridFilters[view]` stores a **string** (`field:op:value` per the spec).
- `useUiStore.gridAdvancedFilters[view]` stores `FilterGroupInput` (recursive AND/OR groups, defined in `src/shared/filterSchemas.ts`).
- `AdvancedFilterBuilder` (559 lines) is the existing UI for the advanced form. Server-side filter application is in `src/server/routers/filters.ts`.

The plan's "round-trip preservation" requirement is achievable for the trivial AND-of-equals case. It is **not** generally achievable: advanced filters allow `OR`, nested groups, between-ranges, `in`-list, `like` patterns, and date relative expressions. The bridge as specified will lossy-collapse complex filters to "simple" and then explode back to non-equivalent advanced.

**Cost:** Test cases will pass for round-trip on simple values, then fail in production when an operator's saved view has an OR. The plan's "amber pill 'Complex filter active'" is the band-aid. Worse: agents will not anticipate this and write a hash-comparison test that ratchets in a broken bridge.

**What to do:**
- [ ] Spec the bridge as **one-way coercive**: any complex filter is preserved unchanged; the simple toolbar can read but not modify it. Modifying via the toolbar shows a "Switch to advanced to edit" prompt.
- [ ] Define "complex" precisely: any group with `op !== 'AND'`, depth >1, or any leaf with `op` not in `{eq, neq}`.
- [ ] Re-spec T-0-08 AC with this semantic, not lossless round-trip.

---

## 3. Infrastructure Gaps

### F8. URL state encoding is scoped to drawers. Refresh still loses tabs, filters, selection. (P1 — UX-6 directly impacted)

`useDrawerUrlSync` (`src/client/hooks/useDrawerUrlSync.ts`) encodes `drawer`, `entityType`, `entityId` as query params. That's it.

The plan's UX-6 ("State Must Survive Context Switches") requires: row, filters, tab, slide-over open, draft text. To deliver this:

| State | URL today? | Plan addresses it? | Where? |
|---|---|---|---|
| Open slide-over entity | yes | yes | useDrawerUrlSync extends |
| Active tab | partially (`drawer` state only) | implied | unspecified |
| Active filter (simple) | no | implied | unspecified |
| Active filter (advanced) | no | implied | unspecified |
| Active ViewTabBar tab | no | implied (it's a filter) | unspecified |
| Active row selection | no | unspecified | unspecified |
| Draft form text | no | unspecified | unspecified |

The plan never writes down the URL grammar or the schema for query-string state. Without it:
- Each agent will invent their own encoding.
- Filter encoding will conflict between views.
- Tests of "refresh reproduces view" will be ad hoc.
- The `entity UUIDs must NOT persist in uiStore partialize` decision (C11) hardens URL-only state, but URL state is the only fallback for many of these — and it's not designed.

**Cost:** UX-6 cannot be claimed as satisfied without designing the URL grammar. The plan promises it. Agents will under-deliver.

**What to do:**
- [ ] Write a `docs/engineering-plans/url-grammar.md` defining keys, encoding rules, length limits, security-sensitive params, and which views inherit which schema.
- [ ] Add a `useViewUrlState(view)` hook spec that wraps drawer, filter, tab, and selection state.
- [ ] Pick a serialization for filters (probably `lz-string`-compressed JSON or short field codes).

---

### F9. No migration strategy. The plan never says how operators migrate from old TERP to new. (P0)

This is a production system. Operators are using it daily. The plan never mentions:

- **Feature flags.** Is there a per-view rollout? Plan says "Phase 1 ships PurchaseOrdersView" but doesn't say whether *that view ships to all operators* or behind a flag.
- **A/B / canary.** Two operators on old SalesView while five on new SalesView for a week?
- **Rollback plan.** §10 of MASTER-EXECUTION-DOCUMENT.md is referenced as the rollback plan but I don't see content for it in the read.
- **Saved column preferences.** `columnsByView` defaults are visible-by-default for ≤8 columns. Operators have `gridColumnPrefs` overrides. When schemas auto-generate column defs (T-0-15), are prefs preserved? `mergeColumnDefsWithPrefs` is referenced but it's not clear that auto-generated defs are pref-compatible.
- **Saved filters.** Will the filter bridge break existing saved views? `SavedFiltersDropdown` exists.
- **Persisted uiStore.** `partialize` already excludes entity UUIDs. What about `drawerByView`, `gridFilters`, `lastUsedDrawerStateByView`? When DetailSlideover replaces ContextDrawer, this state shape may change. If operators log in and lose all session state, that's a regression.

**Cost:** Production rollout will be a panic. Operators will report regressions on day 1. The team will not know whether to roll back or patch forward because the rollback unit is undefined.

**What to do:**
- [ ] Per-view feature flag (`FEATURE_MERCURY_PO`, `FEATURE_MERCURY_SALES`, etc.) tied to `ctx.user.role` or a settings flag.
- [ ] Migration script for `uiStore` persisted shape (or version bump that resets safely).
- [ ] `mergeColumnDefsWithPrefs` compat test against the generated columns.
- [ ] Decision on saved-filter compatibility — preserved? auto-migrated? warned-on?

---

### F10. Database migrations: no `/drizzle` directory; migrations applied via `migrate.ts`. Plan does not say if any are needed. (P0)

The plan's `T-B-16` says: "Verify no schema migrations needed." But:

- New `runBulk` command will need command-journal columns or new tables to record bulk groups.
- Status enums (F4) may need `pgEnum` migrations or `CHECK` constraints.
- Saved filter views may need a `filters` table extension.
- Slide-over tab counts may need indexed status_aggregate tables for performance.

There is no migrations folder visible at the repo root. `migrate.ts` reads from `drizzle/` (or similar) and applies SQL. If no SQL files exist, what's the migration history?

**Cost:** Backend tasks may quietly require migrations that the team didn't budget. Or worse: agents apply schema changes via `drizzle-kit push` and break production.

**What to do:**
- [ ] Locate the migrations directory (`find . -name "*.sql"` if needed).
- [ ] T-B-16 should be the **first** backend task, not a verification: enumerate what migrations *might* be needed and decide per item.
- [ ] Migration safety review for bulk command journal and any new tables.

---

### F11. Permissions / auth scoping not specified for new surfaces. (P1)

Existing pattern: `protectedProcedure` + `ctx.user.role`-checked queries. The plan introduces:

- `DetailTab.requiresRole` (mentioned in T-0-06): how is this enforced on the *server*? A tab hidden in the UI but with an unauthenticated tRPC procedure leaks data.
- BulkActionBar actions per state machine: role gates per action exist in current StatusActionTable. T-0-13 says "Role gates (e.g., approve requires manager)" — but the source of truth (per-procedure role check vs UI gate) is undefined.
- Filter procedures already have role gates (`filters.ts:145` checks `ctx.user.role`). New saved-view procedures need the same.
- Owner-only Credit Engine admin (Wave 6) — Mercury's CreditReviewView retrofit (T-3D-05) does not flag this.

**Cost:** New endpoints will not be role-gated by default. Audit will fail. Real risk of operators seeing data they shouldn't.

**What to do:**
- [ ] Add a "Role gating" section to every new procedure spec.
- [ ] Add a static-analysis check that every new tRPC procedure either has a comment justifying public access or uses `protectedProcedure` with documented role minimum.
- [ ] Cross-check tabs in tab registry against per-tab data source role.

---

### F12. CI/fast-runner story for the retrofit is undefined. (P2)

`.github/workflows/ci.yml` runs typecheck on GitHub Actions ubuntu-latest. The repo policy (`AGENTS.md`) says heavy work goes to the DigitalOcean fast runner. The plan's verification commands (`pnpm typecheck && pnpm vitest run <file>`) assume local execution.

When 8 agents are dispatched in parallel (per `02-ai-execution-strategy.md`), where do they run? On the Mac mini? On the runner? The fast-runner skill says: typecheck, tests, Playwright go to the runner. The plan doesn't say.

**Cost:** Agents will run local; typecheck saturation will lock the Mac mini; QA runs will be slow.

**What to do:**
- [ ] Add a "Verification dispatch" section to `02-ai-execution-strategy.md`: which commands run locally, which on the fast runner.
- [ ] Pre-define `fast-runner exec` invocations per phase gate.
- [ ] Add a per-PR check that gates merging on `pnpm typecheck && pnpm test && pnpm exec playwright test --project=chromium`.

---

## 4. Planning Completeness — What 108 Tasks Don't Cover

### F13. Task count is inconsistent and the phase subdirectories are empty. (P1)

| Source | Total tasks |
|---|---|
| `AGENTS.md` (this doc) | 108 |
| `AI-TODO.md` | 108 (91 frontend + 17 backend) |
| `00-master-task-registry.md` summary table | 80 |
| `dependency-graph.md` summary table | 77 |
| `work-breakdown/phase-0/` (and phase-1, phase-2, phase-3a, phase-3b, phase-3c, phase-3d, phase-4) | **0 files** |

Backend tasks `T-B-01` through `T-B-18` are listed in AI-TODO.md but have **no definitions anywhere in `work-breakdown/`**. The `phase-X` subdirectories are empty — they were created but never filled.

**Cost:** Agents looking for the task they were assigned won't find it. Routing logic in PM agents that says "read the task from work-breakdown/phase-0/{taskId}.md" will fail silently.

**What to do:**
- [ ] Reconcile counts to one number. 108 is fine if 18 backend tasks get defined. Pick.
- [ ] Either populate the phase-X directories with one file per task or delete them.
- [ ] Make AI-TODO.md the single source of task IDs; everything else links.

---

### F14. The plan has no entries for: error handling, loading states, empty states, accessibility per-task, mobile per-view, deprecated-code removal, data migration, backward compatibility. (P1)

What I searched for in the master registry that I did not find:

- **Per-component error boundary** specs (current `ErrorBoundary.test.tsx` exists; new components need their own error handling).
- **Loading-state spec for every component.** ComboboxCellEditor has it (skeletons in T-0-02). DetailSlideover has it (T-0-05 step "Loading state"). FilterToolbar mentions it. BulkActionBar mentions "Executing" but not source-loading. ViewTabBar mentions skeleton.
- **Empty states** beyond UX-12 statement. The plan refers to "empty state" several times but the design constraint C14 ("Empty states name the producing verb + surface") is not enforced in any task AC.
- **Accessibility per view.** T-4-02 is one bullet "Accessibility Audit." Per the global QA policy, a11y must be in every task — not deferred to Phase 4.
- **Mobile per view.** T-4-01 says "7 mobile views adapted." That's one task for 7 views and ~14 components. Should be 7+ tasks.
- **Deprecated-code removal.** `ContextDrawer` (647 lines), `WorkspacePanel` (45 uses), `FilterPresetStrip` (16 uses), `StatusActionBar` (26 uses), `AdvancedFilterBuilder` (559 lines, possibly preserved per T-0-07), `AddRefereeRelationshipDrawer`, `RecordPrepaymentDialog`, etc. — when does each one get removed? Plan says T-4-06 "Cleanup + Final Test Suite" but has no per-component removal task.
- **Data migration** for `uiStore` persisted shape (covered above in F9).
- **Backward compatibility** for saved filters, column prefs, drawer state.

**Cost:** Phase 4 will balloon. Phase 4 is currently "9 tasks in 2 weeks." Realistic estimate with everything missing: 20+ tasks, 4–6 weeks.

**What to do:**
- [ ] Move accessibility, error-handling, empty-state into per-component AC. Add C7, C13, C14, C15 from `decisions-log.md` as default AC items.
- [ ] Mobile sub-plan with one task per view.
- [ ] Per-deprecated-component removal task with explicit grep-clean check.

---

### F15. The plan's "Phase 4 Cleanup" is the canary for under-planning. (P2)

Phase 4 (`T-4-01` through `T-4-09`) lumps: mobile + accessibility + performance + documentation + persona QA + final test suite. That's a quarter-of-the-work compressed into 2 weeks.

The persona-flow QA framework (referenced in `docs/qa/persona-flows/REGISTRY.md` per AGENTS.md, 26 flows) is not budgeted as a per-phase gate. It only appears in T-4-05. Each phase merging without persona QA is risk accumulating.

**Cost:** Phase 4 will slip 3–4 weeks. Persona QA will catch regressions accumulated from Phase 1–3D, by which time the team is exhausted and the temptation to ship anyway is high.

**What to do:**
- [ ] Run persona QA at end of Phase 1 (PO complete), Phase 2 (GridJourney complete), Phase 3B (Sales complete), Phase 3D (all complex views complete). Not just at end.
- [ ] Allocate Phase 4 cleanup tasks individually:
  - Mobile: 7 tasks (1 per view)
  - A11y: ongoing per component (delete T-4-02)
  - Performance: 1 task per perf-sensitive view (~5 tasks)
  - Cleanup: 1 task per deprecated component (~10 tasks)

---

## 5. What's Already Built & Salvageable

These are the load-bearing systems that are **stable, well-tested, and should be preserved/extended, not rewritten:**

### Strong foundations (do not touch unless explicitly required)

| System | Files | Status | Why it's stable |
|---|---|---|---|
| `useCommandRunner` | `components/useCommandRunner.ts` | mature, tested | All mutations go through this. Don't bypass. |
| `commandBus.ts` | `services/commandBus.ts` (8063 lines, 154 commands) | mature | Idempotency, journal, socket broadcasts, snapshots. The retrofit must not invent a side-channel. |
| `useUiStore` | `store/uiStore.ts` (738 lines) | mature, has `gridFilters`, `gridAdvancedFilters`, `drawerByView`, `selectedRows`, `lastUsedDrawerStateByView`, persist+immer | Extend; do not replace. |
| AG Grid + `mergeColumnDefsWithPrefs` | `components/OperatorGrid.tsx` (1092 lines) | mature | Column visibility, width, pin prefs work today. Auto-generated columns must keep this. |
| `useConfirm` + `ConfirmRoot` | `hooks/useConfirm.ts` + `store/confirmStore.ts` | mature | Use for all destructive actions. Never `window.confirm`. |
| `useDrawerUrlSync` | `hooks/useDrawerUrlSync.ts` | partial — covers drawer state only | Extend for filters/tabs/selection. |
| `entityTimeline` query | `queries.ts:1144` | mature, role-aware | Use it for History tabs across entities. |
| `commandCatalog` | `shared/commandCatalog.ts` | mature, 40k bytes | The canonical command name list. State machines must align. |
| `filterSchemas` + `gridAdvancedFilters` | `shared/filterSchemas.ts` + uiStore | mature | The bridge must respect these as the source of truth. |
| `GridJourney` factory | `views/operations/shared.tsx:247` | **This IS the GridView template** | Plan calls it new; it exists. Decide: extend or wrap. |
| `InspectorDrawer` + `InspectorTab` | `components/templates/InspectorDrawer.tsx` | wired through GridJourney for OrdersView | Decide: preserve as bottom-tab pattern or fold into DetailSlideover. |
| `useFocusTrap` | `hooks/useFocusTrap.ts` | mature | Use in all new modal/slide-over components. |
| `APP_LOCALE` discipline | `utils/format.ts` (C5) | mature, ESLint-gated | New components must use, not raw `toLocale*`. |
| AG Grid drawerTabs library | `components/drawerTabs/*` (19 tabs) | mature | Tab content components exist for PO, SalesOrder, Lot, VendorBill, Payment. Register, don't rebuild. |

### Worth preserving but needing rework

| System | Where | Recommended fate |
|---|---|---|
| `ContextDrawer` (647 lines) | `components/ContextDrawer.tsx` | **Decide.** Either: (a) extend to be the `DetailSlideover`, drop the 5th state ('focus'), refactor tab list source from hard-coded to registry; or (b) build DetailSlideover next to it and migrate. (a) is faster. |
| `FilterPresetStrip` | `components/templates/FilterPresetStrip.tsx` (16 uses) | Becomes `ViewTabBar`. Wireframe-then-migrate per view. |
| `StatusActionBar` | `components/templates/StatusActionBar.tsx` (26 uses) | Becomes `BulkActionBar`. Decision-table logic stays. |
| `AdvancedFilterBuilder` (559 lines) | `components/AdvancedFilterBuilder.tsx` | Plan says preserve behind "Advanced" button. Good. |
| `WorkspacePanel` (45 uses) | `components/WorkspacePanel.tsx` | Plan says deprecate. Decide per-use whether each becomes: collapsible section, slide-over tab, inline strip, or absent. |
| `RecordPrepaymentDialog`, `RefereeRelationshipDialog`, `RefereeDialog`, `EditCreditLimitModal` | various dialogs | Plan says modal→slide-over. Each is one task; not budgeted individually. |
| Mobile views (7 files) | `views/mobile/*` | Plan barely touches. Define explicit mobile sub-plan. |
| `useConfirm()` usage | 8+ sites use bare `confirm(...)` calls. Verify each is the hook, not `window.confirm`. | Audit; the plan claims C7 enforced but I see 8 confirm() call sites. |
| Persona Flow QA framework | `docs/qa/persona-flows/REGISTRY.md` | Run per phase, not just at end. |

---

## 6. Critical Path Risk Assessment

### Critical path cascade failures

| Task | If wrong, breaks | Why |
|---|---|---|
| **T-B-01 Canonical status enumerations** | Phase 0–3D entirely | Every state machine and BulkActionBar derives from this. Currently unspecified. |
| **T-0-13 Entity state machines** | Phase 1+ BulkActionBar wiring | If state machines don't match `commandBus.ts` behavior, BulkActionBar will show invalid actions, send invalid commands, throw at runtime. |
| **T-0-05 DetailSlideover shell** | Phase 1+ all DetailSlideover usage | If state migration from ContextDrawer is wrong, refresh loses operator's place. UX-6 fails silently. |
| **T-0-15 useColumnDefs** | Phase 2 GridJourney | If `mergeColumnDefsWithPrefs` is not compatible with auto-generated columns, operators lose their saved column setup. Trust-busting regression. |
| **T-0-07 FilterToolbar + T-0-08 Filter bridge** | Phase 1+ filtering | Filter regression is the #1 thing operators will notice. |
| **T-1-01 PO adopts GridView template** | Pilot validity | If PurchaseOrdersView doesn't work as the proof, every later phase has no template confidence. |
| **T-3A-12 SalesView refactor gate** | Phase 3B onward | The HARD GATE. 5 test suites must pass. If they're DOM-fragile (likely), 100% pass-through is unrealistic without test updates. The gate is too binary as written. |
| **T-3B-08 Customer Workspace Context Header** | SalesView UX integrity | Plan says "InventoryFinder stays as inline collapsible section" — directly contradicts UX-3 (one primary surface) and UX-5 (attention budget). Operator gets ambiguous design. |

### Longest feedback loops

1. **SalesView Phase 3A → 3B → 3C.** From task start to "Sales user can confirm an order in the new UI": at least 6 weeks of sequential work assuming no setbacks. Phase 3A is 12 tasks of refactoring before any visual change. Operators see nothing new for a long time.

2. **Status enums → entity state machines → BulkActionBar.** Three sequential dependencies; if T-B-01 ships wrong, three downstream packages must redo.

3. **DetailSlideover migration of ~18 drawer/panel components.** Each migration is a sequential touch on one view. Plan budgets these inside per-view tasks; in practice they accumulate.

### Where the plan is most optimistic about AI agent capability

1. **"Agents do not design."** Reality: with only 4 component specs and 0 view/hook/config specs, agents *must* design. The "spec-first" claim does not match the spec inventory.
2. **"5–15 minutes per task."** SalesView is 1986 lines. Sales-line-row hook extraction is a one-hour exercise minimum, even for the right model. Plan estimates 5 min.
3. **"8 agents run simultaneously."** They touch the same files (SalesView, operations/shared, uiStore, schema.ts). Conflicts are guaranteed without explicit branch/merge strategy.
4. **"Per-view test suites pass unchanged."** Test suites for SalesView, IntakeView, PurchaseOrdersView assert DOM/text/data shapes that the retrofit changes by design. They will not pass unchanged. Plan acknowledges this nowhere.
5. **"Mercury patterns map cleanly."** Mercury is a bank with ~5 entity types and one workflow per type. TERP has ~30 entity types and 5–10 commands per type. The mapping has rough edges (e.g., bulk receive partial PO, fulfillment release with reservation timing) where Mercury's pattern doesn't fit.

---

## 7. Still-Needed Planning Work (Before Any Agent Dispatch)

Ranked by what blocks what. P0 = blocks Phase 0. P1 = blocks Phase 0 gate. P2 = blocks Phase 3A HARD GATE.

### P0 — Must complete before any agent dispatches

1. **Define `src/shared/statuses.ts`** with one `z.enum` per entity, sourced from grep of `schema.ts` defaults + `commandBus.ts` case statements. Cross-verify. (F4, ~1 day.)
2. **Spec backend tasks T-B-01 through T-B-18** with input/output Zod schemas, AC, dependencies. Put them in `00-master-task-registry.md`, not just AI-TODO. (F5, ~2 days.)
3. **Decide ContextDrawer ↔ DetailSlideover migration strategy.** Either extend or replace. If replace, write a per-site migration map. (F2, ~half day.)
4. **Decide GridJourney ↔ GridView template strategy.** Same: extend or replace. (F2, ~half day.)
5. **Migration / rollout plan.** Feature flags, uiStore persisted shape migration, saved-filter compatibility, saved-column-prefs compatibility. (F9, ~1 day.)
6. **Bulk-dispatch semantics.** All-or-nothing transaction? Per-row with partial success? Idempotency keys per row or per group? (F5, ~half day.)
7. **Database migrations needed?** Audit T-B-01, T-B-06, saved views, bulk command journal. Decide per item. (F10, ~half day.)

### P1 — Must complete before Phase 0 gate

8. **Per-entity tab inventory.** For each `entityType`, list each planned tab, mark `EXISTS | NEEDS_REFACTOR | NEEDS_BUILD`. (F6, ~half day.)
9. **URL state grammar.** Define query-string schema for drawer + filter + tab + selection. (F8, ~1 day.)
10. **Filter bridge semantic.** "One-way coercive: complex preserved unchanged, simple read-only-on-complex." Update T-0-08 AC. (F7, ~half day.)
11. **Per-component AC for error / loading / empty / a11y / mobile.** Add to every component spec. (F14, ~1 day.)
12. **Cell-renderer extraction sequencing for SalesView.** Make T-3A-01 through T-3A-07 sequential (or each in its own file). Define cellRendererParams interfaces. (F3, ~1 day.)
13. **Permissions / role gating spec.** Add to every new procedure and tab. (F11, ~half day.)
14. **Spec sheets that are 95% missing:** view specs (~27), hook specs (~5), template specs (~4), config specs (~3), additional component specs (ViewTabBar, GridSummaryStrip). (~3–4 days.)
15. **Task count reconciliation.** Pick one number. Update all docs. Populate or delete `work-breakdown/phase-X/` subdirectories. (F13, ~half day.)
16. **CI / fast-runner dispatch policy** per task type. Per-PR gates defined. (F12, ~half day.)

### P2 — Must complete before Phase 3A HARD GATE

17. **SalesView test-suite triage.** Which tests are golden? Which are DOM-fragile? Per-test annotation. (F3, F14, ~1 day.)
18. **Per-deprecated-component removal task.** ContextDrawer, WorkspacePanel (45 uses), FilterPresetStrip (16 uses), StatusActionBar (26 uses), each dialog. (F14, ~half day.)
19. **Mobile sub-plan.** 7 views, individually tasked. (F1, F14, ~1 day.)
20. **Persona QA gating per phase.** Update phase-gate definitions. (F15, ~half day.)
21. **Deep QA tier classification** of money/auth/migration-touching tasks. (~half day.)

**Total planning sprint estimate:** 12–15 days for a 2-person planning team (PM + architect). Don't compress to less than 10.

---

## 8. Quality of Life — Things Working Well

Not all bad. Things the plan does well:

- **UX analysis is the strongest artifact in this entire project.** `mercury-ux-integrated-analysis.md` cross-model validated, with named friction points and quantified scores. This is the foundation Mercury's plan should build on, and it does.
- **DESIGN-RULES.md v2.0** is well-organized, clearly rejects the token-first v1.1, and ties every rule to friction-point evidence.
- **INTEGRATION-MAP.md** is rigorous: 38 rows, each traced to wireframe + UX rule + Mercury equivalent + access cost. The reverse lookup (wireframe → migrations covered) is exactly what an agent needs.
- **Wireframes exist** (47 files: 27 views + 10 components + 10 flows). Plan-of-record before code.
- **Action placement rubric** (`01-integration-findings.md` §1) is the right discipline. R1–R7 are agent-friendly checks.
- **Bug registry** is the right pattern. Pre-existing bugs + cleanup tasks tracked. Verification checklist included.
- **The retrofit's `useCommandRunner` discipline** matches what already works in the codebase. No new write path.

These artifacts mean the *direction* is right. The implementation gap is execution scaffolding, not strategy.

---

## 9. Recommended Path Forward

### Week 1 — Planning sprint (no code)

Days 1–3:
- Status enum work (F4, P0 #1).
- Backend task specification (F5, P0 #2).
- ContextDrawer / GridJourney reconciliation decisions (F2, P0 #3 & #4).

Days 4–5:
- Migration plan (F9, P0 #5).
- URL state grammar (F8, P1 #9).
- Per-entity tab inventory (F6, P1 #8).

### Week 2 — Spec sheets (no code)

Days 1–3:
- View specs (top 5 most-trafficked).
- Hook specs (useViewData, useEntityActions, useColumnDefs, useViewUrlState).
- Config specs (entity-schemas, entity-actions, view-registry, entity-column-map).

Days 4–5:
- Remaining component specs (ViewTabBar, GridSummaryStrip).
- Test scaffold files for new components.
- Task count reconciliation; populate phase-X directories or delete.

### Week 3 — Phase 0 dispatch (code starts)

With specs ready and infrastructure decisions made, Phase 0 can dispatch with realistic confidence. Pre-conditions:
- All P0 items closed.
- All P1 items closed or explicitly deferred with rationale.
- Status enums file lives in `src/shared/statuses.ts`.
- Migration strategy documented.
- Feature flag scaffold in place.

### Continuous (every phase)

- Persona QA at each phase gate (F15).
- Per-phase Deep QA classification before claiming "done."
- BUG-REGISTRY updated as agents find issues.

---

## 10. Closing — What I'd Do Monday Morning

If I were taking the seat on this project Monday:

1. **Block any agent dispatch** until P0 items #1–#7 are closed. Tell the team. The cost of a 1-week planning sprint is 80% lower than the cost of week-3 architectural rollback.
2. **Run a 2-hour status-enum reverse-engineering session.** `grep -nE "status:\s*(varchar|text)|status:\s*z\.enum" src/server/schema.ts src/shared/schemas.ts src/server/services/commandBus.ts | tee status-survey.txt` then categorize into per-entity enums.
3. **Lock the ContextDrawer / DetailSlideover decision with a 30-min architecture meeting.** Write the decision in `docs/design-system/decisions-log.md` so it can't drift.
4. **Email the persona QA team** with the new phase-gate cadence. Schedule the first run for end of Phase 1.
5. **Open Linear issues** for P0 #1, #2, #5 with owners. Without ownership, P0 items are wishes.
6. **Add `pnpm agent:doctor` validation** that checks for the existence of `src/shared/statuses.ts` and `src/client/config/entity-schemas.ts`. If they're missing, the doctor reports it and agents know to wait.

The retrofit will work. The UX foundation is solid. The implementation plan needs 12–15 days of additional work before the first agent should touch code.

---

*End of CPO Audit Report. Append corrections as a new section at the top with date. Don't edit history.*

---

## §11 — DB Migration Audit (P0-7 Resolution)

> Note on numbering: this report's existing §4 covers Planning Completeness (F13–F15). The P0-7 addendum follows the report's chronological growth pattern (next available section number) rather than overwriting §4.

Resolved by: [db-migration-audit.md](./db-migration-audit.md)
Date: 2026-06-16
Summary: Phase 0 requires exactly **one** schema change (split into two files for the runner's CONCURRENTLY constraint): `0083_command_journal_bulk_columns.sql` adds `bulk_group_key uuid` and `bulk_sequence integer` as nullable columns on `command_journal`, and `0084_command_journal_bulk_index.sql` creates a composite btree index `command_journal_bulk_group_seq_idx` on `(bulk_group_key, bulk_sequence)` via `CREATE INDEX CONCURRENTLY` — owned by T-B-06 and consumed by `commands.runBulk`. Every other Phase 0 backend task (T-B-01..T-B-05, T-B-07..T-B-18) is add-only TypeScript or read-only SQL work with **zero schema impact**. Status enum hardening (Option B per audit §3: per-table `CHECK (status IN …)` constraints on money-mutating entities) and saved-views / feature-flags table extensions are explicitly deferred to Phase 0c/1 or later — none are Phase 0 blockers, all are additive when they land. Deployment is online-safe (no downtime, no data rewrite, no backfill, fully rollbackable until non-NULL writes begin), and the `varchar + Zod` status pattern stays as the recommended global default.

