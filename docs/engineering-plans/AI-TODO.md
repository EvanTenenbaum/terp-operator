# Mercury UX Retrofit — AI Task Tracker

**Updated:** 2026-06-15  
**Current Phase:** Phase -1 Wireframes: Complete → Ready for Review  
**Total Tasks:** 108 (91 frontend + 17 backend)  
**Completed:** 0  
**In Progress:** 0  
**Blocked:** 0  

---

## Task State Machine

Tasks move through these states:

```
pending → assigned → in_progress → done
                  ↘ blocked (with reason)
```

- **pending:** Not yet started. Ready to be picked up.
- **assigned:** Claimed by an agent. Include agent ID and timestamp.
- **in_progress:** Agent actively building. Include worktree/branch.
- **done:** Completed with evidence. Include commit hash and test results.
- **blocked:** Cannot proceed. Include blocker description and dependency.

---

## Phase -1: Wireframes (Not Yet Decomposed)

**Status:** Pending. Wireframe creation process defined in MASTER-EXECUTION-DOCUMENT.md §17.

| ID | Task | Status | Agent | Evidence |
|----|------|--------|-------|----------|
| WF-ALL | Create all wireframes (27 views + 10 components + 10 flows) | done | PM (DeepSeek V4 Pro) | 47 files created in docs/engineering-plans/wireframes/ |

---

## Phase 0: Foundation — Frontend (27 tasks)

| ID | Task | Status | Agent | Evidence |
|----|------|--------|-------|----------|
| T-0-01 | ComboboxCellEditor basic dropdown | pending | — | — |
| T-0-02 | Combobox typeahead + async save | pending | — | — |
| T-0-03 | Combobox a11y + edge cases | pending | — | — |
| T-0-04 | Combobox integration test | pending | — | — |
| T-0-05 | DetailSlideover shell | pending | — | — |
| T-0-06 | Tab registry | pending | — | — |
| T-0-07 | FilterToolbar | pending | — | — |
| T-0-08 | Filter bridge | pending | — | — |
| T-0-09 | BulkActionBar | pending | — | — |
| T-0-10 | ViewTabBar | pending | — | — |
| T-0-11 | GridSummaryStrip | pending | — | — |
| T-0-12 | GridJourney entity schemas | pending | — | — |
| T-0-13 | GridJourney state machines | pending | — | — |
| T-0-14 | useEntityActions hook | pending | — | — |
| T-0-15 | useColumnDefs hook | pending | — | — |
| T-0-16 | View registry | pending | — | — |
| T-0-C1 | Fix PickView stubs | pending | — | — |
| T-0-C2 | Fix SalesCommandHistoryTab | pending | — | — |
| T-0-C3 | Fix RefereeCreditsList | pending | — | — |
| T-0-C4 | Remove dead procedures | pending | — | — |
| T-0-C5 | Fix merge-candidates counter | pending | — | — |
| T-0-T1 | Replace CSS assertions (4 files) | pending | — | — |
| T-0-T2 | Replace DOM coupling (5 files) | pending | — | — |
| T-0-T3 | Replace magic numbers (6 files) | pending | — | — |
| T-0-T4 | Fix Drizzle ORM mocks | pending | — | — |
| T-0-T5 | Fix E2E seed-data skips (5 files) | pending | — | — |
| T-0-T6 | Fix skipped unit tests | pending | — | — |

## Phase 0: Foundation — Backend (11 tasks)

| ID | Task | Status | Agent | Evidence |
|----|------|--------|-------|----------|
| T-B-01 | Canonical status enumerations | pending | — | — |
| T-B-02 | Combobox options endpoint | pending | — | — |
| T-B-03 | Grid summary endpoint | pending | — | — |
| T-B-04 | Status counts endpoint | pending | — | — |
| T-B-05 | Update grid query for filter/sort/group | pending | — | — |
| T-B-07 | Entity→DB column mapping config | pending | — | — |
| T-B-10 | Canonical status sync test | pending | — | — |
| T-B-12 | Combobox options test | pending | — | — |
| T-B-13 | Grid summary test | pending | — | — |
| T-B-15 | Updated grid query tests | pending | — | — |
| T-B-16 | Verify no schema migrations needed | pending | — | — |

## Phase 1: Pilot — Frontend (9 tasks)

