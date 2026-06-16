# Mercury UX Adoption — Engineering Plan

**Date:** 2026-06-15 (v2 — synthesized from AQA, Gemini templating review, GPT-5.5 pragmatism review)
**Author:** PM/router synthesis from multi-agent deep reconnaissance + 3-model adversarial review
**Status:** Execution-ready

---

## 0. Executive Summary

We're adopting Mercury's functional interaction patterns onto TERP Operator's existing backend. The goal: preserve all TERP functionality while upgrading the operator experience with proven patterns for inline editing, filtering, bulk actions, KPI visibility, and progressive disclosure.

**Total estimated effort:** 20 weeks (single full-time engineer, shipping incrementally)
**Key insight:** This is not a reskin. It's a structural upgrade that templates TERP's view patterns so future development is faster and more consistent.

### What Changes for Developers

| Before | After |
|--------|-------|
| Adding a view = 2-3 days of bespoke code | Adding a GridView = 1-2 hours of configuration |
| Column definitions duplicated across views | Schema-driven — one field definition, all views update |
| Filter logic per view | FilterToolbar + ViewTabBar — shared components |
| Bulk action logic duplicated in 8+ StatusActionTables | Entity state machine — one definition, all views use it |
| 10 separate tRPC queries per view | One `useViewData` hook |
| 18 separate drawer/panel components | DetailSlideover (entity detail) + inline sections + modals |

---

## 1. Design Philosophy

### Principles
1. **Composition over framework.** Templates are components you compose; not a framework you're trapped in. Views opt into templates; complex views add bespoke sections where needed.
2. **Ship tranches, prove at gates.** Every phase produces a working, testable increment. No big reveal deploy.
3. **Progressive disclosure.** Main view is clean (one table surface). Context is one click away (slide-over), not always visible in competing panels.
4. **Templates where they help, bespoke where they don't.** Standard views get 95% template coverage. Complex views get 70-80%. Truly unique views stay bespoke.

### Domain Fit: Banking vs. Brokerage
Mercury is banking (accounts, transactions, cards — 8 columns, few entity relationships). TERP is wholesale brokerage (inventory, POs, sales orders, pick/pack/ship — 15+ columns, complex multi-entity relationships). We adapt Mercury's patterns for brokerage density:

| Mercury Pattern | TERP Adaptation |
|-----------------|----------------|
| 8-column native table | 15+ column AG Grid (keep — operators need density) |
| Category dropdown (8 options) | ComboboxCellEditor with typeahead (50+ options) |
| Single-entity detail (account page) | DetailSlideover + full-page routes for complex entities |
| 6 core pages | 27 views — tabbed sub-navigation reduces cognitive surface |
| Final transactions | Multi-stage workflows (draft→confirmed→posted→picked→packed) — status tabs cover this |

---

## 2. New Architecture

### 2.1 View Layout Templates

Instead of 27 views each building their own layout, views adopt one of 4 templates:

#### Template A: GridView (the workhorse)
```
┌─FilterToolbar────────────────────────────────────────────┐
├─SummaryStrip──────────────────────────────────────────────┤
├─ViewTabBar────────────────────────────────────────────────┤
├─OperatorGrid (main table)─────────────────────────────────┤
├─BulkActionBar (conditional)───────────────────────────────┤
└───────────────────────────────────────────────────────────┘
  DetailSlideover (right, conditional)
```
**Used by:** ~15 views (GridJourney views + simple list views)
**What's templated:** 95%. Only the configuration changes per view.

#### Template B: MasterDetailView
```
┌─FilterToolbar────────────────────────────────────────────┐
├─SummaryStrip──────────────────────────────────────────────┤
├─OperatorGrid (master rows, expandable)────────────────────┤
│  ▸ Row 1                                                  │
│  ▾ Row 2                                                  │
│    ┌─Detail grid (child rows, inline)──────────────────┐ │
│    └────────────────────────────────────────────────────┘ │
├─BulkActionBar (conditional)───────────────────────────────┘
```
**Used by:** IntakeView, PurchaseOrdersView (selected PO lines). Detail grid config is bespoke.

#### Template C: DashboardView
```
┌─Welcome + Quick Actions───────────────────────────────────┐
├─KPI Strip (horizontal cards)──────────────────────────────┤
├─Section A (2-col)──────┬──Section B───────────────────────┤
│  Focus items           │  Work queues                     │
├─Activity Feed─────────────────────────────────────────────┤
│  Drafts · Recent · Credit Watch                           │
```
**Used by:** DashboardView. Section content is bespoke.

#### Template D: WizardView
```
┌─Step Indicator────────────────────────────────────────────┐
│  Step 1 → Step 2 → Step 3                                 │
├─Current Step Content──────────────────────────────────────│
```
**Used by:** PickView (queue → list → line), future guided workflows.

**Views that don't fit templates:** SalesView (GridView + inline workspace), SettingsView (tabbed — already clean), ContactProfileView (tabbed — already clean). Templates are the DEFAULT, not the only option.

### 2.2 Schema-Driven Column System

Today: Every view defines columns imperatively as `ColDef[]` arrays. SalesView has 40+ column defs across 3 grids. Inline cell renderers reference view state. Columns re-create on every `isRunning` change.

After: Each entity has a schema. Columns auto-generated. Customizations are explicit overrides.

```typescript
// src/config/entity-schemas.ts

const PurchaseOrder = entitySchema({
  id:        { header: 'PO #',    width: 150, pinned: 'left' },
  vendor:    { header: 'Vendor',  width: 190 },
  status:    { header: 'Status',  width: 135, editor: 'combobox', enum: PO_STATUSES },
  expectedDate: { header: 'Expected', width: 165, editor: 'date' },
  total:     { header: 'Total',   width: 120, type: 'money' },
  lines:     { header: 'Lines',   width: 95,  hide: true },
  buyerNotes: { header: 'Notes',  minWidth: 220, editor: 'text', hide: true },
  // ...
});

// Auto-generates AG Grid ColDef array with correct editors, formatters, filters
const columns = entitySchemaToColDefs(PurchaseOrder);
```

