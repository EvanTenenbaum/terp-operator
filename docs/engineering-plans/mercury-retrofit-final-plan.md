# Mercury UX Retrofit — Final Holistic Execution Plan

**Date:** 2026-06-15
**Synthesis of:** Original engineering plan + AQA adversarial review + Gemini templating analysis + GPT-5.5 pragmatism review
**Status:** Execution-ready, pending team review

---

## 0. Design Philosophy (The North Star)

### What We're Building

A TERP Operator where:
- **Every view follows one of 4 layout templates** — no bespoke page structure per view
- **Column definitions are declarative** — change a schema field, grid updates automatically
- **Context is progressive, not permanent** — what you need now is visible; everything else is one click away
- **Actions follow entity state machines** — no per-view if/else logic for "what can I do with this?"
- **A new developer can add a view in hours, not days** — because the patterns are templated, not rediscovered

### What We're NOT Building

- A reusable UI framework library (this is for TERP, not npm)
- A system where every view is forced into a template it doesn't fit
- A migration where some views are Mercury-style and others are old-style simultaneously for months

### The Three Principles

1. **Composition over framework.** Templates are components you compose, not a framework you're trapped in.
2. **Opt-in templating.** Views use templates where they fit; complex views add bespoke sections where needed.
3. **Ship tranches, prove at gates.** Every phase produces a working, testable increment. No big reveal.

---

## 1. View Layout Templates (From Gemini + GPT-5.5 Synthesis)

Instead of 27 views each building their own layout, views adopt one of 4 templates:

### Template A: GridView
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
**Configuration:** column schema, filter presets, summary queries, bulk action rules, detail tabs
**What's templated:** 95%. Only the configuration changes per view.

### Template B: MasterDetailView
```
┌─FilterToolbar────────────────────────────────────────────┐
├─SummaryStrip──────────────────────────────────────────────┤
├─OperatorGrid (master rows, expandable)────────────────────┤
│  ▸ Row 1                                                  │
│  ▾ Row 2                                                  │
│    ┌─Detail grid (child rows, inline)──────────────────┐ │
│    └────────────────────────────────────────────────────┘ │
├─BulkActionBar (conditional)───────────────────────────────┤
└───────────────────────────────────────────────────────────┘
```
**Used by:** IntakeView, PurchaseOrdersView (selected PO lines)
**What's templated:** 80%. Detail grid configuration is bespoke per view.

### Template C: DashboardView
```
┌─Welcome + Quick Actions───────────────────────────────────┐
├─KPI Strip (horizontal cards)──────────────────────────────┤
├─Section A (2-col)──────┬──Section B───────────────────────┤
│  Focus items           │  Work queues                     │
├─Activity Feed─────────────────────────────────────────────┤
│  Drafts · Recent · Credit Watch                           │
└───────────────────────────────────────────────────────────┘
```
**Used by:** DashboardView
**What's templated:** 70%. Section content is bespoke.

### Template D: WizardView
```
┌─Step Indicator────────────────────────────────────────────┐
│  Step 1 → Step 2 → Step 3                                 │
├─Current Step Content──────────────────────────────────────┤
└───────────────────────────────────────────────────────────┘
```
**Used by:** PickView (queue → list → line), future guided workflows
**What's templated:** 50%. Step content is bespoke.

### Views That Don't Fit Templates
Some views genuinely need custom layouts:
- **SalesView** — Template A (GridView) + inline workspace section for customer context
- **SettingsView** — Tabbed settings (already clean, keep as-is)
- **ContactProfileView** — Tabbed profile (already clean, keep as-is)

**GPT-5.5 was right:** Don't force every view into a template. Templates are the DEFAULT, not the only option.

---

## 2. Declarative Column System (From Gemini)

### Schema-Driven Column Definitions

Today: Every view defines columns imperatively as arrays of AG Grid `ColDef` objects. SalesView has 40+ column definitions across 3 grids.

After: Each entity has a schema. Columns are generated from the schema. Customizations are overrides.