| ID | Task | Status | Agent | Evidence |
|----|------|--------|-------|----------|
| T-1-01 | Adopt GridView template | pending | — | — |
| T-1-02 | FilterToolbar wiring | pending | — | — |
| T-1-03 | SummaryStrip + ViewTabBar | pending | — | — |
| T-1-04 | BulkActionBar wiring | pending | — | — |
| T-1-05 | DetailSlideover + tabs | pending | — | — |
| T-1-06 | ComboboxCellEditor wiring | pending | — | — |
| T-1-07 | PO authoring in slide-over | pending | — | — |
| T-1-08 | Register PO entity tabs | pending | — | — |
| T-1-09 | Validate PurchaseOrdersView | pending | — | — |

## Phase 1: Pilot — Backend (7 tasks)

| ID | Task | Status | Agent | Evidence |
|----|------|--------|-------|----------|
| T-B-06 | Bulk command dispatch endpoint | pending | — | — |
| T-B-08 | Per-entity tab query matrix | pending | — | — |
| T-B-09 | New detail queries for entities lacking them | pending | — | — |
| T-B-11 | Entity state machine validation test | pending | — | — |
| T-B-14 | Bulk dispatch tests | pending | — | — |
| T-B-17 | Cache invalidation strategy for useViewData | pending | — | — |
| T-B-18 | Optimistic update in ComboboxCellEditor | pending | — | — |

## Phase 2: GridJourney Views (8 tasks)

| ID | Task | Status | Agent | Evidence |
|----|------|--------|-------|----------|
| T-2-01 | Complete entity schemas | pending | — | — |
| T-2-02 | Complete state machines | pending | — | — |
| T-2-03 | useViewData hook | pending | — | — |
| T-2-04 | OrdersView | pending | — | — |
| T-2-05 | First wave (5 views) | pending | — | — |
| T-2-06 | Second wave (5 views) | pending | — | — |
| T-2-07 | Register all entity tabs | pending | — | — |
| T-2-08 | Validate GridJourney views | pending | — | — |

## Phase 3A: SalesView Refactoring (12 tasks)

| ID | Task | Status | Agent | Evidence |
|----|------|--------|-------|----------|
| T-3A-01 | Extract DisplayNameCell | pending | — | — |
| T-3A-02 | Extract BatchCodeCell | pending | — | — |
| T-3A-03 | Extract MarkupCell | pending | — | — |
| T-3A-04 | Extract DerivedCogsCell | pending | — | — |
| T-3A-05 | Extract PickStatusCell | pending | — | — |
| T-3A-06 | Extract WhyShownCell | pending | — | — |
| T-3A-07 | Extract LandedCostExceptionCell | pending | — | — |
| T-3A-08 | Stabilize fulfillmentActionsColumn | pending | — | — |
| T-3A-09 | useSalesLineRows hook | pending | — | — |
| T-3A-10 | useSalePrePostChecks hook | pending | — | — |
| T-3A-11 | buildConfirmPayload | pending | — | — |
| T-3A-12 | Validate refactoring | pending | — | — |

## Phase 3B-4: Remaining (35 tasks)

Full task list in [MASTER-EXECUTION-DOCUMENT.md §1](./MASTER-EXECUTION-DOCUMENT.md). Not repeated here for brevity. AI agents should update this file with status as they pick up tasks from the master document.

---

## GATES

These are hard checkpoints. Do NOT proceed past a gate without evidence.

| Gate | Phase | Condition | Status |
|------|-------|-----------|--------|
| G-0 | 0 | All Phase 0 tasks done. `pnpm typecheck` passes. All component tests pass. | pending |
| G-1 | 1 | PurchaseOrdersView fully retrofitted. All existing PO tests pass. | pending |
| G-2 | 2 | All GridJourney views retrofitted. All tests pass. | pending |
| G-3A | 3A | **HARD GATE.** All 5 SalesView test suites pass. No new components. | pending |
| G-3B | 3B | SalesView retrofitted. All tests pass. | pending |
| G-3C | 3C | Intake + Dashboard retrofitted. | pending |
| G-3D | 3D | All remaining views retrofitted. | pending |
| G-4 | 4 | Feature flags removed. Persona QA passes. Docs updated. | pending |

---

## Session Log

| Date | Agent | Action | Phase | Notes |
|------|-------|--------|-------|-------|
| 2026-06-15 | PM (DeepSeek V4 Pro) | Plan creation complete | Planning | Master document, backend audit, task registry finalized |
| 2026-06-15 | PM (DeepSeek V4 Pro) | Phase -1 wireframes created | Phase -1 | 27 views + 10 component sets + 10 flows = 47 files. Parallel dispatch across 7 agents. |