**Overrides for custom columns:**
```typescript
entitySchema({
  pickStatus: { 
    header: 'Pick', width: 140, 
    cellRenderer: PickStatusChip,  // Custom component
  },
  derivedCogs: {
    header: 'COGS', width: 130,
    valueGetter: computeDerivedCogs, // Custom logic
    cellStyle: pricingCellStyle,
  },
});
```

**What this eliminates:** ~2000 lines of imperative column defs across ~15 views. Editor selection is automatic: `enum → ComboboxCellEditor`, `money → NumericEditor`, `boolean → CheckboxEditor`, `date → DatePickerEditor`.

### 2.3 Entity State Machine (Actions)

Today: Every view has a StatusActionTable — a decision table mapping statuses to available actions. This logic is duplicated across 8+ views.

After: Entity state machines defined once. Available actions derived automatically.

```typescript
// src/config/entity-actions.ts

const SalesOrderStateMachine = defineStateMachine({
  entity: 'salesOrder',
  states: {
    draft:     { actions: ['confirm', 'reprice', 'cancel'], primary: 'confirm' },
    confirmed: { actions: ['post', 'allocateToFulfillment', 'createPickList', 'reprice', 'cancel'], 
                 primary: 'post' },
    posted:    { actions: ['allocateToFulfillment', 'createPickList', 'reprice'], 
                 primary: 'createPickList' },
    fulfilled: { actions: [], primary: null },
  },
  multiRowConstraints: {
    'confirm': (rows) => rows.every(r => r.status === 'draft' && r.customer),
    'cancel': (rows) => rows.every(r => ['draft', 'confirmed'].includes(r.status)),
  },
});

// In any view using this entity:
const actions = useEntityActions('salesOrder', selectedRows);
// → [{ key: 'confirm', label: 'Confirm', primary: true, enabled: true }, ...]
```

**What this eliminates:** 8+ per-view StatusActionTable components. One source of truth for "what can I do with this entity at this status?"

### 2.4 Data Contract Hook

Today: Every view calls 2-10 separate `trpc.*.useQuery()` calls. SalesView has 10.

After: One hook per view.

```typescript
function useViewData(viewKey: ViewKey, filters: FilterState) {
  const queryMap = {
    purchaseOrders: () => ({
      main: trpc.queries.grid.useQuery({ view: viewKey }),
      aggregates: trpc.queries.viewAggregates.useQuery({ view: viewKey }),
      reference: trpc.queries.reference.useQuery(),
    }),
    sales: () => ({
      main: trpc.queries.grid.useQuery({ view: 'sales' }),
      aggregates: trpc.queries.salesAggregates.useQuery(),
      customerWorkspace: trpc.queries.customerWorkspace.useQuery(
        { customerId: filters.activeCustomerId },
        { enabled: !!filters.activeCustomerId }
      ),
      suggestions: trpc.queries.salesSuggestions.useQuery(
        { customerId: filters.activeCustomerId, ...filters.suggestion },
        { enabled: !!filters.activeCustomerId }
      ),
      // ...
    }),
  };
  return queryMap[viewKey]();
}
```

**Benefits:** Views shrink from 10 queries to 1 hook call. Loading/error states handled once. Queries with enabled flags don't fire until dependencies exist.

### 2.5 Filter Architecture

#### FilterToolbar (Primary UX)
Horizontal menubar: `[Data views] [Filters: Date | Keyword | Amount] [Group] [Sort] [Export]`
- Date/Keyword/Amount chips open inline popovers
- Active filters shown as pills
- Data views = saved filter presets

#### AdvancedFilterBuilder (Power User UX)
Kept behind "Advanced" button. Same nested AND/OR group builder as today.

#### Filter Bridge (Two-Way Sync)
```
Simple chips (FilterToolbar)          Complex filters (AdvancedFilterBuilder)
status:eq:draft                       { AND: [
amount:gte:100                          { field: 'category', op: 'eq', value: 'flower' },
───────────────────────                 { field: 'price',    op: 'gt', value: 100 }
   ↕ bridge ↕                         ]}
                                     OR { field: 'vendor', op: 'eq', value: 'acme' }
                                     ]
```
- Simple → Advanced: Click "Advanced" → chips serialize to AND group → pre-populated
- Advanced → Simple: Click "Apply" → extract simple fields as chips; show amber "Complex filter active" pill if AND/OR/nesting remains
- Clear all clears both systems
- Saved views can include either simple or complex filters

#### ViewTabBar (Status Tabs)
Horizontal tabs: `[All | Draft (3) | Confirmed (12) | Posted (45)]`
- Auto-generated from entity status enum
- Count badges from aggregate query
- Wires to filter state

### 2.6 DetailSlideover

A right-side panel for entity detail. Replaces the ContextDrawer's 5 states with a cleaner 3-state model + full-page fallback.

| State | Width | Trigger | Use Case |
|-------|-------|---------|----------|
| Peek | 280px | Hover or single-click row | Quick summary + 2-3 key actions. Table stays interactive. |
| Standard | 420px | Double-click or "Open" in peek | Full detail with tabbed sections. Content shifts left. |
| Wide | 60% | Drag handle or "Expand" | Complex entity (many lines, many tabs) |
| Focus | 100% | "Open in full view" → navigates to detail page | Deep work. Dedicated route (e.g., `/sales/order/:id`). |

#### Tab Registry (Scoped — NOT Universal)

The slide-over is a shell. Entity modules register their own tabs. The slide-over knows nothing about specific entities.

```typescript
// Registration (per entity module):
registerTabs('po', [
  { key: 'lines', label: 'Lines', component: PoLinesTab },
  { key: 'linked-intake', label: 'Linked Intake', component: PoLinkedIntakeTab },
  { key: 'vendor', label: 'Vendor', component: VendorDetailTab },
  { key: 'history', label: 'History', component: EntityTimelineTab },
]);

registerTabs('customer', [
  { key: 'overview', label: 'Overview', component: CustomerOverviewTab },
  { key: 'orders', label: 'Orders', component: CustomerOrdersTab },
  { key: 'history', label: 'Purchase History', component: CustomerPurchaseHistoryTab },
  { key: 'photos', label: 'Photography', component: PhotographyQueueTab },
  { key: 'credit', label: 'Credit', component: CustomerCreditPanel, requiresRole: 'manager' },
]);
```