```typescript
// src/config/entity-schemas.ts

const PurchaseOrder = entitySchema({
  id:        { header: 'PO #',    width: 150, pinned: 'left' },
  vendor:    { header: 'Vendor',  width: 190 },
  status:    { header: 'Status',  width: 135, editor: 'combobox', 
               enum: PO_STATUSES },
  expectedDate: { header: 'Expected', width: 165, editor: 'date' },
  total:     { header: 'Total',   width: 120, type: 'money' },
  lines:     { header: 'Lines',   width: 95,  hide: true },
  buyerNotes: { header: 'Notes',  minWidth: 220, editor: 'text', 
                hide: true },
  // ... 15 more fields
});

// Auto-generates AG Grid ColDef array
const columns = entitySchemaToColDefs(PurchaseOrder);
```

**Benefits:**
- Adding a field to an entity = one line in the schema, not hunting through view files
- All `status` columns across all entities look and behave the same (combobox, same styling, same filtering)
- Types are inferable: `editor: 'combobox'` automatically picks `ComboboxCellEditor`
- Column visibility prefs still work (AG Grid `hide: true` respected)

**Edge cases handled by overrides:**
```typescript
// For columns that need custom cell renderers
entitySchema({
  // ... normal fields
  pickStatus: { 
    header: 'Pick', width: 140, 
    cellRenderer: PickStatusChip,  // Custom component override
  },
  derivedCogs: {
    header: 'COGS', width: 130,
    valueGetter: computeDerivedCogs, // Custom value getter
    cellStyle: pricingCellStyle,     // Custom styling
  },
});
```

**What this replaces:** ~2000 lines of imperative column definitions across ~15 views become a schema file + a factory function.

**GPT-5.5's concern addressed:** The factory handles overrides cleanly. Custom columns aren't forced into the generic mold — they just declare their customizations explicitly instead of inline in a useMemo.

---

## 3. Data Contract Hook (From Gemini)

### `useViewData(viewKey, filters)` 

Today: Every view calls 2-10 separate `trpc.*.useQuery()` calls. SalesView has 10.

After: One hook per view.

```typescript
function useViewData(viewKey: ViewKey, filters: FilterState) {
  // Centralized query registry
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
      // ... remaining queries
    }),
    // ... per-view query maps
  };

  return queryMap[viewKey]();
}
```

**Benefits:**
- Views shrink: `<GridView data={useViewData('sales', filters)} />` instead of 10 separate queries
- Loading/error states handled once, not per query
- New views declare data needs in one place

**GPT-5.5's concern addressed:** The hook uses `enabled` flags intelligently — queries that depend on filtered state don't fire until that state exists. No over-fetching. TanStack Query's `select` transforms are used per-query for data shaping.

---

## 4. Entity Action System (From Gemini)

### `useEntityActions(entityType, selectedRows)`

Today: Every view has a StatusActionBar with a decision table mapping status → available actions. This repeats across 8+ views.

After: Entity state machines defined once. Action availability derived automatically.

```typescript
// src/config/entity-actions.ts

const SalesOrderStateMachine = defineStateMachine({
  entity: 'salesOrder',
  states: {
    draft: {
      actions: ['confirm', 'reprice', 'cancel'],
      primary: 'confirm',
    },
    confirmed: {
      actions: ['post', 'allocateToFulfillment', 'createPickList', 'reprice', 'cancel'],
      primary: 'post',
    },
    posted: {
      actions: ['allocateToFulfillment', 'createPickList', 'reprice'],
      primary: 'createPickList',
    },
    fulfilled: {
      actions: [],
      primary: null,
    },
  },
  // Cross-state actions (available regardless of status)
  globalActions: ['viewOrder', 'exportCSV'],
  // Multi-row constraints
  multiRowConstraints: {
    'confirm': (rows) => rows.every(r => r.status === 'draft' && r.customer),
    'cancel': (rows) => rows.every(r => r.status === 'draft' || r.status === 'confirmed'),
  },
});

// In the view:
const actions = useEntityActions('salesOrder', selectedRows);
// → [{ key: 'confirm', label: 'Confirm', primary: true, enabled: true }, ...]
```

**Benefits:**
- One source of truth for "what can I do with this entity in this state?"
- Adding a new status to an entity = update the state machine, all views using that entity get the new actions
- Gating (requires customer, requires manager, requires single row) is declarative
- **GPT-5.5's concern addressed:** Actions that need bespoke inputs (like `routeConnectorRequest` requiring `routedTo`) are handled by the BulkActionBar's action slot, which renders a small inline input next to the button when needed. The state machine doesn't try to template the input — it just declares that the action needs one.

