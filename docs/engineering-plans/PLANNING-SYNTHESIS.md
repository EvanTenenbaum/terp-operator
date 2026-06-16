# Planning Synthesis for Mercury UX Retrofit

This document is a compact synthesis of the engineering plan, intended for an AI agent that will write the execution plan.

## §A — Executive Summary

The Mercury UX Retrofit project aims to re-architect the TERP Operator console's frontend using Mercury.com's functional patterns to address significant operator friction. The UX analysis, design rules, and wireframes (Phase -1) are complete and well-regarded. However, a CPO audit found the implementation plan critically flawed and blocked. The plan lacks a backend specification for 18 required procedures, ignores ~70% of the existing stable infrastructure (risking duplicate systems), and is missing ~95% of the necessary component, view, and hook specs. Implementation is blocked until 7 P0 planning gaps—most critically, defining canonical status enums and specifying the non-existent backend endpoints—are closed. A 2-3 day planning sprint is required to unblock Phase 0.

## §B — The 7 P0 Blockers

From `docs/engineering-plans/CPO-AUDIT-REPORT.md`, these must be resolved before any agent is dispatched.

| # | Blocker | Why it Blocks | Output Artifact |
|---|---|---|---|
| 1 | **Undefined Statuses** | State machines and bulk actions depend on canonical status enums which do not exist. | `src/shared/statuses.ts` |
| 2 | **Unspecified Backend** | Phase 0 components are demoware without 18 backend procedures (for combos, grids, bulk actions, etc.). | Backend task specs in `00-master-task-registry.md` |
| 3 | **Drawer Indecision** | Plan introduces a new `DetailSlideover` without a migration plan for the existing 647-line `ContextDrawer`. | Decision in `docs/design-system/decisions-log.md` |
| 4 | **Template Indecision** | Plan calls for a new `GridView` template, ignoring the existing `GridJourney` factory. | Decision in `docs/design-system/decisions-log.md` |
| 5 | **No Migration Strategy** | No plan for feature flags, `uiStore` state migration, or compatibility for saved user prefs (filters/columns). | `docs/engineering-plans/migration-plan.md` |
| 6 | **Unspecified Bulk Semantics** | `BulkActionBar` requires a backend procedure, but its transactional semantics (all-or-nothing vs. partial success) are undefined. | Spec for `commands.runBulk` procedure |
| 7 | **Unknown DB Migrations** | Plan assumes no DB migrations are needed, but new features likely require them. | Audit result in `CPO-AUDIT-REPORT.md` |

## §C — Architecture Summary

From `docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md`.

*   **12 ARCH Rules:**
    1.  **ARCH-1:** One data source per view.
    2.  **ARCH-2:** State machines drive action visibility.
    3.  **ARCH-3:** Lazy data, lazy mount.
    4.  **ARCH-4:** Progressive disclosure is the default render path.
    5.  **ARCH-5:** Mount budget = attention budget.
    6.  **ARCH-6:** URL is the single source of view state.
    7.  **ARCH-7:** Mutations are immediate and in-place.
    8.  **ARCH-8:** Templates render the primary surface; chrome is allocated.
    9.  **ARCH-9:** Error states are first-class data.
    10. **ARCH-10:** Dashboard is a composition of typed widgets.
    11. **ARCH-11:** One section expanded per group; sections are first-class state.
    12. **ARCH-12:** Cell editors commit through `useCommandRunner`; forms are atomic.

*   **Component Hierarchy:** Views render **templates** (`PrimaryGridView`, `MasterDetailView`) which allocate chrome. The template owns the layout, composing `FilterToolbar`, `SummaryStrip`, `PrimaryGrid`, `SlideOver`, and `BulkActionBar`. Views provide configuration, not layout primitives.

*   **Data Flow Rules:** One primary query per view (`trpc.queries.grid`). Supplementary queries are gated on user action (`{ enabled: ... }`). Entity schemas in config drive `ColDef[]` creation. State machines in config drive button rendering. All mutations go through `useCommandRunner`.

*   **Anti-Patterns (Top 5 Frontend, Top 3 Backend):**
    *   **Frontend:** `style={{...}}` (use semantic CSS), `test.skip`, disabled "Coming soon" buttons (hide instead), `useState` for global view state (use `useUiStore`+URL), direct `trpc` mutation calls (use `useCommandRunner`).
    *   **Backend:** `publicProcedure` for new data queries (use `protectedProcedure`), N+1 queries for grid data, bypassing `commandBus` for "simple" updates.

## §D — Layer Dependencies

From `docs/engineering-plans/dependency-graph.md`.