#### What the Slide-over Does NOT Absorb
- **RecordPrepaymentDialog** → stays a modal (financial action with amount validation)
- **InventoryFinder** → stays inline collapsible section OR opens as slide-over from "Add line" (not a tab in entity detail)
- **Sheet Preview** → opens as slide-over from "Preview Sheet" button (document preview, not entity detail)
- **Warehouse Alert** → stays a focus-trapped dialog (safety-critical confirmation)

#### Simultaneous Visibility: Context Panel Classification

Every context panel is classified into one of three tiers:

| Tier | Visibility | Panels |
|------|-----------|--------|
| **Inline** (always visible when relevant) | Collapsible section in main content | CustomerPurchaseHistory, InventoryFinder (Sales), VendorQuickAdd (PO), Intake totals strip |
| **Slide-over** (one click) | Right-side DetailSlideover | Customer detail, PO detail, Order detail, Lot detail, Payment detail, Vendor detail (full), Receipt preview, Sheet preview, Photography queue |
| **Modal/Dialog** (explicit action) | Full overlay | RecordPrepaymentDialog, RefereeRelationshipDialog, Create/Edit forms, VerifyAll confirmation, Warehouse alert |

**Cross-reference workflows preserved:** CustomerPurchaseHistory stays inline so operators can see purchase history while editing current order lines. InventoryFinder stays inline (can be pinned) so operators can search inventory while building orders. VendorQuickAdd stays inline so operators can check vendor history while building POs.

### 2.7 BulkActionBar

Sticky bottom bar replacing every per-view StatusActionBar.

```
┌─Bulk Action Bar────────────────────────────────────────────┐
│ 3 orders selected · $24,500 · [Confirm] [Post] [Fulfillment]
│ Actions from entity state machine                          │
│ Bespoke inputs rendered inline next to action buttons       │
└────────────────────────────────────────────────────────────┘
```

Uses entity state machines for action availability. Bespoke inputs (like `routedTo` for connector routing) render inline next to the action button when needed.

---

## 3. Component Architecture

### 3.1 New Shared Components

| Component | File | Replaces |
|-----------|------|----------|
| `ComboboxCellEditor` | `src/client/components/editors/ComboboxCellEditor.tsx` | New (AG Grid ICellEditor) |
| `FilterToolbar` | `src/client/components/FilterToolbar.tsx` | AdvancedFilterBuilder (default UX) |
| `BulkActionBar` | `src/client/components/BulkActionBar.tsx` | StatusActionBar (per view) |
| `DetailSlideover` | `src/client/components/DetailSlideover.tsx` | ContextDrawer + ~15 drawer/panel components |
| `ViewTabBar` | `src/client/components/ViewTabBar.tsx` | FilterPresetStrip |
| `GridSummaryStrip` | `src/client/components/GridSummaryStrip.tsx` | New |
| `GridView` | `src/client/templates/GridView.tsx` | GridJourney + per-view layout code |
| `MasterDetailView` | `src/client/templates/MasterDetailView.tsx` | New (from IntakeView pattern) |
| `DashboardView` | `src/client/templates/DashboardView.tsx` | New (from DashboardView pattern) |
| `WizardView` | `src/client/templates/WizardView.tsx` | New (from PickView pattern) |

### 3.2 New Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useEntityActions` | `src/client/hooks/useEntityActions.ts` | State machine → available actions |
| `useViewData` | `src/client/hooks/useViewData.ts` | Single hook per view's data needs |
| `useColumnDefs` | `src/client/hooks/useColumnDefs.ts` | Schema → AG Grid ColDef array |
| `useSalesLineRows` | `src/client/hooks/useSalesLineRows.ts` | Pricing rule resolution |
| `useSalePrePostChecks` | `src/client/hooks/useSalePrePostChecks.ts` | Pre-post validation logic |

### 3.3 New Configuration Files

| File | Purpose |
|------|---------|
| `src/config/entity-schemas.ts` | Entity field definitions (schema → columns) |
| `src/config/entity-actions.ts` | Entity state machines (status → available actions) |
| `src/config/view-registry.ts` | View declarations (key → template + entity + config) |
| `src/config/filter-presets.ts` | Auto-generated + custom filter presets |

### 3.4 What Stays the Same

- **AG Grid** — rich features preserved (sorting, filtering, grouping, selection, expansion, clipboard, range selection)
- **useCommandRunner** — command abstraction unchanged
- **useUiStore** (Zustand) — granular selectors unchanged; filter/drawer/selection state centralized
- **OperatorGrid** — presentational wrapper unchanged; receives schema-generated columns
- **ContextDrawer** → replaced by DetailSlideover (kept until Phase 3 migration)
- **CommandPalette (Cmd+K)** — preserved and enhanced
- **BatchRowActions** (IntakeView inline actions) — already Mercury-like, preserved

---

## 4. Implementation Phases (20 Weeks)

### Phase 0 — Foundation (Weeks 1-3)
**Goal:** Shared components, hooks, configuration built. Zero views touched.

#### Week 1: ComboboxCellEditor
- [ ] **Task 0.1** — Basic `ComboboxCellEditor` (AG Grid ICellEditor, dropdown, select)
- [ ] **Task 0.2** — Typeahead filtering + async save via `onCellCommit` pipeline
- [ ] **Task 0.3** — Loading/saving/error states, keyboard nav, a11y
- [ ] **Task 0.4** — Unit tests + integration test with OperatorGrid

#### Week 2: Core Components + Configuration
- [ ] **Task 0.5** — `DetailSlideover` shell + tab registry (`registerTabs` pattern)
- [ ] **Task 0.6** — `FilterToolbar` + FilterBridge (serialization, two-way sync)
- [ ] **Task 0.7** — `BulkActionBar` (replaces StatusActionBar render)
- [ ] **Task 0.8** — `ViewTabBar`, `GridSummaryStrip`
- [ ] **Task 0.9** — Entity schemas for all GridJourney entities (PurchaseOrder, Order, Payment, Inventory, Client, Vendor, Fulfillment)
- [ ] **Task 0.10** — `useColumnDefs` hook (schema → AG Grid ColDef)