### What the state machine DOESN'T try to template (GPT-5.5 was right)
- Complex multi-step confirmations (VerifyAllIntake with preview body) — these stay as bespoke dialogs triggered by the action
- Side-effecting workflows (releaseLineForPicking → warehouse notification) — the action name is shared, the handler is per-view
- Partial-failure handling — the BulkActionBar shows results per-row after batch operations, not from the state machine

---

## 5. Filter Architecture (AQA Remediation + GPT-5.5)

### FilterToolbar + AdvancedFilterBuilder Bridge

The two systems coexist through explicit serialization:

```
Simple chips (FilterToolbar)          Complex filters (AdvancedFilterBuilder)
status:eq:draft                       { AND: [
amount:gte:100                          { field: 'category', op: 'eq', value: 'flower' },
───────────────────────                 { field: 'price',    op: 'gt', value: 100 }
   ↕ bridge ↕                         ]}
                                     OR
                                       { field: 'vendor', op: 'eq', value: 'acme' }
                                     ]
```

**Bridge rules:**
1. Simple → Advanced: Click "Advanced" → chips serialize to an AND group → Advanced opens pre-populated
2. Advanced → Simple: Click "Apply" → extract simple fields as chips; show amber "Complex filter active" pill if AND/OR/nesting remains
3. Clear all clears both systems
4. Saved views ("Data views" dropdown) can include either simple or complex filters

**GPT-5.5's concern addressed:** The bridge is a translation layer, not a unified grammar. Simple chips, URL state, saved views, and Advanced boolean filters each have their own representation. The bridge maps between them without forcing them into one format.

---

## 6. DetailSlideover — Scoped Not Universal

### What It Is
A right-side panel (3 states: peek 280px, standard 420px, wide 60%) for entity detail.

### What It Is NOT
A universal container for every panel in the application.

