# Mercury Architecture Manifesto

**Branch:** `docs/mercury-ux-retrofit-master-plan`
**Date:** 2026-06-16
**Status:** Backbone. Read this **before** any Phase 0+ implementation.
**Authority chain:** [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md) → [wireframes/DESIGN-RULES.md](./wireframes/DESIGN-RULES.md) → [wireframes/INTEGRATION-MAP.md](./wireframes/INTEGRATION-MAP.md) → **this document** → wireframe `WF-*.md` files → spec sheets.

---

## §0 — What This Document Is

The UX authority documents tell you **what the operator should see**. They do not tell you **what the code must do**. Without that translation, agents implementing tasks read the old codebase, recognize a pattern (a per-view `ColDef` array, a stacked `WorkspacePanel`, a permanent side panel), and replicate it. The retrofit gets a fresh paint job; the architecture stays exactly the same; UX-1 ships violated on day one.

This manifesto converts the 12 UX rules into 12 architecture rules, defines the canonical component hierarchy, names the existing infrastructure that **must be extended (not replaced)**, lists the migrations that are **mandatory (not optional)**, and enumerates the anti-patterns that will not compile, will not pass code review, and will not ship.

The path of least resistance must be the right path. That is this document's only job.

### When this document conflicts with another document

| If… | Then… |
|---|---|
| A wireframe shows a pattern this manifesto forbids | Update the wireframe. The manifesto wins. |
| A spec sheet contradicts an ARCH-N rule | Update the spec. The manifesto wins. |
| `MASTER-EXECUTION-DOCUMENT.md` task AC contradicts an ARCH-N rule | Update the task. The manifesto wins. |
| `mercury-ux-integrated-analysis.md` UX rule contradicts an ARCH-N rule | The UX rule wins. Update the manifesto. |
| `DESIGN-RULES.md` UX rule contradicts an ARCH-N rule | The UX rule wins. Update the manifesto. |

Architecture serves UX. UX does not serve architecture.

---

## §1 — Architecture Principles (ARCH-1 through ARCH-12)

Each ARCH-N rule below is the **code-side** consequence of the matching UX-N rule from [DESIGN-RULES.md v2.0](./wireframes/DESIGN-RULES.md). The UX rule governs what the operator perceives. The ARCH rule governs what the code does. Both must be true.

### ARCH-1 — One data source per view

**UX-1 says:** One primary surface per view. The operator's eye lands in under 1 second.

**ARCH-1 says:** Each view owns **exactly one primary data query** that drives its primary surface. Supplementary data (entity detail, history, related records) is fetched **lazily**, gated on operator action (slide-over open, tab switch, section expand). Views do not pre-fetch panels the operator has not opened.

**What this means in code:**

```tsx
// ✅ Compliant: one primary query drives the grid; entity detail is lazy.
function PurchaseOrdersView() {
  const grid = trpc.queries.grid.useQuery({ view: 'purchaseOrders' });
  const entityId = useViewUrlState('purchaseOrders').entityId;
  // Only fetched when slide-over has an entity:
  const detail = trpc.queries.purchaseOrderDetail.useQuery(
    { id: entityId! },
    { enabled: Boolean(entityId) }
  );
  return <PrimaryGrid view="purchaseOrders" data={grid.data} />;
}

// ❌ Forbidden: 8 simultaneous primary queries (the current SalesView pattern).
function SalesView() {
  const orders = trpc.queries.grid.useQuery({ view: 'sales' });
  const workspace = trpc.queries.customerWorkspace.useQuery(...);
  const suggestions = trpc.queries.salesSuggestions.useQuery(...);
  const purchaseHistory = trpc.queries.customerPurchaseHistory.useQuery(...);
  const photographyQueue = trpc.queries.photographyQueue.useQuery(...);
  const orderLines = trpc.queries.salesOrderLines.useQuery(...);
  const releaseEligibility = trpc.queries.releaseEligibility.useQuery(...);
  const recentSheets = trpc.queries.recentCustomerSheets.useQuery(...);
  // 8 panels rendered side-by-side. UX-1 violated.
}
```

**Compliance check:** A view's top-level render reads from **one** `useQuery` for the primary grid. Any additional `useQuery` is gated on `{ enabled: <user-action-condition> }`. If the gate is `enabled: true` or absent, the data does not belong in this view's render path.

---

### ARCH-2 — State machines drive action visibility

**UX-2 says:** Only show actions that apply to the entity in its current state. Inapplicable actions are **absent**, not disabled.

**ARCH-2 says:** Every entity that has lifecycle status owns a **state machine** declared in `src/client/config/entity-actions.ts` (or its eventual location). The state machine maps `{ entity, status, role } → AllowedAction[]`. UI never hard-codes "show Receive button if status === 'ordered'." UI calls `getAllowedActions({ entity: 'purchaseOrder', status: po.status, role: user.role })` and renders only that result. Disabled buttons are forbidden; the action is in the array or it does not render.

**Server alignment:** Every status string referenced in the state machine must exist in `src/shared/statuses.ts` (canonical enum). Every command guard in `commandBus.ts` must reject actions that the state machine forbids. This invariant is the contract; without it the client and server disagree about what is legal, and operators see "Action failed" toasts for actions the UI offered them.

**What this means in code:**

```ts
// src/client/config/entity-actions.ts
import { PurchaseOrderStatus } from '../../shared/statuses';

export const entityActions = {
  purchaseOrder: {
    [PurchaseOrderStatus.Draft]:    ['saveDraft', 'approveAndFinalize'],
    [PurchaseOrderStatus.Ordered]:  ['draftIntake', 'recordPrepayment', 'cancel'],
    [PurchaseOrderStatus.Received]: ['finalize', 'unfinalize'],
    // …
  },
} as const;
```

```tsx
// ✅ Compliant: action ribbon is the state machine output, nothing else.
function PoActionBar({ po }: { po: PurchaseOrder }) {
  const actions = useEntityActions('purchaseOrder', po.status);
  return <>{actions.map((a) => <ActionButton key={a} action={a} entity={po} />)}</>;
}

// ❌ Forbidden: all actions visible, some disabled.
<button disabled={po.status !== 'ordered'}>Receive</button>
<button disabled={po.status === 'draft'}>Unfinalize</button>
```

**Compliance check:** Grep for `disabled={` on action buttons in new code. Each hit is a bug unless the disable is a loading state on a button that already passed the state machine.

---

### ARCH-3 — Lazy data, lazy mount

**UX-3 says:** Supporting information lives one click away. Permanent reference panels are a design bug except for continuous monitoring of a value tied to the current task.

**ARCH-3 says:** Components for supporting information (tabs in `SlideOver`, collapsible sections, popovers) are **not rendered** when their container is closed. Their data queries are **not issued** until the operator opens them. The "always visible" exception (credit balance during pricing) is implemented as a small Tier 0 strip in the primary surface, not a panel.

**What this means in code:**