#### Week 3: Templates + State Machines
- [ ] **Task 0.11** — `GridView` template component
- [ ] **Task 0.12** — `MasterDetailView` template component
- [ ] **Task 0.13** — Entity state machines for all GridJourney entities
- [ ] **Task 0.14** — `useEntityActions` hook
- [ ] **Task 0.15** — `useViewData` hook (with viewKey → query map)
- [ ] **Task 0.16** — `view-registry.ts` (view declarations)

**Phase 0 Gate:**
- [ ] All new components have unit tests
- [ ] FilterBridge round-trips correctly (simple → advanced → simple)
- [ ] Schema → ColDef factory works for all GridJourney entities
- [ ] Tab registry accepts registrations and renders correct tabs
- [ ] Typecheck passes

---

### Phase 1 — Pilot View (Weeks 4-5)
**Goal:** PurchaseOrdersView fully retrofitted. Prove all patterns work together.

#### Week 4: Wire PurchaseOrdersView
- [ ] **Task 1.1** — Adopt `GridView` template as PurchaseOrdersView layout
- [ ] **Task 1.2** — Wire `FilterToolbar` with PO presets (Active | Ordered | Finalized)
- [ ] **Task 1.3** — Wire `GridSummaryStrip` with PO aggregate query
- [ ] **Task 1.4** — Wire `ViewTabBar` for status filtering (All | Draft | Ordered | Received | Finalized)
- [ ] **Task 1.5** — Wire `BulkActionBar` with entity actions from PurchaseOrder state machine
- [ ] **Task 1.6** — Wire `DetailSlideover` with PO tabs (lines + linked-intake + vendor + history)
- [ ] **Task 1.7** — Convert `status` column to `ComboboxCellEditor`
- [ ] **Task 1.8** — Move PO authoring to slide-over (from inline panel). VendorQuickAdd stays inline.
- [ ] **Task 1.9** — Register PO entity tabs in tab registry

#### Week 5: Validate + Document
- [ ] **Task 1.10** — Full validation: Playwright e2e + existing tests + browser QA
- [ ] **Task 1.11** — Fix issues found
- [ ] **Task 1.12** — Write View Migration Playbook (`docs/engineering-plans/view-migration-playbook.md`)
- [ ] **Task 1.13** — Begin Mercury page study (Insights, Accounting, Tasks)

**Phase 1 Gate:**
- [ ] PurchaseOrdersView fully functional with new components
- [ ] All existing PurchaseOrdersView tests pass (`PurchaseOrdersView.ux-wave7.test.tsx`)
- [ ] Playwright e2e passes
- [ ] No regressions
- [ ] Migration playbook written

---

### Phase 2 — GridJourney Views (Weeks 6-7)
**Goal:** ~10 GridJourney views adopt GridView template.

#### Week 6: Schema + State Machines
- [ ] **Task 2.1** — Complete entity schemas for all remaining GridJourney entities
- [ ] **Task 2.2** — Complete entity state machines for all remaining GridJourney entities
- [ ] **Task 2.3** — Configure `useViewData` hook for each view
- [ ] **Task 2.4** — Wire `GridView` template to first 5 views: Orders, Payments, Inventory, Clients, Fulfillment
- [ ] **Task 2.5** — Register entity tabs for each view's entities

#### Week 7: Remaining GridJourney Views + Validation
- [ ] **Task 2.6** — Wire `GridView` template to remaining 5 views: VendorPayables, Connectors, PurchaseReceipts, InvoiceDisputes, Closeout
- [ ] **Task 2.7** — Validate: typecheck + Playwright e2e + browser QA
- [ ] **Task 2.8** — Fix issues

**Phase 2 Gate:**
- [ ] All GridJourney views functional
- [ ] All existing per-view tests pass
- [ ] No regressions

---

### Phase 3A — SalesView Prerequisite Refactoring (Weeks 8-10)
**Goal:** SalesView code reorganized. Cell renderers extracted. Columns stabilized. Zero new components wired. All existing tests pass.

#### Week 8: Extract Cell Renderers
- [ ] **Task 3.1** — Extract `displayName` renderer into `DisplayNameCell` component
- [ ] **Task 3.2** — Extract `batchCode` renderer (AlreadyInOrderChip) into `BatchCodeCell` component
- [ ] **Task 3.3** — Extract `markup` renderer into `MarkupCell` component
- [ ] **Task 3.4** — Extract `derivedCogs` renderer into `DerivedCogsCell` component
- [ ] **Task 3.5** — Extract `pickStatus` renderer (PickStatusChip) into `PickStatusCell` component
- [ ] **Task 3.6** — Extract `reason` renderer (whyShown chips) into `WhyShownCell` component
- [ ] **Task 3.7** — Extract remaining inline renderers into named components

#### Week 9: Stabilize Columns
- [ ] **Task 3.8** — Stabilize `fulfillmentActionsColumn` — remove useMemo dependency on `isRunning`. Use `cellRendererParams` for `canWrite` and `releaseEligibility`.
- [ ] **Task 3.9** — Extract `lineRowsWithRule` pricing computation into `useSalesLineRows(orderId, customerId)` hook
- [ ] **Task 3.10** — Extract `salePrePostChecks` into `useSalePrePostChecks` hook
- [ ] **Task 3.11** — Extract `buildConfirmPayload` into dedicated pure function
- [ ] **Task 3.12** — Extract `purchaseOrderSelectionActions` into `usePOSelectionActions` hook

#### Week 10: Validate Refactoring
- [ ] **Task 3.13** — Full test suite: `SalesView.ux-f03`, `SalesView.ux-d04`, `SalesView.ux-f06`, `SalesView.marginToggle`, `SalesView.pricing`
- [ ] **Task 3.14** — Manual QA: create order, add lines, price, confirm, release, recall, cancel. Verify no behavioral changes.
- [ ] **Task 3.15** — Fix any regressions