*   **Critical Path:** `Combobox` → `Entity schemas` → `View registry` → `PO View Pilot` → `Orders View` → `SalesView Refactor Gate` → `SalesView Migration` → `Final Cleanup`.
*   **Phase 0 (Foundation):** `Combobox` component is serial. `SlideOver` and `FilterToolbar` blocks are parallel. Hooks and registries depend on schemas/state machines.
*   **Phase 1 (Pilot):** `PurchaseOrdersView` adopts the template first. All other component integrations into it can run in parallel.
*   **Phase 3A (SalesView Refactor):** Is a **HARD GATE**. 7 cell renderer extractions can be parallel, but they all touch the same file, risking merge conflicts. The CPO audit recommends making them sequential.

## §E — Migration Map Summary

From `docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md` §4 and `docs/engineering-plans/wireframes/INTEGRATION-MAP.md`.

| Old Pattern | Where (Count) | Replacement | Mandatory By |
|---|---|---|---|
| Per-view `ColDef[]` arrays | `columnsByView` + inline | `src/client/config/entity-schemas.ts` | Phase 0+ |
| `WorkspacePanel` | 45+ uses | `SlideOver` tab or `CollapsibleSection` | Phase 4 |
| `FilterPresetStrip` | ~16 uses | `StatusFilterPill` in `FilterToolbar` | Phase 1+ |
| `StatusActionBar` | ~26 uses | `BulkActionBar` (selection-gated) | Phase 1+ |
| `ContextDrawer` | 647 lines | **Extend into `SlideOver`**, not replace | Phase 0 (decision) |
| `GridJourney` | 10+ views | **Refactor/rename** to `PrimaryGridView` | Phase 0 (refactor) |
| Blocking modals for forms | 4+ dialogs | `SlideOver` | Phase 3D |

## §F — Task Inventory Summary

From `docs/engineering-plans/work-breakdown/00-master-task-registry.md`.

*   **Discrepancy:** Task counts are inconsistent across documents (`master-task-registry.md`: 80, `dependency-graph.md`: 77, `AI-TODO.md`: 108). The CPO audit flags this in finding F13. The 108 count includes 18 backend tasks that are not defined anywhere else.
*   **Phases:**
    *   Phase -1: Wireframes (**Done**)
    *   Phase 0: Foundation (16 frontend tasks + 18 undefined backend tasks)
    *   Phase 1: Pilot - PurchaseOrdersView (9 tasks)
    *   Phase 2: GridJourney Views (8 tasks)
    *   Phase 3A: SalesView Refactoring (12 tasks)
    *   Phase 3B: SalesView Migration (10 tasks)
    *   Phase 3C: IntakeView + DashboardView (6 tasks)
    *   Phase 3D: Remaining Complex Views (10 tasks)
    *   Phase 4: Polish (9 tasks)

## §G — Existing Infrastructure

From `docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md` §5 and `CPO-AUDIT-REPORT.md` §5.

*   **Extend (Do Not Replace):**
    *   `useCommandRunner` & `commandBus.ts` (the single, stable write path)
    *   `useUiStore` (the single, stable Zustand store)
    *   `OperatorGrid` & `mergeColumnDefsWithPrefs` (column prefs work)
    *   `useConfirm` & `ConfirmRoot` (canonical confirmation pattern)
    *   `ContextDrawer` (647 lines, becomes the `SlideOver`)
    *   `GridJourney` (the existing `GridView` template)
    *   `useDrawerUrlSync` (becomes `useViewUrlState`)
    *   19 existing drawer tab components (register, don't rebuild)

*   **Replace/Migrate:**
    *   `WorkspacePanel` (45+ uses) → `SlideOver` tabs / `CollapsibleSection`
    *   `FilterPresetStrip` (16 uses) → `StatusFilterPill`
    *   `StatusActionBar` (26 uses) → `BulkActionBar`
    *   Various dialogs → `SlideOver`

## §H — Gaps Found

From `CPO-AUDIT-REPORT.md` §4 "Planning Completeness".

*   **Missing Specs:** The plan is missing ~95% of specs. Only 4 component specs and 1 template spec exist. Missing are: 27 view specs, ~5 hook specs, ~4 config specs.
*   **Missing Tasks:** The plan has no explicit tasks for error handling, loading states, empty states, per-component accessibility, a per-view mobile plan, deprecated code removal, or data migration. These are bundled into a small Phase 4, which is unrealistic.
*   **Planning Work Remaining:** Per the audit, 15 major planning items remain before Phase 0 can safely start, including the 7 P0 blockers, defining the URL state grammar, creating a per-entity tab inventory, and speccing all the missing components/views/hooks.

## §I — Codebase Reality

From file system checks.

*   **Config Stubs:** The four scaffolded config files listed in `docs/engineering-plans/AGENTS.md` (`entity-schemas.ts`, `entity-actions.ts`, `view-registry.ts`, `entity-column-map.ts`) **do not exist** at `src/client/config/`. The directory is empty.
*   **Shared Types:** The canonical status enum file `src/shared/statuses.ts` **does not exist**. This confirms the CPO audit's P0 blocker F4 is still open. The foundation for the config-driven architecture has not been laid.