```tsx
// ✅ Compliant: tab content + query both gated on tab activation.
function PoSlideOverTabs({ poId }: { poId: string }) {
  const activeTab = useSlideOverActiveTab('po', poId);
  return (
    <Tabs value={activeTab}>
      <TabPanel value="lines">{activeTab === 'lines' && <PoLinesTab poId={poId} />}</TabPanel>
      <TabPanel value="vendor">{activeTab === 'vendor' && <PoVendorTab poId={poId} />}</TabPanel>
      <TabPanel value="history">{activeTab === 'history' && <PoHistoryTab poId={poId} />}</TabPanel>
    </Tabs>
  );
}

// ❌ Forbidden: all tab children mounted, all queries firing.
<TabPanel value="lines"><PoLinesTab poId={poId} /></TabPanel>
<TabPanel value="vendor"><PoVendorTab poId={poId} /></TabPanel>
<TabPanel value="history"><PoHistoryTab poId={poId} /></TabPanel>
```

**The "All checks passed" rule:** A component whose only output during the happy path is text declaring nothing is wrong is **forbidden**. If there is nothing to say, nothing renders. Pre-post validation appears as an inline `severity-warning` strip above the lines grid **only** when issues exist; otherwise it does not exist in the DOM.

---

### ARCH-4 — Progressive disclosure is the default render path

**UX-4 says:** Bulk action bars, detail panels, filter popovers, slide-overs, and modal forms appear only when needed.

**ARCH-4 says:** The first render of every view is the **minimum possible**: filter toolbar + KPI strip + primary grid. The `BulkActionBar`, `SlideOver`, advanced filter popover, and any modal form are mounted only when their trigger condition is true. `useUiStore` selectors that drive these mounts use stable references so an empty selection does not re-mount the bar's children every render.

**Disclosure triggers:**

| Surface | Mounted when… |
|---|---|
| `BulkActionBar` | `selectedRows[view].length > 0` |
| `SlideOver` | `activeDrawerEntityByView[view]` is set **and** `drawerByView[key].state !== 'closed'` |
| Advanced filter popover | Operator clicks "Advanced" in `FilterToolbar`; popover unmounts on close |
| Modal `ConfirmRoot` | Operator triggers a destructive action via `useConfirm()` |
| Inline validation strip | Server returns validation issues for the current draft |

**Compliance check:** Open the React DevTools tree on a freshly loaded view with no selection. The tree should contain `FilterToolbar`, `SummaryStrip`, `PrimaryGrid`, **nothing else** above the grid's row level. If `BulkActionBar`, `SlideOver`, or a popover is in the tree on cold load, that's a bug.

---

### ARCH-5 — Mount budget = attention budget

**UX-5 says:** Three tiers. Tier 0 (always visible) is for what the operator is working on. Tier 1 (one click away) is for what they might need next. Tier 2 is for what they rarely need.

**ARCH-5 says:** A component's **render tier** must match its UX tier. Tier 0 components are mounted on view load. Tier 1 components are mounted on operator action (tab activation, slide-over open). Tier 2 components are mounted on explicit navigation (separate route or popover). A component that is "rarely needed" but always mounted is an architecture bug, even if it is visually hidden.

**Practical guidance:** "Visually hidden" (`display: none`, `visibility: hidden`, off-screen positioning) does not count as Tier 1. The component is still mounted, its queries are still firing, its effects are still running. Tier 1 means "not in the React tree until the operator opens it."

**Exception — credit balance while pricing:** UX-3 admits one exception (continuous monitoring of a task-critical value). The implementation is a **small inline component** (`CustomerCreditPill`) rendered into the primary surface's context header, **not** a `WorkspacePanel`. Continuous monitoring does not justify a panel.

---

### ARCH-6 — URL is the single source of view state

**UX-6 says:** Leaving a view mid-task preserves state. The URL encodes the full state.

**ARCH-6 says:** All view state that survives navigation **must** serialize to URL query params. `useUiStore` is the **session-scoped working state**; the URL is the **navigable, refreshable, shareable state**. State that exists only in `useUiStore` and not in the URL will be lost on refresh, share, browser back, or any browser-managed state restore.

**What must be in the URL:**

| State | Today | Required |
|---|---|---|
| Open slide-over entity (`entityType`, `entityId`) | ✅ via `useDrawerUrlSync` | extend |
| Slide-over drawer state (`closed | peek | standard | wide | focus`) | ✅ via `useDrawerUrlSync` (param: `drawer`) | preserve |
| Active slide-over tab | ❌ | **add** (param: `tab`) |
| Active filter (simple or compressed advanced) | ❌ | **add** (param: `f`, compressed) |
| Active `ViewTabBar` status filter | ❌ | **add** (param: `status`, comma-separated multi-select) |
| Active row selection (for shareable bulk operations) | ❌ | **add** (param: `sel`, optional) |
| Pagination cursor (when grids paginate) | ❌ | **add** (param: `cur`) |

**Compliance check:** Open any view in the new code, change every aspect of state, copy the URL, paste into a fresh tab. The view should render identically. If anything differs, it is not in the URL and ARCH-6 is violated.