**Phase 3A Gate (HARD GATE):**
- [ ] All 5 SalesView test suites pass
- [ ] SalesView behavior identical to pre-refactoring
- [ ] Cell renderers are stable components (not inline useMemo arrows)
- [ ] Columns don't re-create on state changes
- [ ] If this gate fails, reassess plan

---

### Phase 3B — SalesView Migration (Weeks 11-13)
**Goal:** New components wired into SalesView.

#### Week 11: Template + Shared Components
- [ ] **Task 3.16** — Adopt `GridView` template as base layout
- [ ] **Task 3.17** — Adopt SalesOrder entity schema (replace imperative `orderColumns` and `lineColumns`)
- [ ] **Task 3.18** — Adopt SalesOrder state machine (replace per-view decision table)
- [ ] **Task 3.19** — Wire `FilterToolbar` (presets: All Open | Confirmed | Posted, customer scope chip)
- [ ] **Task 3.20** — Wire `GridSummaryStrip` for sales aggregates
- [ ] **Task 3.21** — Wire `ViewTabBar` for status filtering

#### Week 12: Inline Editing + Context
- [ ] **Task 3.22** — Wire `BulkActionBar` with entity actions
- [ ] **Task 3.23** — Wire `ComboboxCellEditor` for `status`, `pricingStrategy`, `tags` columns
- [ ] **Task 3.24** — Customer workspace context header (balance, credit, pre-post checks) — stays inline above lines grid
- [ ] **Task 3.25** — Wire `DetailSlideover` for order detail (lines + pricing + fulfillment + history tabs)
- [ ] **Task 3.26** — Register SalesOrder and Customer entity tabs

#### Week 13: Validate
- [ ] **Task 3.27** — Full validation: all 5 SalesView test suites + Playwright e2e + browser QA
- [ ] **Task 3.28** — Fix issues. Re-test.

**Phase 3B Gate:**
- [ ] SalesView fully functional with all new components
- [ ] All 5 SalesView test suites pass
- [ ] Playwright e2e passes
- [ ] Customer workspace context preserved inline (cross-reference workflow)

---

### Phase 3C — IntakeView + DashboardView (Weeks 14-15)
**Goal:** IntakeView adopts MasterDetailView. DashboardView adopts DashboardView template.

#### Week 14: IntakeView
- [ ] **Task 3.29** — Adopt `MasterDetailView` template
- [ ] **Task 3.30** — Wire `FilterToolbar` (Ready | In Progress | Verified)
- [ ] **Task 3.31** — Wire `GridSummaryStrip` (POs pending, batches, total value)
- [ ] **Task 3.32** — Wire `ComboboxCellEditor` for `arrivalStatus`, `discrepancyReason`
- [ ] **Task 3.33** — Wire `DetailSlideover` for batch/lot detail
- [ ] **Task 3.34** — Validate: IntakeView tests pass

#### Week 15: DashboardView
- [ ] **Task 3.35** — Adopt `DashboardView` template
- [ ] **Task 3.36** — Wire KPI strip (horizontal cards)
- [ ] **Task 3.37** — Wire quick actions (New Sale, New PO, etc.)
- [ ] **Task 3.38** — Consolidate 8 stacked panels into 2-3 section layout
- [ ] **Task 3.39** — Task count badge on sidebar nav items
- [ ] **Task 3.40** — Validate: Dashboard tests pass

---

### Phase 3D — Remaining Complex Views (Weeks 16-18)
**Goal:** All remaining views adopted to template system + new components.

#### Week 16: Matchmaking + Pick
- [ ] **Task 3.41** — MatchmakingView: 5 grids → tabbed GridView with ViewTabBar
- [ ] **Task 3.42** — PickView: adopt WizardView template (queue → list → line)
- [ ] **Task 3.43** — Register entity tabs for match entities

#### Week 17: Recovery + Closeout + CreditReview
- [ ] **Task 3.44** — RecoveryView: GridView + filter chips + BulkActionBar for retry
- [ ] **Task 3.45** — CloseoutView: GridView + blocker drilldown (inline) + BulkActionBar
- [ ] **Task 3.46** — CreditReviewView: GridView + ViewTabBar tabs
- [ ] **Task 3.47** — Register entity tabs

#### Week 18: Remaining Views
- [ ] **Task 3.48** — MediaView, RefereesView, ProcessorsView → GridView template
- [ ] **Task 3.49** — ItemsView, ContactsView, MergeCandidatesView → GridView template
- [ ] **Task 3.50** — SettingsView, ContactProfileView → keep as-is (already clean tabbed layouts)
- [ ] **Task 3.51** — Full test suite pass

**Phase 3D Gate:**
- [ ] All 27 desktop views functional with new components where applicable
- [ ] All existing per-view tests pass
- [ ] Playwright e2e passes

---

### Phase 4 — Polish (Weeks 19-20)
**Goal:** Mobile, accessibility, performance, documentation.

#### Week 19: Mobile + Accessibility
- [ ] **Task 4.1** — Mobile view adaptations (7 views: adapt FilterToolbar for mobile, BulkActionBar for mobile)
- [ ] **Task 4.2** — Accessibility audit (keyboard nav on all new components, screen reader labels, ARIA roles)
- [ ] **Task 4.3** — Performance check (ComboboxCellEditor typeahead with 10k+ options, Grid render, TanStack Query caching)

#### Week 20: Documentation + Cleanup
- [ ] **Task 4.4** — Update design system docs (`docs/design-system/components/`)
- [ ] **Task 4.5** — Update decision log (`docs/design-system/decisions-log.md`)
- [ ] **Task 4.6** — Run `pnpm docs:inventory`
- [ ] **Task 4.7** — Persona flow QA (critical views: SalesView, IntakeView, PaymentsView)
- [ ] **Task 4.8** — Cleanup: deprecate unused code, remove dead imports
- [ ] **Task 4.9** — Final full test suite: `pnpm typecheck && pnpm test`

