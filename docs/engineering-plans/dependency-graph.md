# Dependency Graph — Mercury UX Retrofit

**How to read:** `A → B` means "A must be complete before B starts." Tasks on the same row can be parallelized.

---

## Phase 0 — Foundation (Weeks 1-3)

```
WEEK 1:
  T-0-01 (Combobox basic)
    → T-0-02 (Combobox typeahead/async)
      → T-0-03 (Combobox a11y/edge cases)
        → T-0-04 (Combobox integration test)

WEEK 2 (parallel blocks):
  BLOCK A:                              BLOCK B:
  T-0-05 (DetailSlideover shell)        T-0-07 (FilterToolbar)
    → T-0-06 (Tab registry)               → T-0-08 (Filter bridge)
                                        T-0-09 (BulkActionBar)
                                        T-0-10 (ViewTabBar)
                                        T-0-11 (GridSummaryStrip)
                                        T-0-12 (Entity schemas)

WEEK 3:
  T-0-12 (Entity schemas) → T-0-15 (useColumnDefs hook)
  T-0-13 (Entity state machines) → T-0-14 (useEntityActions hook)
  T-0-12 + T-0-13 → T-0-16 (View registry)

All Week 1 tasks must be complete before Week 2.
All Week 2 tasks must be complete before Week 3.
```

**Parallel opportunity:** Week 2 has two independent blocks. Block A (slide-over) and Block B (filter/bulk/summary/schemas) can run simultaneously.

---

## Phase 1 — Pilot: PurchaseOrdersView (Weeks 4-5)

```
PHASE 0 COMPLETE (GATE)
  ↓
T-1-01 (Adopt GridView template)
  ↓
  ├→ T-1-02 (FilterToolbar)
  ├→ T-1-03 (SummaryStrip + ViewTabBar)
  ├→ T-1-04 (BulkActionBar)
  ├→ T-1-05 (DetailSlideover)
  ├→ T-1-06 (ComboboxCellEditor)
  ├→ T-1-07 (PO authoring in slide-over)
  └→ T-1-08 (Register PO tabs)
  ↓
T-1-09 (Validate PurchaseOrdersView) ← ALL above must be complete
```

**Parallel opportunity:** T-1-02 through T-1-08 can run in parallel (they wire different components into the same view). Merge carefully to avoid conflicts.

---

## Phase 2 — GridJourney Views (Weeks 6-7)

```
PHASE 1 COMPLETE (GATE)
  ↓
T-2-01 (Complete schemas) ─┐
T-2-02 (Complete state machines) ─┤
T-2-03 (useViewData hook)  ─┤
  ↓                          │
T-2-04 (OrdersView)         │
  ↓                          │
T-2-05 (First wave: 5 views) │
T-2-06 (Second wave: 5 views)│
  ↓                          │
T-2-07 (Register entity tabs)←┘
  ↓
T-2-08 (Validate GridJourney views)
```

**Parallel opportunity:** T-2-01, T-2-02, T-2-03 are independent. T-2-05 and T-2-06 views are independent of each other (different files).

---

## Phase 3A — SalesView Refactoring (Weeks 8-10)

```
PHASE 2 COMPLETE (GATE)
  ↓
T-3A-01 through T-3A-07 (Extract cell renderers) ← ALL parallel
  ↓
T-3A-08 (Stabilize fulfillmentActionsColumn)
  ↓
T-3A-09 (useSalesLineRows) ─┐
T-3A-10 (useSalePrePostChecks) ─┤ ← parallel
T-3A-11 (buildConfirmPayload) ─┘
  ↓
T-3A-12 (Validate refactoring) ← HARD GATE: all 5 test suites must pass
```

**Parallel opportunity:** All 7 cell renderer extractions are independent. T-3A-09/10/11 are independent.

---

## Phase 3B — SalesView Migration (Weeks 11-13)

```
PHASE 3A COMPLETE (GATE)
  ↓
T-3B-01 (GridView template base)
  ↓
T-3B-02 (Schema + state machine) ─┐
T-3B-03 (FilterToolbar)           │
T-3B-04 (SummaryStrip)            │
T-3B-05 (BulkActionBar)           ├── parallel after T-3B-01
T-3B-06 (DetailSlideover)         │
T-3B-07 (ComboboxCellEditor)      │
T-3B-08 (Customer context header) │
T-3B-09 (Register tabs)           ┘
  ↓
T-3B-10 (Validate SalesView) ← ALL above must be complete
```

---

## Phase 3C — IntakeView + DashboardView (Weeks 14-15)

```
PHASE 3B COMPLETE (GATE)
  ↓
  ├→ T-3C-01 (IntakeView)       ← independent
  └→ T-3C-02 + T-3C-03 (Dashboard) ← independent
```

**Parallel opportunity:** IntakeView and DashboardView are completely independent.

---

## Phase 3D — Remaining Complex Views (Weeks 16-18)

```
PHASE 3C COMPLETE (GATE)
  ↓
WEEK 16:
  T-3D-01 (Matchmaking) ─┐
  T-3D-02 (Pick)         ├── parallel
                          ┘
WEEK 17:
  T-3D-03 (Recovery) ─┐
  T-3D-04 (Closeout)  ├── parallel
  T-3D-05 (Credit)    ┘

WEEK 18:
  T-3D-06 through T-3D-10 (Media, Referees, Processors, Items, Contacts) ← all parallel
```

---

## Phase 4 — Polish (Weeks 19-20)

```
ALL PHASES 0-3D COMPLETE (GATE)
  ↓
WEEK 19:
  T-4-01 (Mobile) ─┐
  T-4-02 (Accessibility) ├── parallel
  T-4-03 (Performance) ─┘

WEEK 20:
  T-4-04 (Documentation) ─┐
  T-4-05 (Persona QA)     ├── parallel (docs + QA)
  T-4-06 (Cleanup + tests) ┘
```

---

## Critical Path

```
T-0-01 → T-0-02 → T-0-03 → T-0-04
  → T-0-12 → T-0-16
    → T-1-01 → T-1-09
      → T-2-04 → T-2-08
        → T-3A-12
          → T-3B-01 → T-3B-10
            → T-4-06
```

**Critical path length:** 16 sequential tasks (minimum). Everything else can be parallelized.

---

## Task Count by Phase

| Phase | Tasks | Parallelizable | Sequential |
|-------|-------|---------------|------------|
| 0 | 16 | 8 (50%) | 8 |
| 1 | 9 | 7 (78%) | 2 |
| 2 | 8 | 5 (63%) | 3 |
| 3A | 12 | 9 (75%) | 3 |
| 3B | 10 | 9 (90%) | 1 |
| 3C | 3 | 2 (67%) | 1 |
| 3D | 10 | 10 (100%) | 0 |
| 4 | 9 | 6 (67%) | 3 |
| **Total** | **77** | **56 (73%)** | **21** |