**URL grammar** is owned by a new hook `useViewUrlState(view)` that wraps the existing `useDrawerUrlSync` and adds filter/tab/selection serialization. See the URL grammar reference: [docs/engineering-plans/url-grammar.md](./url-grammar.md) (to be written under CPO audit P1 #9).

---

### ARCH-7 — Mutations are immediate and in-place

**UX-7 says:** Operators never wonder "did it work?" Feedback at the point of action.

**ARCH-7 says:** All mutations go through `useCommandRunner` (already canonical, do not bypass). Feedback patterns:

| Mutation surface | Feedback mechanism |
|---|---|
| Cell-level inline edit | Optimistic update on commit; green checkmark flash on the cell ~600ms; rollback + red left border on failure |
| Bulk action via `BulkActionBar` | Inline progress in the bar; per-row success/failure summary; selection cleared on full success, preserved with failure marks otherwise |
| Slide-over form submit | Inline success row above form; form stays open with values intact; explicit "Done" closes |
| Destructive action | `useConfirm()` modal → command → in-place row update; never navigate to a confirmation page |

**Targeted cache invalidation:** `useCommandRunner` already invalidates only the queries referencing `affectedIds` (see `buildAffectedQueryPredicate` in `src/client/components/useCommandRunner.ts`). Do not invalidate the entire cache; do not refetch the grid after every mutation. The targeted invalidation is load-bearing.

**Forbidden:**

- Toasts as the **only** confirmation of a routine action (they vanish before the operator's eye reaches them).
- `window.confirm()`. Use `useConfirm()`.
- `window.alert()`. Use inline error states.
- Navigation to a confirmation page after a command.

---

### ARCH-8 — Templates render the primary surface; chrome is allocated, not negotiated

**UX-8 says:** The table IS the view (70–80% of visual weight). Chrome recedes.

**ARCH-8 says:** Views do not lay out chrome themselves. They render a **template** (`PrimaryGridView`, `MasterDetailView`, `DashboardView`, `WizardView`) that already enforces the chrome budget:

```
PrimaryGridView template:
  ├─ FilterToolbar     (height ≤ 48px)
  ├─ SummaryStrip      (height ≤ 56px, optional)
  ├─ PrimaryGrid       (flex-1 — claims remaining height)
  ├─ SlideOver         (mounted iff active entity)
  └─ BulkActionBar     (mounted iff selection > 0)
```

A view's responsibility is **what** the primary surface shows (entity schema, view key, summary metrics), not **how** the chrome lays out. If a view needs custom chrome, it is almost certainly violating UX-1 or UX-8 and should be reviewed.

**Compliance check:** Grep new view files for layout primitives (`grid-cols-`, `flex-row`, custom `style={{ height: }}`). A compliant view file should be ~50–200 lines, mostly configuration and data wiring. Views > 500 lines are suspect; SalesView at 1986 lines is the canonical anti-pattern.

---

### ARCH-9 — Error states are first-class data

**UX-9 says:** Failures are foregrounded. Recovery feels like a safety net.

**ARCH-9 says:** Error views (RecoveryView, failed payments, posting failures) treat **failures as the primary data**. The primary grid query is the error log itself, filtered to the active operator's scope. Admin tools, command catalogs, snapshot diffs, and other power-user surfaces live in Tier 2 (separate route or settings tab), not in the error view.

**Command context in errors:** Every error row carries enough context to attempt remediation without opening a slide-over:

- Command name (human label via `commandLabelFor`)
- Affected entity link (clicks to its slide-over)
- Reason text (one line; full payload behind "Show details")
- Inline `Retry` button when the error is retriable per the state machine

**Slide-over deepens this:** clicking a row opens a `SlideOver` with `Details`, `Recent activity`, `Logs` tabs. The slide-over is for diagnosis. The row is for action.

---

### ARCH-10 — Dashboard is a composition of typed widgets

**UX-10 says:** Dashboard answers three questions in three zones.

**ARCH-10 says:** `DashboardView` is implemented as a **template that composes typed widgets**, not as a `WorkspacePanel` grid. Widgets are pure components with their own data source and their own UX tier:

```tsx
<DashboardView>
  <DashboardZone tier={0} layout="welcome">
    <WelcomeStrip />
    <QuickActionsRow />
    <KpiStrip metrics={['cash', 'open_orders', 'overdue', 'pending']} />
  </DashboardZone>
  <DashboardZone tier={1} layout="recovery">
    <MyDraftsList />
    <RecentActivityFeed />
  </DashboardZone>
  <DashboardZone tier={2} layout="situational">
    <FocusList />
    <PendingQueuesList />
  </DashboardZone>
</DashboardView>
```

A dashboard is **not** an arbitrary panel grid where every panel has equal weight. Widgets declare their tier; the template arranges them; the operator's eye lands on the Tier 0 zone.

**Forbidden:** A new dashboard widget that is a `WorkspacePanel` wrapper. New widgets are typed components.

---

### ARCH-11 — One section expanded per group; sections are first-class state

**UX-11 says:** Collapsible sections over competing panels; one expanded at a time.

**ARCH-11 says:** Multi-section views (SalesView, IntakeView, RecoveryView) compose `<CollapsibleSection>` components in groups. Groups enforce **single-expansion**: opening one collapses the others in the same group. Section open state is part of view state (per ARCH-6: serialized to URL when meaningful) and per-view in `useUiStore` for ephemeral session state.

**Tabs in a slide-over satisfy UX-11 better than collapsibles in the main view.** A supplementary view (vendor profile, customer credit) belongs in a `SlideOver` tab, not a `CollapsibleSection` in the primary surface. Use collapsibles only when the operator needs the supplementary content **alongside** the primary surface (Suggestions in SalesView, where the operator may switch between Orders and Suggestions while building a sale).

---

### ARCH-12 — Cell editors commit through `useCommandRunner`; forms are atomic

**UX-12 says:** Cell-level edits save immediately. Multi-field forms have explicit save.

**ARCH-12 says:** A cell editor is a component that commits on `Enter` or `blur` by calling `runCommand(...)`. It does not own its own mutation; it does not bypass the command bus; it does not save through a side channel. The cell editor's `cellRendererParams` declare which command, which entity, and which field; the editor wires the commit. This is the contract; deviations break command journal integrity.

Forms (slide-over forms, new-entity wizards) are atomic: a single `runCommand(...)` per submit. A form with per-field auto-save is a forbidden mixed pattern; either it is a form (atomic) or it is a collection of cell editors (each atomic).

**Compliance check:** Grep new editor components for `fetch(`, `trpc.commands.<X>.useMutation()` outside of `useCommandRunner`. Each hit is a bug.

---

## §2 — Component Hierarchy

The canonical hierarchy is a single shape, enforced by templates. Views fill in the slots. Slide-over and bulk-action surfaces appear only when their gates open.

### §2.1 — Canonical PrimaryGridView shape

```
PrimaryGridView (template; receives `view`, `entitySchema`, optional summary config)
├── FilterToolbar (always present, max height 48px)
│   ├── StatusFilterPill (multi-select popover; replaces FilterPresetStrip)
│   ├── KeywordSearchInput
│   ├── SavedViewsDropdown
│   ├── AdvancedFilterTrigger ("Advanced" button — opens popover)
│   └── DensityToggle (compact / standard / comfortable)
├── SummaryStrip (≤ 4 KPI cards; optional; max height 56px)
├── PrimaryGrid (flex-1; the entity table; 70–80% of viewport)
│   ├── ColDef array sourced from entity-schemas.ts (not view-defined)
│   ├── Row click → opens SlideOver via setDrawerEntity()
│   ├── Cell editors via ComboboxCellEditor / TextCellEditor (commit via useCommandRunner)
│   └── Selection sets selectedRows[view] in useUiStore
├── SlideOver (mounted iff activeDrawerEntityByView[view] is set)
│   ├── Header (entity title + status pill + close button)
│   ├── Tabs (sourced from entity-tabs registry, role-gated)
│   │   └── Lazy-mounted; each tab's query gated on activation (ARCH-3)
│   └── ActionBar (bottom-anchored; rendered from entity-actions state machine — ARCH-2)
└── BulkActionBar (mounted iff selectedRows[view].length > 0)
    ├── Replaces SummaryStrip visually (same row; SummaryStrip hidden while bar mounted)
    ├── Action buttons sourced from entity-actions intersection across selected rows
    └── Cancel button clears selection
```

### §2.2 — Per-component contract

Each entry below names: what it replaces, what it MUST NOT do, what state it owns/encodes.

#### `PrimaryGridView` (template)

- **Replaces:** view-level layout in every view file (currently each view defines its own JSX shell).
- **Must NOT:** define a `ColDef[]` array inline; render multiple `<Grid>` instances; render `WorkspacePanel` children.
- **State encoded:** none directly; delegates to children.

#### `FilterToolbar`

- **Replaces:** `FilterPresetStrip`, `SavedFiltersDropdown`, `AdvancedFilterBuilder` (as inline side panel), `Grid quick filter text box` (the AG Grid filter widget).
- **Must NOT:** mount the advanced filter builder by default; serialize "complex" filters lossily (the bridge is one-way coercive per CPO audit F7); render outside `PrimaryGridView`.
- **State encoded (URL):** `f` (active filter), `status` (multi-select status pill), `view` (saved view ID), `q` (keyword search).

#### `StatusFilterPill` (component inside `FilterToolbar`)

- **Replaces:** the `FilterPresetStrip` (~16 use sites) and ad-hoc status tabs (`PaymentsView` status pills, etc.).
- **Must NOT:** render as full tabs ("Today | Yesterday | This Week" tab bars are a UX-9 violation when used for filtering); auto-select on view mount unless explicit URL state requests it.
- **State encoded (URL):** `status` (comma-separated multi-select); count badges fetched from `queries.statusCounts`.

#### `SummaryStrip`

- **Replaces:** scattered KPI tiles in `WorkspacePanel`s; per-view summary calculations.
- **Must NOT:** render more than 4 cards; mount on dashboards (use `KpiStrip` widget there).
- **State encoded:** none. Data from `queries.gridSummary`.

#### `PrimaryGrid`

- **Replaces:** `OperatorGrid` invocation inside `GridJourney` (this is the surface; `GridJourney` evolves into the typed `PrimaryGridView` template).
- **Must NOT:** receive view-defined `ColDef[]`; render its own filter/summary chrome; mount multiple instances per view.
- **State encoded:** row selection → `selectedRows[view]` in `useUiStore`; column prefs → `gridColumnPrefs[tableKey]` (preserved from existing infra).

#### `SlideOver`

- **Replaces:** `ContextDrawer` (extended, not deleted — see §5), `InspectorDrawer`, `RecordPrepaymentDialog`, `RefereeDialog`, `RefereeRelationshipDialog`, `RefereeDetailPanel`, `MediaBatchDrawer`, `ProcessorDetailPanel`, `RowCommandHistoryDrawer`, `IssueSidecar`, `RelationshipDrawer`, `ReceiptPreviewOverlay`, `EditCreditLimitModal` (when used for non-confirmation forms).
- **Must NOT:** be mounted simultaneously with another `SlideOver` (one at a time per view); be used for destructive confirmations (those are `ConfirmRoot` via `useConfirm`); hard-code its tab list (tabs come from a registry).
- **State encoded (URL):** `entityType`, `entityId`, `drawer` (state name), `tab` (active tab). All four already partially handled by `useDrawerUrlSync`; the `tab` param is the new addition.

#### `ActionBar` (inside `SlideOver`)

- **Replaces:** ad-hoc footer buttons in every drawer; per-view action button arrays.
- **Must NOT:** render disabled buttons; hard-code action lists; bypass `useCommandRunner`.
- **State encoded:** none. Actions sourced from `getAllowedActions({ entity, status, role })`.

#### `BulkActionBar`

- **Replaces:** `StatusActionBar` (~26 use sites) and per-view bulk action UI.
- **Must NOT:** render when no rows are selected; render actions outside the intersection of `getAllowedActions` for every selected row's status; dispatch commands except through `commands.runBulk` (new procedure).
- **State encoded:** none. Reads from `selectedRows[view]` in `useUiStore`.

#### `KpiStrip` and other dashboard widgets

- **Replaces:** the eight stacked `WorkspacePanel`s on the dashboard.
- **Must NOT:** be wrapped in `WorkspacePanel`; be reused outside `DashboardView`.
- **State encoded:** drill-down target → `drilldown` param in URL.

### §2.3 — What does NOT belong in this hierarchy

| Pattern | Why forbidden | Use instead |
|---|---|---|
| Two `PrimaryGrid` siblings | UX-1: one primary surface | Tabs in `ViewTabBar` (filter) or split into two views |
| `WorkspacePanel` as a child of `PrimaryGridView` | UX-3: no permanent context panels | `SlideOver` tab or `CollapsibleSection` |
| `ContextDrawer` and `SlideOver` mounted simultaneously | Migration ambiguity; double mount | Choose one per view (during migration: `SlideOver` lives behind a feature flag; until flag is enabled in the view, `ContextDrawer` is the surface) |
| `SlideOver` inside a `SlideOver` | Mercury never nests overlays | Open a new entity in the existing slide-over via `setDrawerEntity` |
| Inline modal dialog for a routine action | UX-6: modals are for confirmations | `SlideOver` |
| `BulkActionBar` and `SummaryStrip` rendered together | Visual conflict (same row) | Bar takes precedence; strip hides while selection > 0 |

---

## §3 — Data Flow Rules

### §3.1 — One primary query per view

- Each view's primary surface is backed by **one** `useQuery`. For a `PrimaryGridView`, that is `trpc.queries.grid.useQuery({ view })`. For a dashboard widget, that is one query per widget.
- Today's `queries.grid({ view })` does not accept filter/sort/group params. **It must be extended** (CPO audit F5, T-B-05) to accept `{ view, filter?, sort?, group?, cursor? }`. Filter input is the existing `FilterGroupInput` type from `src/shared/filterSchemas.ts`.
- Until that extension ships, views may pass filter state to the client (AG Grid filters as today) but new views **must** route filter changes through `useViewUrlState` so the URL captures them, ready for server-side filtering when the extension lands.

### §3.2 — Supplementary queries are gated

- Entity-detail queries (slide-over tab content, history, related records) are issued **only** when the slide-over is open and the tab is active.
- Use `{ enabled: <gate-condition> }` on every supplementary `useQuery`. Search for `useQuery(` without a `{ enabled: }` option in new code; flag any non-primary query without one.
- Pre-fetching is forbidden. Mercury does not pre-fetch; neither does this app.

### §3.3 — Entity schemas drive column definitions

- `src/client/config/entity-schemas.ts` (to be created — CPO audit P1 #14) is the **single source** of field definitions per entity type. It declares: field key, label, type, formatter, editability, role-gating, default visibility, default width, default pin.
- `useColumnDefs(entity)` builds AG Grid `ColDef[]` from the schema, merging operator preferences via the existing `mergeColumnDefsWithPrefs`.
- Views **never** declare `ColDef[]` arrays. Today's `columnsByView` map in `src/client/views/operations/shared.tsx` is the migration target; per-entity sections move into `entity-schemas.ts`.
- Cell editors come from the schema's `editor` field: `'text' | 'numeric' | 'date' | 'combobox' | { type: 'combobox', source: 'queries.comboboxOptions', params: {…} }`.

### §3.4 — Entity actions drive button rendering

- `src/client/config/entity-actions.ts` (to be created — CPO audit P0 #1 status enums depend on this) is the **single source** of state machines.
- `useEntityActions(entity, status, role?)` returns the array of allowed action names. UI maps that array to `<ActionButton>` instances.
- Server-side: every command in `commandBus.ts` must validate that the source state is in the entity's allowed transitions. Client-allowed but server-rejected is a contract bug.

### §3.5 — One Zustand store: `useUiStore`

- `useUiStore` (738 lines today) already contains all the view-state slices: `drawerByView`, `gridFilters`, `gridAdvancedFilters`, `gridColumnPrefs`, `lastUsedDrawerStateByView`, `selectedRows`, `activeDrawerEntityByView`.
- **Do not create new stores.** New view state goes into `useUiStore` as additional slices, partitioned per view where appropriate.
- The store is already correctly partializing entity UUIDs out of persisted state (per CPO audit decision C11). Preserve this; do not persist entity UUIDs.

### §3.6 — All mutations through `useCommandRunner`

- The 154-command `commandBus.ts` is the single write path. `useCommandRunner` is the single client wrapper.
- Bulk mutations (multi-row actions from `BulkActionBar`) go through the new `commands.runBulk(...)` procedure, which iterates rows server-side with per-row idempotency keys. Client never issues N parallel single-command mutations to simulate bulk.
- WebSocket broadcasts and command journal entries are produced by `commandBus.ts`; the client receives invalidation events through the existing tRPC subscription path (`src/server/routers/subscriptions.ts`).

### §3.7 — Server-side filter application

- The existing server filter logic in `src/server/routers/filters.ts` is preserved. The extended `queries.grid` procedure accepts `FilterGroupInput` and applies it via the same engine.
- The "filter bridge" between simple `FilterToolbar` filters and advanced `FilterGroupInput` is **one-way coercive** (CPO audit F7): complex filters are preserved unchanged; the simple toolbar can read but not modify them (it shows a "Switch to advanced to edit" prompt instead). Do not attempt lossless round-trip.

---

## §4 — Migration Map (Old → New)

Every old pattern listed here is **mandatory to remove** by the end of the phase listed. The replacement is the **only** sanctioned approach.

| Old Pattern | Where (file or count) | Replacement | Phase | Mandatory Because |
|---|---|---|---|---|
| Per-view `ColDef[]` arrays | `columnsByView` in `src/client/views/operations/shared.tsx`; inline arrays in `SalesView.tsx`, `PurchaseOrdersView.tsx`, `PaymentsView.tsx`, others | `src/client/config/entity-schemas.ts` → `useColumnDefs(entity)` | Phase 0 + per-view in Phase 1–3D | UX-8 (table IS the view) requires consistent column behavior; per-view drift is the source of "inline edit saves on this column but not that one" |
| Per-view `StatusActionTable` decision logic | Used by `StatusActionBar` in 26+ view files | `src/client/config/entity-actions.ts` + `useEntityActions(entity, status)` | Phase 0 + per-view | UX-2 (state-gated actions) requires a single source of truth for "what's allowed in this state"; per-view tables diverge from `commandBus.ts` over time |
| Per-view inline cell renderers in `useMemo` | `SalesView.tsx` has 7 inline closures over view state (DisplayNameCell, BatchCodeCell, MarkupCell, DerivedCogsCell, PickStatusCell, WhyShownCell, LandedCostExceptionCell) | Stable component exports + `cellRendererParams` from entity-schemas | Phase 3A (HARD GATE) | Inline renderers force `useMemo` over view-state objects → identity churn → AG Grid re-renders → cell-edit state loss |
| `WorkspacePanel` (`src/client/components/WorkspacePanel.tsx`, 45+ uses) | `DashboardView` (13), `SalesView` (10), `MatchmakingView` (9), `VendorPayablesView` (7), `IntakeView` (3), `RecoveryView` (3), others | (1) Tab in `SlideOver` for entity-scoped content. (2) `CollapsibleSection` for supplementary surfaces. (3) Typed dashboard widget for `DashboardView`. (4) Deleted entirely when the panel's content is a UX-5 design bug (always-visible Tier 1/Tier 2 content). | Phase 1–3D per view; full removal in Phase 4 | UX-3 (context on demand): a wrapper that presents content as always-visible IS the problem; the visual chrome is identical to the content, so the chrome must go |
| `FilterPresetStrip` (`src/client/components/templates/FilterPresetStrip.tsx`, ~16 uses) | Multiple views as the bulk filter tab bar | `StatusFilterPill` (multi-select popover) inside `FilterToolbar`; **not** as tabs | Phase 1 (pilot in `PurchaseOrdersView`); per-view in Phase 2–3D | UX-9 (filtering is fluid, navigation is durable): tabs imply mode change; status is a filter, not a mode |
| `StatusActionBar` (`src/client/components/templates/StatusActionBar.tsx`, ~26 uses) | Per-view inline ribbon | `BulkActionBar` (mounted on selection > 0) using `entity-actions.ts` decision logic | Phase 1 + per-view | UX-1 (one primary surface): a permanently visible action ribbon competes with the grid for attention; UX-2 (state-gated) requires the ribbon's contents to depend on selection state, not view state |
| Permanent pre-post validation panel | `SalesView.tsx` (renders "All checks passed" 90% of the time) | Inline `severity-warning` strip above the lines grid, conditionally rendered only when issues exist | Phase 3A | UX-5: "All checks passed" is the named example of habituating Tier 0 noise |
| Blocking modals for routine forms | `RecordPrepaymentDialog`, `RefereeDialog`, `RefereeRelationshipDialog`, `EditCreditLimitModal` (when used for editing, not confirming) | `SlideOver` | Phase 3D | UX-6 (state survives context switches): blocking modals lose the operator's place; slide-overs preserve it |
| `ContextDrawer` (`src/client/components/ContextDrawer.tsx`, 647 lines) | Used by SalesView, PurchaseOrdersView, OrdersView, others | **Extended into `SlideOver`**, not replaced (see §5). The 5-state model (`closed | peek | standard | wide | focus`) is preserved or narrowed to 4 states with `focus` removed — decision to be made under CPO audit P0 #3 | Phase 0 (decision); Phase 1+ (migration per view) | The 647 lines already implement URL sync, focus trap, drawer state, tab routing. Re-implementing from scratch is the bug. |
| `InspectorDrawer` (bottom-anchored tabs in OrdersView via `GridJourney`'s `inspectorTabs` prop) | OrdersView only currently | Fold into `SlideOver` as right-side drawer with the same tab content; `GridJourney`'s `inspectorTabs` prop is removed | Phase 2 | UX-1 (one primary surface): a bottom drawer + slide-over creates two competing supplementary surfaces |
| `GridJourney` (`src/client/views/operations/shared.tsx:247`, used by 10+ views) | The existing "GridView template" | **Renamed and refactored** to `PrimaryGridView`. Same shape; new template signature consumes `entitySchema` instead of inline `columns`/`actions`. | Phase 0 (template refactor); Phase 2 (per-view migration) | The audit's biggest finding: a working template already exists. Wrap it, evolve it, do not parallel-build. |
| Per-view tRPC procedures | `customerWorkspace`, `salesSuggestions`, `customerPurchaseHistory`, `recentCustomerSheets`, `releaseEligibility`, `poContextSignals`, `vendorRelationship`, etc. (~30+ procedures) | Entity-scoped procedures grouped by router (e.g., `sale.grid()`, `sale.suggestions()`, `customer.purchaseHistory()`, `purchaseOrder.contextSignals()`). Existing procedures **stay** for one release cycle; new code calls the entity-scoped names. | Phase 0–4 (ongoing rename) | Discoverability, role-gating consistency, and IDE autocomplete; not a behavior change |
| Eight stacked `WorkspacePanel`s on dashboard | `src/client/views/DashboardView.tsx` (13 `WorkspacePanel` mounts) | 3-zone `DashboardView` template with typed widgets (`WelcomeStrip`, `QuickActionsRow`, `KpiStrip`, `MyDraftsList`, `RecentActivityFeed`, `FocusList`, `PendingQueuesList`) | Phase 3C | UX-10 (launchpad not control tower); the panel sequence has no visual hierarchy |
| `useState` for global view state | Various views (filter chips, selected entity, expanded sections in `WorkspacePanel`) | Slice in `useUiStore` + URL serialization via `useViewUrlState` | Phase 1+ (per-view migration) | UX-6 (state survives navigation): component-local state evaporates on navigation |

---

## §5 — Existing Infrastructure to Leverage

**The single biggest planning gap (per [CPO-AUDIT-REPORT.md](./CPO-AUDIT-REPORT.md) Finding #2) is that ~70% of the existing infrastructure already implements what the plan calls "build from scratch."** This section names every load-bearing system. **Extend, do not replace.**

### §5.1 — Stable, do not touch

These systems are mature, tested, and the canonical pattern. New code uses them directly.

| System | Files | Why stable |
|---|---|---|
| `useCommandRunner` | `src/client/components/useCommandRunner.ts` (245 lines) | The single write path. Already targeted-invalidates by `affectedIds`. All mutations go through it. |
| `commandBus.ts` | `src/server/services/commandBus.ts` (8063 lines, 154 commands) | Idempotency keys, command journal, snapshot capture, socket broadcasts. The retrofit must not invent a side channel. |
| `OperatorGrid` | `src/client/components/OperatorGrid.tsx` (1092 lines) | AG Grid wrapper. Column-prefs merge via `mergeColumnDefsWithPrefs` already works. |
| `useConfirm()` + `ConfirmRoot` | `src/client/hooks/useConfirm.ts` + `src/client/store/confirmStore.ts` | The only sanctioned destructive-confirmation pattern. Never `window.confirm`. |
| `useFocusTrap` | `src/client/hooks/useFocusTrap.ts` | Use in all modal/slide-over components. Already used in `ContextDrawer`. |
| `entityTimeline` query | `src/server/routers/queries.ts:1144` | Mature, role-aware, cross-entity history. The canonical "History" tab data source. |
| `commandCatalog` | `src/shared/commandCatalog.ts` | Canonical command labels. State machines reference command names from here. |
| `filterSchemas` | `src/shared/filterSchemas.ts` | `FilterGroupInput` type. Server-side filter application in `filters.ts`. Filter bridge respects this as source of truth. |
| `APP_LOCALE` formatting | `src/client/utils/format.ts` | ESLint-gated. Never raw `toLocale*`. |
| Drawer tab components | `src/client/components/drawerTabs/*.tsx` (19 components) | `PoLinesTab`, `PoVendorTab`, `PoHistoryTab`, `EntityTimelineTab`, `LotMovementTab`, `LotPhotosTab`, `VendorBillDetailsTab`, etc. Register these in the new tab registry; do not rebuild. |

### §5.2 — Extend, do not replace

These systems mostly implement what the retrofit needs. The plan calls some of them "deprecated" — they are not. They are the starting point.

#### `ContextDrawer` → `SlideOver`

- **Today:** `src/client/components/ContextDrawer.tsx` (647 lines). Five states (`closed | peek | standard | wide | focus`). Tabs sourced from a hard-coded `drawerTabs` map (10 entity types). Wired to `drawerByView` in `useUiStore`. URL-synced via `useDrawerUrlSync`. Focus-trapped.
- **Strategy:** **Refactor in place** (preferred per CPO audit P0 #3). Rename to `SlideOver`. Replace the hard-coded `drawerTabs` map with a tab registry sourced from `src/client/components/tabs/registry.ts`. Decide on the 5th state (`focus`) — either preserve it as the wide modal-ish mode or remove if no view depends on it.
- **What this means:** Do not write a new `DetailSlideover.tsx` next to `ContextDrawer.tsx`. There is only one. The spec sheet at `docs/engineering-plans/specifications/components/detail-slideover.md` describes the **target** shape of the existing `ContextDrawer` after refactor.

#### `GridJourney` → `PrimaryGridView`

- **Today:** `src/client/views/operations/shared.tsx:247` (factory function). Used by 10+ views via the `columnsByView` map. Already wires `OperatorGrid` + `useCommandRunner` + `useUiStore.selectedRows`. Accepts `inspectorTabs` prop (which folds into `SlideOver`).
- **Strategy:** **Refactor and rename** to `PrimaryGridView`. New signature accepts `entitySchema` (resolves columns via `useColumnDefs`) instead of `columns` array. The `actions`, `prelude`, `selectionActions`, `inspectorTabs` props are removed; their content moves to: `ActionBar` (in `SlideOver`), `FilterToolbar` (for prelude), `BulkActionBar` (for selectionActions), and `SlideOver` tabs (for inspectorTabs).
- **What this means:** The "Phase 2 GridJourney migration of 10 simple views" is a template-signature update, not a rewrite.

#### `useDrawerUrlSync` → `useViewUrlState`

- **Today:** `src/client/hooks/useDrawerUrlSync.ts` (80 lines). Encodes `drawer`, `entityType`, `entityId` as URL params. Reads on mount, writes on change (replace, not push).
- **Strategy:** **Wrap and extend** into `useViewUrlState(view)`. New params: `tab` (active slide-over tab), `status` (multi-select status filter), `f` (filter group, compressed), `sel` (selection, optional), `cur` (pagination cursor). The existing `drawer`/`entityType`/`entityId` logic moves into the wrapper unchanged.
- **What this means:** The URL grammar work (CPO audit P1 #9) writes a new hook **around** `useDrawerUrlSync`, preserving the existing param shape for backward compatibility.

#### `useUiStore` slices

- **Today:** `src/client/store/uiStore.ts` (738 lines). Contains `drawerByView`, `gridFilters`, `gridAdvancedFilters`, `gridColumnPrefs`, `lastUsedDrawerStateByView`, `selectedRows`, `activeDrawerEntityByView`. Partialized correctly (entity UUIDs excluded).
- **Strategy:** **Add slices for new state** (status filter, active tab per slide-over, pagination cursor, section open state where it affects layout). Do not create new stores. Preserve the `partialize` exclusions.

#### Drawer tab components

- **Today:** 19 components in `src/client/components/drawerTabs/`. Cover PO, salesOrder, lot, vendorBill, payment, unified `EntityTimelineTab`.
- **Strategy:** **Register, do not rebuild.** The new `src/client/components/tabs/registry.ts` maps `entityType` → `Tab[]` where each `Tab` declares `{ key, label, component, requiresRole?, requiresStatus? }`. The 19 components plug in by key.
- **Missing tabs** (per CPO audit F6 — must be inventoried before Phase 1): customer set (Purchase History, Photography, Credit, Overview), Inventory Finder (`entityType="finder"`), SalesOrder Vendor tab, Receipt preview tab. These are **NEEDS_BUILD**; everything else is **EXISTS** or **NEEDS_REFACTOR**.

### §5.3 — Migrate or remove

These exist but represent the patterns being retired. Do not extend them; route new work through the replacement.

| Component | Disposition |
|---|---|
| `WorkspacePanel` | Migrate use sites per §4. Remove the component in Phase 4 once usage is zero. |
| `FilterPresetStrip` | Migrate use sites to `StatusFilterPill` inside `FilterToolbar`. Remove in Phase 4. |
| `StatusActionBar` | Migrate use sites to `BulkActionBar`. Decision-table logic moves to `entity-actions.ts`. Remove in Phase 4. |
| `RecordPrepaymentDialog`, `RefereeDialog`, `RefereeRelationshipDialog`, `EditCreditLimitModal` (edit mode) | Migrate to `SlideOver`. Remove the dialog components in Phase 4. |
| `AdvancedFilterBuilder` (when used as inline side panel) | Repurpose as the popover behind `FilterToolbar`'s "Advanced" button. Remove inline use sites. |
| `InspectorDrawer` | Fold OrdersView use into `SlideOver`. Remove. |

---

## §6 — Anti-Pattern Rewrite Rules

These patterns will not pass code review. Each entry names the bad pattern and the correct shape.

### §6.1 — Frontend anti-patterns

| ❌ Anti-pattern | ✅ Correct pattern |
|---|---|
| `style={{ color: '#b42318' }}` | Semantic CSS class: `className="text-severity-error"` or status pill class from `status-pill-{open|posted|…}` |
| `test.skip(true, '…')` or `it.skip(…)` | Either self-create the test fixture (preferred) or delete the test with rationale in commit message |
| `<button disabled={!eligible}>Coming soon</button>` | Hide the button until the feature ships. Disabled stubs are forbidden. |
| Per-view `useMemo` with inline cell renderer closing over view state | Stable component export referenced via `cellRendererParams` in `entity-schemas.ts` |
| `useState` for global view state (active filter, open entity, selection) | Slice in `useUiStore`; URL via `useViewUrlState` if it survives navigation |
| Multiple `SlideOver` instances mounted simultaneously | Exactly one `SlideOver` per view; opening a new entity replaces the existing entity in the same slide-over |
| `<WorkspacePanel title="...">` wrapping anything | Either: tab in `SlideOver`, `CollapsibleSection`, typed dashboard widget, or **delete the wrapper** (if content is a UX-5 bug) |
| `window.confirm(...)` / `window.alert(...)` | `useConfirm()` for destructive confirmations; inline error states for failures |
| Toast as the sole confirmation of a routine mutation | Inline feedback at the point of mutation (cell flash, row update, slide-over success row) |
| `trpc.commands.<X>.useMutation()` called directly outside `useCommandRunner` | `const { runCommand } = useCommandRunner(); await runCommand('X', payload);` |
| Cell editor that owns its own mutation (saves via `fetch` or direct `useMutation`) | Cell editor's `cellRendererParams` declares command name; editor commits via `useCommandRunner` on `Enter`/`blur` |
| Layout primitives in view files (`grid-cols-`, `flex-row` outside the template) | View renders only `<PrimaryGridView>` (or its sibling templates). All chrome is template-owned. |
| Inline `<button>` action ribbon in a view | `ActionBar` inside `SlideOver` (sourced from `useEntityActions`) or `BulkActionBar` (sourced from selection × `useEntityActions`) |
| Toast-style notification for a real validation error | Inline `severity-warning` strip above the offending input + red left border on the input |
| Permanent "everything is fine" indicator (e.g., "All checks passed" panel) | Component is **not rendered** when there is nothing to say. ARCH-3 forbids the panel. |
| Raw `toLocaleDateString` / `toLocaleString` | `formatDate` / `formatCurrency` / `formatNumber` from `src/client/utils/format.ts` (uses `APP_LOCALE`) |
| Mounted but visually hidden component to "preload" data | `useQuery({ enabled: <gate> })` from a parent at the moment the operator triggers the gate |
| Per-view `tRPC` query that duplicates what `queries.entityTimeline` provides | Use `queries.entityTimeline` directly via `EntityTimelineTab` |

### §6.2 — Backend anti-patterns

| ❌ Anti-pattern | ✅ Correct pattern |
|---|---|
| `protectedProcedure` with no role check inside | Every new procedure either documents why public access is acceptable or uses `ctx.user.role` for explicit gating |
| `publicProcedure` for any new data query | New queries are `protectedProcedure` by default |
| N+1 queries for grid data | Single query with joins/aggregation. `queries.grid({ view, filter, sort })` returns rows + total in one round trip |
| Unfiltered `SELECT *` in the grid procedure | Explicit column projection; respect `filter` and `sort` input |
| New tRPC procedure per view's specific data needs | Entity-scoped routers (`sale.grid`, `customer.purchaseHistory`, `purchaseOrder.contextSignals`); views compose from entity routers |
| Missing Zod input validation | Every procedure has a Zod `input(z.object({…}))` (use `z.never()` only for no-input queries explicitly) |
| Bypassing `commandBus.executeCommand` for "simple" updates | All writes go through `commandBus`, including "simple" status changes. The journal, snapshot, and broadcast guarantees are non-negotiable. |
| Bulk operation as N client-issued single mutations | Server-side `commands.runBulk` with per-row idempotency keys and a single transactional envelope (decision: all-or-nothing transaction; partial success reporting per CPO audit F5) |
| Hard-coded status strings inside `commandBus.ts` case statements | Import from `src/shared/statuses.ts`. Constants only. |
| WebSocket broadcast on every mutation regardless of impact | Broadcast `affectedIds` only; client filters via `buildAffectedQueryPredicate` |
| New procedure with no test under `src/server/routers/*.test.ts` | Mirror the existing per-procedure test convention; cover at minimum the happy path and a role-gating failure case |

### §6.3 — Database / schema anti-patterns

| ❌ Anti-pattern | ✅ Correct pattern |
|---|---|
| New `varchar('status', { length: 32 })` column with hard-coded default | Reference canonical status enum in `src/shared/statuses.ts`; pair with `CHECK` constraint or `pgEnum` (decision per CPO audit P0 #4) |
| Migration without a documented rollback | Every migration ships with a `down` migration or an explicit rationale in the migration file header for why rollback is irreversible |
| `db.query(...)` from frontend code | Frontend never touches the DB. tRPC is the only interface. |
| Schema change without a migration file | All schema changes go through migrations applied via `migrate.ts`. No `drizzle-kit push` against production. |
| New table without `created_at`, `updated_at`, `id` (UUID), and tenant scope where applicable | Adopt the existing convention from `src/server/schema.ts` |
| Bulk command journal entries written outside `commandBus` | Journal entries are exclusively produced by `commandBus.executeCommand`. `runBulk` calls into `executeCommand` per row. |

### §6.4 — Configuration anti-patterns

| ❌ Anti-pattern | ✅ Correct pattern |
|---|---|
| New entity field declared only in `schema.ts` | Field appears in `schema.ts` (DB), `src/shared/schemas.ts` (Zod types), and `entity-schemas.ts` (UI). All three must agree. |
| State transition added in `commandBus.ts` but not in `entity-actions.ts` | Transitions and gating live in `entity-actions.ts`. Server validates against the same logic, imported from shared. |
| New tab added in `ContextDrawer.tsx`'s `drawerTabs` map | Tab registered in `src/client/components/tabs/registry.ts`. The hard-coded map is the migration target, not the place to add new tabs. |
| New status string introduced anywhere | Add to `src/shared/statuses.ts` first. Static-analysis check (per CPO audit P0 #1) enforces that every status used in `commandBus.ts` exists in `statuses.ts` and vice versa. |

---

## §7 — Spec Template Requirements

Every implementation spec (view spec, component spec, hook spec, procedure spec) **must** anchor to this manifesto. The spec template requires the following sections, filled in:

### §7.1 — Required spec fields

1. **UX rule(s) served.** Name the UX-N rule(s) from `DESIGN-RULES.md` v2.0 that this implementation satisfies. Example: `UX-1, UX-3, UX-5`.
2. **ARCH rule(s) followed.** Name the ARCH-N rule(s) from this manifesto that govern the implementation. Example: `ARCH-1 (one data source), ARCH-3 (lazy data), ARCH-6 (URL state)`.
3. **Attention-budget tier.** `0-hop` (always visible), `1-hop` (one click away), `2+-hop` (rare, separate route or search).
4. **Old pattern replaced.** Name the legacy component/pattern this implementation retires (from §4 Migration Map). If nothing is being replaced, say so explicitly with rationale.
5. **URL state encoded.** Enumerate every query param this implementation reads or writes. If none, say so.
6. **Existing infrastructure leveraged.** Name the §5 components/hooks/queries this implementation builds on. If nothing, justify why a parallel build is necessary (this should be rare; default is to extend).
7. **Anti-patterns avoided.** List the §6 patterns that would be tempting in this implementation but are explicitly forbidden. Example: "Tempting: per-view `ColDef[]` (ARCH-1 forbids); not done. Tempting: `WorkspacePanel` wrapper for the summary (ARCH-3 forbids); not done."
8. **Compliance check.** A 2–4 line procedure for a reviewer to verify the implementation matches the manifesto. Example: "Open React DevTools on cold view load. Tree should contain `FilterToolbar`, `SummaryStrip`, `PrimaryGrid`. If `SlideOver` or `BulkActionBar` is mounted, fail. Trigger row selection. `BulkActionBar` appears, `SummaryStrip` hides."

### §7.2 — Spec template skeleton

Specs use this skeleton (markdown), with the fields above as the first section:

```markdown
# <Component/View/Hook> Spec

## Manifesto Anchor
- UX rules served: ...
- ARCH rules followed: ...
- Attention-budget tier: ...
- Old pattern replaced: ...
- URL state encoded: ...
- Existing infrastructure leveraged: ...
- Anti-patterns avoided: ...
- Compliance check: ...

## API
<input/output types, props, query keys>

## States
<empty / loading / error / partial / success>

## Behavior
<keyboard, focus, a11y, mutation flow>

## Acceptance criteria
<checklist, testable>

## Test plan
<unit / integration / persona-flow QA mapping>
```

### §7.3 — A spec without manifesto anchor is incomplete

A spec missing any of the §7.1 fields is **not ready for agent dispatch**. The reviewer's first task on receiving a draft spec is to confirm the manifesto anchor is filled in. If it is not, the spec returns to the author. This is the only way to keep ARCH discipline visible at the per-task level.

---

## §8 — References

- **UX authority:** [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md) (cross-model: Claude Opus 4.7 + GPT-4o)
- **Design rules v2.0:** [wireframes/DESIGN-RULES.md](./wireframes/DESIGN-RULES.md)
- **Integration map (38 migrations):** [wireframes/INTEGRATION-MAP.md](./wireframes/INTEGRATION-MAP.md)
- **CPO audit:** [CPO-AUDIT-REPORT.md](./CPO-AUDIT-REPORT.md) — the §5 leverage list and the migration map both trace directly to its Finding #2
- **Execution document:** [MASTER-EXECUTION-DOCUMENT.md](./MASTER-EXECUTION-DOCUMENT.md)
- **Task tracker:** [AI-TODO.md](./AI-TODO.md)
- **Wireframe inventory:** `wireframes/WF-*.md` (47 files: 27 views + 10 components + 10 flows)
- **Repo agent entry point:** [AGENTS.md](./AGENTS.md)
- **Codebase touch points:**
  - `src/client/components/useCommandRunner.ts` (245 lines)
  - `src/client/components/ContextDrawer.tsx` (647 lines)
  - `src/client/store/uiStore.ts` (738 lines)
  - `src/client/hooks/useDrawerUrlSync.ts` (80 lines)
  - `src/client/views/operations/shared.tsx` (`GridJourney` at line 247)
  - `src/client/views/SalesView.tsx` (1986 lines — the canonical UX-1 violation)
  - `src/server/routers/queries.ts` (3174 lines)
  - `src/server/services/commandBus.ts` (8063 lines, 154 commands)
  - `src/server/schema.ts` (1383 lines)

---

## §9 — Closing — The Discipline This Document Encodes

Three structural diseases killed past UX waves on this codebase: per-view drift (every view inventing its own pattern), wrapper proliferation (`WorkspacePanel` everywhere because it was easy to reach for), and parallel-build (re-implementing what already worked because the new spec didn't say "extend the old thing"). The Mercury retrofit will replicate all three unless the path of least resistance is the right path.

The architecture rules in §1 exist because the UX rules cannot be honored without them. The component hierarchy in §2 exists because views drift when chrome is negotiable. The data flow rules in §3 exist because lazy data and one-source-per-view are testable invariants, not slogans. The migration map in §4 exists because "deprecate later" never happens unless a phase boundary forces it. The leverage list in §5 exists because the CPO audit found 70% of the work was already done and the plan was about to ignore it. The anti-pattern list in §6 exists because reviewers need a checklist, not a vibe. The spec template in §7 exists because per-task manifesto anchors are the only way to keep the discipline visible at the unit of work.

If this document does its job, agents implementing tasks will read it once, hit the patterns in §6 as "tempting but forbidden," reach for §5's extension points instead of building parallel, and ship code that the operator never has to defend against.

That is the bar. Hold it.

---

*End of Mercury Architecture Manifesto. Append corrections as a new section at the top with date; do not edit history.*