**Phase 4 Gate:**
- [ ] All 27 desktop + 7 mobile views functional
- [ ] Full test suite passes
- [ ] Accessibility audit passes for new components
- [ ] Persona flow QA passes for critical views
- [ ] Design system docs updated
- [ ] Decision log updated

---

## 5. View Migration Playbook

### For GridView Views (Simple)
1. Define entity schema in `entity-schemas.ts`
2. Define entity state machine in `entity-actions.ts`
3. Register view in `view-registry.ts` with `template: 'gridView'`
4. Register entity tabs via `registerTabs()`
5. Done. `GridView` handles: FilterToolbar, SummaryStrip, ViewTabBar, OperatorGrid, BulkActionBar, DetailSlideover.

### For MasterDetailView Views
1. Same as GridView steps 1-4
2. Define detail grid configuration (bespoke per view)
3. Done. `MasterDetailView` handles the master grid + detail expansion.

### For Complex Views (Custom Layout)
1. Audit view: identify tRPC queries, `useCommandRunner` calls, column defs, `useUiStore` selectors
2. Adopt closest template (`GridView` or `MasterDetailView`)
3. Add bespoke sections in template's extension slots
4. Define entity schema + state machine (same as simple views)
5. Register entity tabs
6. Add `FilterToolbar`, `GridSummaryStrip`, `BulkActionBar` via template
7. Wire `ComboboxCellEditor` where beneficial (discrete values, frequently edited)
8. Test: typecheck + existing view tests + Playwright + browser QA

### ComboboxCellEditor Adoption Criteria
**Add when:** Column has discrete known options (status, category, tags, method), options ≤500, frequently edited by operators, edit has no complex side effects.
**Don't add when:** Column requires complex validation or multi-step workflows, edit triggers cascading changes across records, edit modifies relationships (use dedicated action button).

---

## 6. Command Verification Matrix (Template)

Before Phase 1 execution, complete this matrix for ALL ~80 TERP commands:

| Command | Current Trigger | Gating | Retrofit Trigger | Dependent UI | Status |
|---------|----------------|--------|------------------|-------------|--------|
| `createSalesOrder` | useEffect when customer selected | canWrite | "New Sale" button + customer select | Customer workspace header | ⬜ |
| `confirmSalesOrder` | Expansion button + tray | canWrite | BulkActionBar or slide-over action | — | ⬜ |
| `receivePurchaseOrder` | Expansion button + tray | canWrite | BulkActionBar or slide-over action | ReceiptPreview in slide-over | ⬜ |
| `routeConnectorRequest` | StatusActionBar (needs routedTo) | canWrite | BulkActionBar with inline input | routedTo input in bar | ⬜ |
| `verifyAllIntake` | Master row Actions cell + confirm | canWrite | BulkActionBar + confirm dialog | VerifyAllPreviewBody in confirm | ⬜ |
| ... | ... | ... | ... | ... | ⬜ |

---

## 7. Testing Strategy

### 7.1 Component Tests (Per Component)
- Rendering in all states (empty, loading, error, populated)
- User interactions (click, type, select, keyboard nav)
- Accessibility (ARIA roles, keyboard focus, labels)
- Edge cases (empty options, single option, 10k+ options for combobox)

### 7.2 Integration Tests
- `ComboboxCellEditor` + `OperatorGrid`: edit → commit → grid refreshes → value persists
- `FilterToolbar` + FilterBridge: simple → advanced → simple round-trip
- `BulkActionBar` + entity state machine: correct actions for each status
- `DetailSlideover` + tab registry: click row → tabs render → close → restored

### 7.3 View-Level Regression Tests
Every view touched must pass its existing test suite. New tests added for new component interactions.

### 7.4 E2E Tests
```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts --project=chromium --workers=1
```

### 7.5 Persona Flow QA (Critical Views)
Before final closeout:
```bash
fast-runner exec --base origin/main --branch "fast-runner/qa-$(date +%Y%m%dT%H%M%S)" terp-operator -- QA_BRANCH=main pnpm qa:env:setup
```

---