### Tab Registry (Scoped)
The tab registry is used ONLY for entity detail tabs that replace the old ContextDrawer. It does NOT absorb:
- RecordPrepaymentDialog → stays a modal (it's a focused financial action with amount validation)
- InventoryFinder → stays an inline collapsible section OR a slide-over opened from "Add line" (not a tab in the entity detail slide-over)
- Photography queue → tab in customer slide-over (makes sense — it's entity context)
- Sheet preview → slide-over opened from "Preview sheet" button (makes sense — it's a document preview)

**GPT-5.5's concern addressed:** The slide-over is a tool, not a framework. Entity detail uses it. Cross-reference workflows keep their context inline. Modals stay modals.

### Entity Detail vs. Full-Page Navigation

| Entity | Detail Access | Deep Work |
|--------|--------------|-----------|
| Purchase Order | Slide-over (lines + vendor + timeline tabs) | `/purchase-orders/:id` — full-page with all tabs |
| Sales Order | Slide-over (lines + pricing + fulfillment tabs) | `/sales/orders/:id` |
| Customer | Slide-over (overview + orders + history + credit tabs) | `/contacts/:id` |
| Vendor | Slide-over (overview + POs + payments tabs) | `/contacts/:id` |
| Lot/Batch | Slide-over (movement + sales + photos tabs) | `/inventory/:batchId` |

Full-page routes exist for deep work (Mercury's pattern for accounts). The slide-over is for quick context without losing your place in the table.

---

## 7. Revised Implementation Phases (20 Weeks)

### Phase 0 — Foundation (Weeks 1-3)

**Goal:** Templates and components built. Zero views touched.

| Week | Tasks |
|------|-------|
| 1–2 | Build `ComboboxCellEditor` (AG Grid ICellEditor, typeahead, async save, a11y) |
| 2 | Build `DetailSlideover` shell + tab registry |
| 2 | Build `FilterToolbar` + FilterBridge (serialization, two-way sync) |
| 3 | Build `BulkActionBar` (replaces StatusActionBar render) |
| 3 | Build `ViewTabBar`, `GridSummaryStrip` |
| 3 | Define entity schemas for GridJourney views (PurchaseOrder, Order, Payment, etc.) |
| 3 | Define state machines for GridJourney entities |

**Gate:** All new components have unit tests. Typecheck passes. Schema → ColDef factory works for all GridJourney entities. FilterBridge round-trips correctly.

### Phase 1 — Pilot (Weeks 4-5)

**Goal:** PurchaseOrdersView fully retrofitted. Prove all patterns work.

| Week | Tasks |
|------|-------|
| 4 | Replace PurchaseOrdersView layout with GridView template |
| 4 | Wire FilterToolbar, SummaryStrip, ViewTabBar, BulkActionBar |
| 4 | Wire `useEntityActions('purchaseOrder')` for bulk actions |
| 4 | Wire DetailSlideover with PO tabs (lines + linked-intake + vendor + history) |
| 4 | Convert status column to ComboboxCellEditor |
| 5 | Full validation: Playwright e2e + existing tests + browser QA |
| 5 | Document migration playbook |

**Gate:** PurchaseOrdersView fully functional. All existing tests pass. Migration playbook written.

### Phase 2 — GridJourney Views (Weeks 6-7)

**Goal:** ~10 GridJourney views adopt GridView template.

| Week | Tasks |
|------|-------|
| 6 | Define entity schemas + state machines for remaining GridJourney entities |
| 6 | Wire `useViewData` hook for each view |
| 6 | Roll out GridView template to 5 views (Orders, Payments, Inventory, Clients, Fulfillment) |
| 7 | Roll out GridView template to remaining 5 views |
| 7 | Full validation |

**Gate:** All GridJourney views use GridView template. No regressions.

### Phase 3A — SalesView Prerequisite Refactoring (Weeks 8-10)

**Goal:** SalesView code reorganized. Cell renderers extracted. Columns stabilized. Zero new components. All tests pass.

| Week | Tasks |
|------|-------|
| 8 | Extract 9 inline cell renderers from `lineColumns` into named components |
| 8 | Stabilize `fulfillmentActionsColumn` (remove useMemo dependency on isRunning) |
| 9 | Extract `lineRowsWithRule` into `useSalesLineRows` hook |
| 9 | Extract `salePrePostChecks` into `useSalePrePostChecks` hook |
| 10 | Extract `buildConfirmPayload` into dedicated function |
| 10 | Full test suite pass |

**Gate:** SalesView behavior unchanged. All 5 SalesView test suites pass. Code is organized for component wiring in next phase.

### Phase 3B — SalesView Migration (Weeks 11-13)

**Goal:** New components wired into SalesView.

| Week | Tasks |
|------|-------|
| 11 | Adopt GridView template as base layout |
| 11 | Wire FilterToolbar (presets + customer scope chip) |
| 11 | Wire SummaryStrip for sales aggregates |
| 12 | Wire BulkActionBar with entity actions |
| 12 | Wire ViewTabBar for status filtering |
| 12 | Wire ComboboxCellEditor for status, pricingStrategy, tags columns |
| 13 | Customer workspace context header (balance, credit, pre-post checks) |
| 13 | Full validation: all 5 SalesView test suites + Playwright e2e + browser QA |

**Gate:** SalesView fully functional with new components. All tests pass.

### Phase 3C — IntakeView + DashboardView (Weeks 14-15)

| Week | Tasks |
|------|-------|
| 14 | IntakeView: adopt MasterDetailView template. FilterToolbar. ComboboxCellEditor for arrivalStatus/discrepancyReason. |
| 15 | DashboardView: adopt DashboardView template. KPI strip. CTA slot. Work queue cards. |

### Phase 3D — Remaining Complex Views (Weeks 16-18)

| Week | Views |
|------|-------|
| 16 | MatchmakingView (5 grids → tabbed GridView), PickView (WizardView template) |
| 17 | RecoveryView (GridView + filter chips), CloseoutView (GridView + blocker drilldown), CreditReviewView (GridView + tabs) |
| 18 | MediaView, RefereesView, ProcessorsView, SettingsView, ItemsView, ContactsView, InvoiceDisputesView, PurchaseReceiptsView |

### Phase 4 — Polish (Weeks 19-20)

| Week | Tasks |
|------|-------|
| 19 | Mobile view adaptations (7 views) |
| 19 | Accessibility audit (keyboard nav, screen readers, ARIA) |
| 19 | Performance check (ComboboxCellEditor typeahead, Grid render, TanStack Query caching) |
| 20 | Documentation (design system, decision log, component inventory) |
| 20 | Persona flow QA (critical views) |
| 20 | Cleanup (deprecate unused code, final test suite pass) |

---

## 8. What a New Developer Would See

### Adding a New Grid View (1-2 hours)
```typescript
// 1. Define entity schema
const NewEntity = entitySchema({
  id:     { header: 'ID',     width: 150, pinned: 'left' },
  name:   { header: 'Name',   width: 200 },
  status: { header: 'Status', width: 130, editor: 'combobox', enum: MY_STATUSES },
  amount: { header: 'Amount', width: 120, type: 'money' },
});

// 2. Define state machine
const NewEntityStateMachine = defineStateMachine({
  entity: 'newEntity',
  states: {
    draft:    { actions: ['publish', 'delete'], primary: 'publish' },
    published:{ actions: ['archive', 'edit'],  primary: 'edit' },
    archived: { actions: [], primary: null },
  },
});

// 3. Register view
registerView({
  key: 'newEntities',
  template: 'gridView',
  title: 'New Entities',
  entity: NewEntity,
  stateMachine: NewEntityStateMachine,
  summaryQuery: (viewKey) => trpc.queries.newEntityAggregates.useQuery({ view: viewKey }),
  detailTabs: [
    { key: 'overview', label: 'Overview', component: NewEntityOverviewTab },
    { key: 'related',  label: 'Related',  component: NewEntityRelatedTab },
  ],
});

// 4. Add route
// In App.tsx: <Route path="/new-entities" element={<GridView viewKey="newEntities" />} />
```

**What they DON'T need to do:**
- Write filter logic (auto-generated from schema fields)
- Write bulk action decision tables (from state machine)
- Write column definitions (from schema)
- Write data fetching (from `useViewData`)
- Design the layout (GridView template)

### Adding a New Complex View (1-2 days)
For views that don't fit the GridView template, the developer:
1. Chooses the closest template (GridView, MasterDetailView, DashboardView)
2. Adds bespoke sections using the template's extension slots
3. Defines entity schema + state machine (same as simple view)
4. Writes custom components for the bespoke sections

The template provides the shell. The developer fills in the unique parts.

---

## 9. Coherence Check — Would a Team Be Confused?

### The Architecture Tells a Clear Story

1. **"How do I build a new view?"** → Pick a template, define a schema, register the view. That's it for most views.
2. **"How does filtering work?"** → FilterToolbar chips for simple, Advanced button for complex. Bridge handles translation.
3. **"How do entities show detail?"** → Slide-over for quick context, full-page route for deep work. Tabs registered per entity.
4. **"How do I know what actions are available?"** → Entity state machine. One source of truth.
5. **"Where does data come from?"** → `useViewData` hook. One place per view.
6. **"What if my view doesn't fit a template?"** → Use a template as base, add bespoke sections in extension slots. Templates are opt-in composition, not a mandatory framework.

### The Codebase Would Read Top-Down

```
src/
├── config/
│   ├── entity-schemas.ts       ← "What fields does each entity have?"
│   ├── entity-actions.ts       ← "What can you do with each entity in each state?"
│   ├── view-registry.ts        ← "What views exist, what templates do they use?"
│   └── filter-presets.ts       ← "What filter presets exist per entity?"
├── templates/
│   ├── GridView.tsx            ← The workhorse template
│   ├── MasterDetailView.tsx    ← For hierarchical data
│   ├── DashboardView.tsx       ← For dashboards
│   └── WizardView.tsx          ← For multi-step flows
├── components/
│   ├── FilterToolbar.tsx       ← Shared — not per-view
│   ├── BulkActionBar.tsx       ← Shared — not per-view
│   ├── DetailSlideover.tsx     ← Shell — tabs register themselves
│   ├── ComboboxCellEditor.tsx  ← AG Grid editor
│   └── GridSummaryStrip.tsx    ← Shared — not per-view
├── hooks/
│   ├── useViewData.ts          ← One hook per view's data needs
│   ├── useEntityActions.ts     ← State machine → available actions
│   └── useColumnDefs.ts        ← Schema → AG Grid ColDef
└── views/
    ├── SalesView.tsx           ← NOW ~400 lines (orchestration only)
    ├── PurchaseOrdersView.tsx  ← NOW ~300 lines
    ├── IntakeView.tsx          ← NOW ~300 lines
    └── ...                     ← All views shrunk by 60-80%
```

---

## 10. Risk Mitigation

### Top Risks (From GPT-5.5 + AQA)

| Risk | Mitigation |
|------|-----------|
| **ComboboxCellEditor too complex** | Build incrementally: Week 1 = basic dropdown, Week 2 = typeahead + async save, Week 3 = a11y + edge cases. If AG Grid Rich Select covers 80% of needs, stop there and use it. |
| **Abstraction creep** | Each template/hook is optional. Views can bypass any abstraction and write bespoke code. The template is a starting point, not a prison. |
| **Mixed-migration UX** | Phase 1 is the ONLY phase where old and new coexist. After Phase 1 validates PurchaseOrdersView, subsequent phases follow the same pattern. No view is partially migrated. |
| **SalesView breaks** | Phase 3A is the hard gate. Cell renderers extracted, columns stabilized, ALL existing tests pass BEFORE any new component is wired. If 3A fails, reassess. |
| **20 weeks still optimistic** | If Phase 3A (SalesView prerequisite refactoring) takes longer than 3 weeks, accept it. The timeline has buffer in Phase 3D (remaining complex views) and Phase 4 (polish). |

### Acceptance Criteria Per Phase

| Phase | Must Pass |
|-------|-----------|
| 0 | All new components have unit tests. Typecheck. |
| 1 | PurchaseOrdersView fully functional. All existing tests pass. |
| 2 | All GridJourney views functional. All existing tests pass. |
| 3A | SalesView refactored, all 5 test suites pass. Behavior unchanged. |
| 3B | SalesView with new components, all 5 test suites pass. |
| 3C-D | All remaining views functional. All existing tests pass. |
| 4 | Full test suite. Persona flow QA. Mobile views. Accessibility. |

---

## 11. Decision Log

| Decision | Rationale | Rejected Alternative |
|----------|-----------|---------------------|
| Schema-driven columns | Eliminates 2000+ lines of imperative column defs; ensures consistency | Per-view column arrays (current — too much duplication) |
| Entity state machines for actions | One source of truth; eliminates per-view decision table duplication | Per-view StatusActionTable (current — duplicated across 8+ views) |
| DetailSlideover for entity detail, NOT for everything | Quick context without losing table position; but cross-reference panels stay inline | Universal slide-over for everything (GPT-5.5 warned against this) |
| Full-page routes for deep work | Complex entities benefit from full-screen layout (Mercury pattern) | Slide-over only (limits screen real estate for complex entities) |
| Template-based views, opt-in | Standardization without rigidity; complex views add bespoke sections | Every view templated (too rigid) or every view bespoke (too much duplication) |
| FilterToolbar + AdvancedFilterBuilder bridge | Simple filters are fast; complex filters are possible | One unified filter system (GPT-5.5 warned against forcing one grammar) |
| AG Grid native where possible, custom where needed | AG Grid Rich Select covers 80% of combobox needs; build custom for the 20% that need typeahead/create-new | All-custom ComboboxCellEditor (over-engineering) or all-AG-Grid-native (can't do create-new) |
| Phased rollout with explicit gates | Prevents mixed-migration UX; proves patterns before scaling | Big-bang migration (high risk) or gradual ad-hoc rollout (inconsistent UX) |

---

## 12. Summary

**What this plan delivers:**
- A TERP Operator where adding a new view takes hours, not days
- Entity schemas, state machines, and view templates that eliminate duplicated code
- Mercury-inspired patterns (inline editing, filter toolbar, bulk actions, progressive disclosure) adapted for brokerage density
- A codebase a new developer can understand top-down: schemas → templates → views

**What this plan avoids:**
- Building a reusable UI framework (this is for TERP, not npm)
- Forcing every view into a template it doesn't fit
- Months of mixed old/new UX during migration
- Abstractions that developers fight instead of benefit from

**Timeline:** 20 weeks, one engineer, shipping incrementally at every phase gate.

**North Star:** Templates where they help, bespoke where they don't. Composition over framework. Ship tranches, prove at gates.