## 8. Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **ComboboxCellEditor too complex** | High | Build incrementally (week 1: dropdown, week 2: typeahead, week 3: a11y). If AG Grid Rich Select covers 80% of needs, stop and use it. |
| **Abstraction creep** | High | Templates are opt-in composition, not a mandatory framework. Views can bypass any template and write bespoke code. |
| **Mixed-migration UX** | Medium | Phase 1 is the ONLY phase where old and new coexist. After Phase 1 validates, subsequent phases follow same pattern. No view is partially migrated. |
| **SalesView breaks** | Blocker | Phase 3A is the hard gate. All existing tests must pass before any new component touches SalesView. If 3A fails, reassess. |
| **20 weeks still optimistic** | Medium | Buffer in Phase 3D (remaining views) and Phase 4 (polish). If a phase runs long, cut scope from the long tail of views. |
| **Filter state bridge complexity** | Medium | Bridge is a translation layer, not a unified grammar. Each system keeps its own representation. |
| **AG Grid performance with custom editors** | Low | ComboboxCellEditor only renders on edit (AG Grid's virtual DOM). Typeahead filtering happens client-side for lists ≤500. |
| **TanStack Query cache invalidation** | Low | Existing invalidation strategy unchanged. Slide-over tabs use their own queries (as today in ContextDrawer). |

---

## 9. Rollout & Rollback

### Feature Flags (Per Component)
- `FEATURE_GRID_VIEW_TEMPLATE` — enables GridView template per view
- `FEATURE_FILTER_TOOLBAR` — enables FilterToolbar vs. AdvancedFilterBuilder
- `FEATURE_INLINE_COMBOBOX` — enables ComboboxCellEditor for editable columns
- `FEATURE_BULK_ACTION_BAR` — enables BulkActionBar vs. StatusActionBar
- `FEATURE_DETAIL_SLIDEOVER` — enables DetailSlideover vs. ContextDrawer

Rollback is a flag toggle, not a git revert. Enable per-view or per-user for gradual rollout.

### Branch Strategy
```
mercury-ux/phase-0-foundation
mercury-ux/phase-1-pilot-view
mercury-ux/phase-2-gridjourney-views
mercury-ux/phase-3a-sales-refactor
mercury-ux/phase-3b-sales-migration
mercury-ux/phase-3c-intake-dashboard
mercury-ux/phase-3d-remaining-views
mercury-ux/phase-4-polish
```

Each branch merges to `main` after validation. Subsequent branches rebase on previous merge.

---

## 10. Documentation Requirements

### During Implementation (Per Phase)
- [ ] Update `docs/design-system/components/` with new component docs
- [ ] Append `docs/design-system/decisions-log.md` with rationale
- [ ] Update `docs/design-system/INDEX.md` if component categories change
- [ ] Run `pnpm docs:inventory` to regenerate component inventory

### Post-Completion
- [ ] `docs/engineering-plans/mercury-ux-adoption.md` — this plan (updated with actuals)
- [ ] `docs/engineering-plans/view-migration-playbook.md` — how to migrate a view
- [ ] `docs/engineering-plans/command-verification-matrix.md` — verified trigger paths
- [ ] `docs/design-system/components/combobox-cell-editor.md` — usage guide
- [ ] `docs/design-system/components/filter-toolbar.md`
- [ ] `docs/design-system/components/bulk-action-bar.md`
- [ ] `docs/design-system/components/detail-slideover.md` — including tab registry
- [ ] `docs/design-system/templates/grid-view.md` — template usage
- [ ] Linear issues for tracked follow-ups

---

## 11. Decision Log

| Decision | Rationale | Rejected Alternative |
|----------|-----------|---------------------|
| Schema-driven columns | Eliminates 2000+ lines of imperative column defs; ensures consistency across views | Per-view ColDef arrays (too much duplication) |
| Entity state machines for actions | One source of truth; eliminates 8+ duplicated StatusActionTable components | Per-view decision tables (current — duplicated) |
| DetailSlideover for entity detail only | Quick context without losing table position; cross-reference panels stay inline | Universal slide-over for everything (GPT-5.5 warned against) |
| Full-page routes for deep entity work | Complex entities benefit from full-screen layout (Mercury's pattern for accounts) | Slide-over only (limits screen real estate) |
| Templates as opt-in composition | Standardization without rigidity; complex views add bespoke sections | Mandatory templates (too rigid) or all bespoke (too much duplication) |
| FilterToolbar + AdvancedFilterBuilder bridge | Simple filters are fast; complex filters are possible | One unified filter grammar (GPT-5.5 warned against) |
| AG Grid native where possible, custom where needed | AG Grid Rich Select covers 80% of combobox needs; custom only for typeahead/create-new | All-custom ComboboxCellEditor (over-engineering) |
| 20-week phased rollout with gates | Prevents mixed-migration UX; proves patterns before scaling | Big-bang migration (high risk) |
| Feature flags per component | Rollback is a flag toggle; per-view/per-user rollout | Deploy-time rollback (slow, risky) |

---

## 12. Codebase After Retrofit

```
src/
├── config/
│   ├── entity-schemas.ts       ← "What fields does each entity have?"
│   ├── entity-actions.ts       ← "What can you do with each entity in each state?"
│   ├── view-registry.ts        ← "What views exist, what templates do they use?"
│   └── filter-presets.ts       ← "What filter presets exist per entity?"
├── templates/
│   ├── GridView.tsx            ← The workhorse (15+ views)
│   ├── MasterDetailView.tsx    ← Hierarchical data (Intake, PO lines)
│   ├── DashboardView.tsx       ← Dashboard
│   └── WizardView.tsx          ← Multi-step flows (Pick)
├── components/
│   ├── editors/
│   │   └── ComboboxCellEditor.tsx
│   ├── FilterToolbar.tsx
│   ├── BulkActionBar.tsx
│   ├── DetailSlideover.tsx     ← Shell — tabs register themselves
│   ├── ViewTabBar.tsx
│   └── GridSummaryStrip.tsx
├── hooks/
│   ├── useViewData.ts          ← One hook per view's data needs
│   ├── useEntityActions.ts     ← State machine → available actions
│   ├── useColumnDefs.ts        ← Schema → AG Grid ColDef
│   └── [per-entity hooks]      ← useSalesLineRows, usePOSelectionActions, etc.
└── views/
    ├── SalesView.tsx           ← ~400 lines (was 1986)
    ├── PurchaseOrdersView.tsx  ← ~300 lines (was 987)
    ├── IntakeView.tsx          ← ~300 lines (was 833)
    └── ...                     ← All views shrunk 60-80%
```

---

## 13. What a New Developer Would Do

### Adding a New Grid View (~2 hours)
```typescript
// 1. Define entity schema
const NewEntity = entitySchema({
  id:     { header: 'ID',     width: 150, pinned: 'left' },
  name:   { header: 'Name',   width: 200 },
  status: { header: 'Status', width: 130, editor: 'combobox', enum: MY_STATUSES },
  amount: { header: 'Amount', width: 120, type: 'money' },
});

// 2. Define state machine
const NewEntitySM = defineStateMachine({
  entity: 'newEntity',
  states: {
    draft:    { actions: ['publish', 'delete'], primary: 'publish' },
    published:{ actions: ['archive', 'edit'],  primary: 'edit' },
  },
});

// 3. Register view
registerView({
  key: 'newEntities', template: 'gridView', title: 'New Entities',
  entity: NewEntity, stateMachine: NewEntitySM,
  summaryQuery: (vk) => trpc.queries.newEntityAggregates.useQuery({ view: vk }),
  detailTabs: [
    { key: 'overview', label: 'Overview', component: NewEntityOverviewTab },
  ],
});

// 4. Add route
// <Route path="/new-entities" element={<GridView viewKey="newEntities" />} />
```

**They DON'T need to:** Write filter logic, bulk action decision tables, column definitions, data fetching code, or layout CSS.

### Adding a Complex View (~1-2 days)
For views needing bespoke sections:
1. Choose closest template (GridView, MasterDetailView)
2. Define entity schema + state machine (same as simple view)
3. Add bespoke sections using template's extension slots
4. Write custom components for the unique parts

---

## Appendix A: Affected Views

### GridView Template (~15 views)
PurchaseOrders, Orders, Payments, Inventory, Clients, Vendors, Fulfillment, VendorPayables, Connectors, PurchaseReceipts, InvoiceDisputes, Closeout, Recovery, Media, Referees

### MasterDetailView Template (~2 views)
IntakeView, PurchaseOrdersView (selected PO lines)

### DashboardView Template (1 view)
DashboardView

### WizardView Template (1 view)
PickView

### Custom (Template Base + Bespoke Extensions) (~6 views)
SalesView, MatchmakingView, CreditReviewView, ProcessorsView, ItemsView, ContactsView

### Unchanged (Already Clean) (~3 views)
SettingsView, ContactProfileView, MergeCandidatesView

### Mobile Views (7 views)
Adapted in Phase 4

---

## Appendix B: Component Consolidation

| Old | New |
|-----|-----|
| ContextDrawer (5 states) | DetailSlideover (3 states + full-page route) |
| VendorContextDrawer | Tab in DetailSlideover |
| RelationshipDrawer | Tab in DetailSlideover |
| InventoryFinderPanel | Inline collapsible section (can be pinned) |
| PhotographyQueuePanel | Tab in DetailSlideover |
| CustomerPurchaseHistoryPanel | Inline collapsible section |
| RowCommandHistoryDrawer | Tab in DetailSlideover |
| IssueSidecar | Section in DetailSlideover |
| ReceiptPanel | Tab in DetailSlideover |
| ReceiptPreviewDrawer | DetailSlideover (from button) |
| RecordPrepaymentDialog | Modal (unchanged) |
| RefereeDialog | DetailSlideover or modal |
| MediaBatchDrawer | DetailSlideover |
| ProcessorDetailPanel | DetailSlideover |
| SalesSourcePane | Inline collapsible section |
| AdvancedFilterBuilder | Accessible via "Advanced" button in FilterToolbar |
| FilterPresetStrip | ViewTabBar |
| StatusActionBar (per view) | BulkActionBar |
| StatusActionTable (per view) | Entity state machine + BulkActionBar |
| WorkspacePanel (various) | Template sections + inline collapsible sections |

---

*End of plan. This is the document to execute from.*


---

## 14. Action Placement Rubric (Updated from Design Audit)

Every view, template, and new component must follow these rules. They are derived from the 2026-06-15 action placement audit, design decisions log, and Mercury pattern analysis. Agents MUST verify placement against this rubric for every task.

### R1: Zero-Selection Primary Action
Every view has ONE visible primary action even when nothing is selected. This is the operator's starting affordance. Place in the template's header CTA slot.

### R2: Selection Actions → BulkActionBar Only
Actions on selected rows live exclusively in BulkActionBar. Row expansion shows supplementary per-row actions only (preview, quick info). Never duplicate the same command in both places.

### R3: Row Expansion ≤4 Buttons
If more than 4 actions exist, group: show top 2-3 + "More ▾" dropdown.

### R4: Destructive Actions Always Confirmed
Any delete/cancel/void/reject action MUST use `useConfirm()` with `tone: 'danger'`. Never fire destructive `runCommand` without confirmation.

### R5: Danger Styling Unified
All destructive buttons use `tone: 'danger'` → `btn-danger`. No inline `style={{ color: '#b42318' }}`.

### R6: Contextual Actions Near Target
Per-row actions must be visible near their row. No distant panels requiring scroll from selection.

### R7: Discoverable, Not Hidden
Power-user features need visible affordances — `<kbd>` badge, tooltip, or menu entry.

---

## 15. Stub Cleanup + Test Resilience

See `work-breakdown/01-integration-findings.md` for the full audit and remediation plan. Summary:

**Stubs fixed in Phase 0-C:**
- CAP-030 PickView stubs → extracted to mock module
- SalesCommandHistoryTab "coming soon" → honest empty state
- RefereeCreditsList disabled button → hidden until CAP-039
- 4 dead backend procedures → removed or wired
- Merge-candidates zero counter → hidden until BE-014

**Tests hardened in Phase 0-T:**
- CSS class assertions → semantic queries
- DOM structure coupling → role-based queries
- Hardcoded magic numbers → derived values
- Drizzle ORM chain mocking → service-layer mocks
- Seed-data-dependent E2E skips → self-creating test data
- Skipped unit tests → implemented or deleted

**Design patterns REJECTED (must not bleed into new code):**
- Multiple WorkspacePanels stacked → template-based layout
- Inline cell renderers with useMemo on view state → stable components with cellRendererParams
- Per-view ColDef arrays → entity schemas
- Per-view StatusActionTable → entity state machines
- Inline style objects → semantic CSS classes
- test.skip(true, ...) → self-creating test data
- Permanently disabled "coming soon" buttons → hidden until implemented
- Dead backend procedures → removed or wired

**Design constraints PRESERVED (from decisions log):**
- All mutations via useCommandRunner
- One Zustand store
- Hybrid Tailwind + semantic CSS
- Green = interactive, Blue = status
- Real status values from schema.ts + commandBus.ts
- useConfirm() for all confirmations
- audit:form-ids fails on unlabeled controls
- Entity UUIDs not in localStorage
- AG Grid desktop only, mobile uses card/list layouts
- Booleans never render as text
- Empty states name the producing verb
- Disabled controls carry title tooltip

## 16. Updated Task Count

| Phase | Original Tasks | Cleanup Tasks | Total |
|-------|---------------|---------------|-------|
| 0 — Foundation | 16 | 11 (C1-C5, T1-T6) | 27 |
| 1 — Pilot | 9 | 0 | 9 |
| 2 — GridJourney | 8 | 0 | 8 |
| 3A — Sales Refactor | 12 | 0 | 12 |
| 3B — Sales Migration | 10 | 0 | 10 |
| 3C — Intake+Dashboard | 6 | 0 | 6 |
| 3D — Remaining | 10 | 0 | 10 |
| 4 — Polish | 9 | 0 | 9 |
| **Total** | **80** | **11** | **91** |

