# PrimaryGridView — Template Specification (Refactor Target of GridJourney)

**Type:** View layout template
**Refactor target:** `GridJourney` factory at `src/client/views/operations/shared.tsx:247` (existing; ~64 lines plus a 210-line `columnsByView` map). This spec describes the shape of that factory *after* refactor and relocation to `src/client/templates/PrimaryGridView.tsx`. **There is no parallel build.** See `docs/design-system/decisions-log.md` (2026-06-16 entry "GridJourney → PrimaryGridView Refactor Decision") for the binding rationale.
**Authority:** `MERCURY-ARCHITECTURE-MANIFESTO.md` §2.1 (canonical shape), §4 (migration map row "GridJourney"), §5.2 (extension over replacement); `CPO-AUDIT-REPORT.md` F2 (P0).
**Status:** Spec rewritten 2026-06-16 to reflect refactor-in-place strategy. The original `grid-view.md` "GridView template" framing was a CPO-audit miss; this document supersedes it.

---

> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md). Read §§1–3, §6 before implementing.

## Manifesto Anchoring

| Field | Value |
|--------|-------|
| **UX Rule(s) Served** | UX-1 (one primary surface), UX-2 (state-gated actions), UX-3 (lazy supporting info), UX-4 (progressive disclosure of bulk bar), UX-8 (table IS the view) |
| **ARCH Rule(s) Followed** | ARCH-1 (one data source), ARCH-2 (state-machine actions), ARCH-3 (lazy mount), ARCH-4 (progressive disclosure), ARCH-8 (template-owned chrome), ARCH-12 (cell editors via useCommandRunner) |
| **Attention Budget Tier** | 0-hop (this IS the primary surface for 11 of the 27 views) |
| **Old Pattern Replaced** | (1) `GridJourney` factory's free-form callback props (`actions`, `prelude`, `selectionActions`, `inspectorTabs`, `onCellCommit`, `columns`, `expansionConfig`). (2) `columnsByView` map of inline ColDef arrays in `shared.tsx`. (3) Per-view `StatusActionTable` constructions in 11 views. (4) `OperatorGrid.inspectorTabs` bottom-anchored RowInspector. |
| **URL State Encoded** | None directly; delegates to `useViewUrlState(viewKey)` for `entityType`, `entityId`, `drawer`, `tab`, `status`, `f`, `sel`, `cur` (per P0-3 ContextDrawer→SlideOver decision). |
| **Existing Infra Leveraged** | `GridJourney` body (renamed and refactored), `OperatorGrid` (unchanged), `trpc.queries.grid.useQuery({view})` (unchanged), `useUiStore.selectedRows[view]` (unchanged), `useCommandRunner` (unchanged), `useViewUrlState` (new wrapper from P0-3), `entity-schemas.ts` + `useColumnDefs` (Phase 0 scaffold), `entity-actions.ts` + `useEntityActions` (Phase 0 scaffold), `tabs/registry.ts` (P0-3 sibling), `SlideOver` (P0-3 sibling). |
| **Anti-Patterns Avoided** | No per-view `ColDef[]`, no per-view `StatusActionTable`, no `useMemo` cell renderer closures over view state, no `onCellCommit` switch, no `WorkspacePanel` chrome in the template, no `actions` callback that returns ad-hoc top-of-grid buttons, no `inspectorTabs` bottom-anchored second supplementary surface (folds into `SlideOver` per P0-3). |
| **Compliance Check** | Open the migrated view file (e.g., PurchaseOrdersView). It should render only `<PrimaryGridView viewKey="purchaseOrders" />` (or `<PrimaryGridView viewKey="purchaseOrders" headerSlot={...} />` if the view has genuine primary-task header context). No `columns=`, `actions=`, `selectionActions=`, `inspectorTabs=`, `prelude=`, `onCellCommit=`, `expansionConfig=` props on `<PrimaryGridView`. Grep `rg "(actions=\|selectionActions=\|inspectorTabs=\|prelude=\|columns=\|onCellCommit=)" src/client/templates/PrimaryGridView` returns zero hits. Tree on cold load contains `FilterToolbar`, `SummaryStrip` (if configured), `OperatorGrid` — no `SlideOver`, no `BulkActionBar` until their gates open. |

---

## 1. Purpose

`PrimaryGridView` is the canonical list-style template for 11 of the 27 views. It composes `FilterToolbar` + optional `SummaryStrip` + `OperatorGrid` + (lazy) `SlideOver` + (selection-gated) `BulkActionBar` into the layout every "table IS the view" surface needs, sourcing every render decision from configuration registries (`view-registry.ts`, `entity-schemas.ts`, `entity-actions.ts`, `tabs/registry.ts`) rather than per-view callbacks.

---

## 2. Disposition table — what is preserved, renamed, refactored, dropped

Every behavior of today's `GridJourney` factory is classified.

| Concern | Today (`GridJourney` in `shared.tsx`) | Disposition | Target shape |
|---|---|---|---|
| File path | `src/client/views/operations/shared.tsx:247` (lives in the operations grab-bag) | RELOCATE | `src/client/templates/PrimaryGridView.tsx` (template gets its own home). Helpers (`labelFromToken`, `moneyish`, `dateish`, `formatRequestType`, `formatRequestSource`, `EMPTY_ROWS`) stay in `shared.tsx` to avoid import churn in ~30 files. |
| Component export | `GridJourney` | RENAME | `PrimaryGridView`. `GridJourney` re-exported from `templates/PrimaryGridView.tsx` as `@deprecated` alias for one release cycle. |
| Props type | Inline anonymous `{view, title, actions, prelude, onCellCommit, expansionConfig, columns, selectionActions, inspectorTabs, emptyTitle, emptyChildren}` | REPLACE | Named export `PrimaryGridViewProps { viewKey: ViewKey; headerSlot?: ReactNode }`. Old shape removed (transition wrapper handles legacy callers — see §10). |
| Primary query | `trpc.queries.grid.useQuery({ view })` | PRESERVE EXACTLY | Same call. Same dedupe semantics (`UnappliedCountBadge` in PaymentsView relies on this; `FulfillmentView`'s `fulfillmentPickColumns` derives from the same response). |
| Loading / error / retry | `loading={grid.isLoading} isError={grid.isError} onRetry={() => grid.refetch()}` | PRESERVE | Unchanged. Passed through to `OperatorGrid`. |
| Row selection → store | `setSelectedRows(view, rows)` on `OperatorGrid.onSelectionChange` | PRESERVE | Unchanged. `selectedRows[view]` continues to be the store slice. |
| Selection-state read | `useUiStore((s) => s.selectedRows[view])` for selection-gated rendering | PRESERVE | Used internally to gate `BulkActionBar` mount per ARCH-4. |
| Role gating (`canWrite`) | `me.data?.role !== 'viewer'` short-circuits `actions`, `selectionActions`, `expansionConfig` | PRESERVE + CENTRALIZE | Same check. Per ARCH-2 the state machine + `useEntityActions(entity, status, role)` enforces role at the action level too, so the canWrite gate is defense-in-depth, not the primary mechanism. |
| Command runner wiring | `const { runCommand, setNextSuccessActions } = useCommandRunner()` and pass-through to callbacks | PRESERVE INTERNALLY, REMOVE FROM SURFACE | The template still constructs `useCommandRunner` once; it no longer hands `runCommand` out via callback props. `BulkActionBar` and `ActionBar` (in `SlideOver`) consume `useCommandRunner` directly per ARCH-7. |
| Column source | `columns={columns ?? columnsByView[view] ?? []}` (inline arrays from `columnsByView` or per-view custom) | REPLACE | `const columns = useColumnDefs(entity)` where `entity = getViewEntry(viewKey).entity`. `useColumnDefs` reads from `entity-schemas.ts`, merges operator column prefs via existing `mergeColumnDefsWithPrefs`. `columnsByView` map is **deleted** after all 12 entries migrate (Phase 1–3D). |
| `actions` callback | `(rows, runCommand) => ReactNode` rendered as top-of-grid chrome | DROP | Top-of-grid chrome is owned by `<FilterToolbar>` (filter presets via `StatusFilterPill`, advanced filter button) per Manifesto §2.1. Views that pass real actions today (PaymentsView's `FilterPresetStrip` + `UnappliedCountBadge`, InventoryView's `FilterPresetStrip`) migrate their content to `FilterToolbar` configuration. |
| `prelude` callback | `(runCommand) => ReactNode` rendered above the grid as a workspace context band | NARROW TO `headerSlot` | `headerSlot?: ReactNode` is a single, named extension slot. PaymentsView's `QuickLedgerGrid` + selection-bound allocation panel, VendorPayablesView's vendor money-out + bill tools, and ConnectorsView's notes/route band qualify as primary-task header context and migrate to `headerSlot`. InventoryView's `PhotographyQueuePanel` does **not** qualify (it is supporting info per UX-3) and folds into a `SlideOver` tab on the lot entity. |
| `onCellCommit` callback | `(event, runCommand) => void` consumed by `OperatorGrid.onCellCommit` | DROP | Per ARCH-12 cell editors commit through `useCommandRunner` via `cellRendererParams` declared in `entity-schemas.ts`. The per-view `if (event.colDef.field === 'unitPrice')` switch is the anti-pattern this replaces. InventoryView's 5-field switch becomes 5 schema entries declaring `editor: { type: 'numeric', commitCommand: 'setBatchPrice', payloadShape: ... }` etc. |
| `expansionConfig` (AG Grid master-detail) | `{ enabled, actionsRenderer, historyRenderer, childrenRenderer, isRowMaster }` | REMOVE | `PrimaryGridView` is for list-style views. Master-detail patterns (PurchaseOrdersView lines, IntakeView batches) move to the separate `MasterDetailView` template per Manifesto §2.1. PrimaryGridView callers needing master-detail are misclassified and should be reviewed against §2.3. |
| `selectionActions` callback | `(rows, runCommand, setNextSuccessActions) => ReactNode` returning `<StatusActionBar>` (or similar) | DROP | `<BulkActionBar>` is auto-mounted by the template when `selectedRows[viewKey].length > 0`. Its contents come from the intersection of `getAllowedActions(entity, row.status, role)` across all selected rows. Per-view `StatusActionTable` constructions are deleted; state-machine variants gated on row-derived predicates handle the cases that look view-specific (allocate-remaining vs auto-apply-oldest, payBill two-step, route requires destination). See decisions-log entry "Action system replacement" section. |
| `inspectorTabs` callback | `(row: GridRow) => InspectorTab[]` consumed by `OperatorGrid.inspectorTabs` → `RowInspector` bottom-anchored tabs | DROP | Folds into right-side `<SlideOver>` tabs via `tabs/registry.ts` per P0-3 ContextDrawer→SlideOver decision. PaymentsView's `receipt` + `linked-orders` tabs register as `payment` entity tabs; OrdersView's `invoice` tab registers as an `order` entity tab. The `OperatorGrid.inspectorTabs` prop and underlying `RowInspector` component retire in Phase 2 cleanup. `templates/InspectorDrawer.tsx` is deleted in Phase 4. |
| `title`, `emptyTitle`, `emptyChildren` | Per-call props | MOVE TO REGISTRY | `title` from `getViewEntry(viewKey).title`; default `emptyTitle` / `emptyChildren` from the entity schema, overrideable via optional fields on the view registry entry. Removed from per-call props. |
| Outer wrapper `<div className="view-stack">` | Provides flex-column layout chrome | PRESERVE | Same class. `view-stack` is shared global layout chrome (CSS-defined). |
| `OperatorGrid` invocation | All props pass-through | PRESERVE | Same internal invocation. `PrimaryGridView` continues to be a thin orchestration layer over `OperatorGrid`. The change is what feeds the orchestration — config registries, not per-call callbacks. |

---

## 3. Public API after refactor

```ts
// src/client/templates/PrimaryGridView.tsx

import type { ReactNode } from 'react';
import type { ViewKey } from '../../shared/types';

export interface PrimaryGridViewProps {
  /**
   * View key. Drives query (`queries.grid({ view })`), store slice
   * (`selectedRows[view]`, `drawerByView[view]`), URL grammar
   * (`useViewUrlState(view)`), and registry lookup (`getViewEntry(view)`).
   * The view's entity, schema, state machine, available slide-overs, and
   * title all flow from here.
   */
  viewKey: ViewKey;

  /**
   * Optional bespoke header content rendered ABOVE FilterToolbar.
   *
   * Use cases (only ~3 of 11 views): PaymentsView's QuickLedgerGrid +
   * selection-bound allocation panel; VendorPayablesView's money-out
   * commit band + bill tools; ConnectorsView's notes/route band.
   *
   * RULE: headerSlot is for primary-task context that survives view load
   * (the operator is mid-task and the slot belongs to that task). It is
   * NOT a hiding place for buttons, status strips, KPIs, supporting info,
   * or "always visible" reference panels. Those belong in:
   *   - FilterToolbar (filter presets, status pills)
   *   - SummaryStrip (≤4 KPI cards)
   *   - SlideOver tab (entity-scoped supporting info)
   *   - ActionBar in SlideOver (entity actions)
   * Violations fail review under Manifesto §6.1.
   */
  headerSlot?: ReactNode;
}

export function PrimaryGridView(props: PrimaryGridViewProps): JSX.Element;

/**
 * @deprecated Use PrimaryGridView. GridJourney is re-exported here for one
 * release cycle to ease migration. The legacy props shape is supported via
 * a wrapper that logs a one-time console.warn per view. Both the alias and
 * the wrapper are deleted in Phase 4.
 */
export const GridJourney: typeof PrimaryGridView;
```

### What is removed from the public surface

- `GridJourney` (renamed; old name re-exported as `@deprecated` alias).
- Anonymous props shape `{view, title, actions, prelude, onCellCommit, expansionConfig, columns, selectionActions, inspectorTabs, emptyTitle, emptyChildren}` (no longer accepted on the new export).
- `columnsByView` map (deleted from `shared.tsx` after migration).

### What is added to the public surface

- `PrimaryGridView` component.
- `PrimaryGridViewProps` interface.
- (Via config files, not the component itself.) `entity-schemas.ts` field blocks per entity; `entity-actions.ts` state machines per entity; `view-registry.ts` entries per view; `tabs/registry.ts` registrations per entity.

---

## 4. Internal composition (what the template renders)

```
PrimaryGridView (viewKey)
├── viewEntry = getViewEntry(viewKey)
├── entity = viewEntry.entity
├── columns = useColumnDefs(entity)            // from entity-schemas.ts
├── { runCommand, setNextSuccessActions } = useCommandRunner()
├── selected = useUiStore(s => s.selectedRows[viewKey] ?? EMPTY_ROWS)
├── grid = trpc.queries.grid.useQuery({ view: viewKey })
├── activeEntity = useUiStore(s => s.activeDrawerEntityByView[viewKey])
│
├── <div className="view-stack">
│   ├── {headerSlot}                           // optional, view-supplied
│   ├── <FilterToolbar viewKey={viewKey} />    // Phase 0 component
│   ├── <SummaryStrip viewKey={viewKey} />     // Phase 0 component (optional per registry)
│   ├── <OperatorGrid
│   │     view={viewKey}
│   │     title={viewEntry.title}
│   │     rows={(grid.data ?? []) as GridRow[]}
│   │     columns={columns}
│   │     loading={grid.isLoading}
│   │     isError={grid.isError}
│   │     onRetry={() => grid.refetch()}
│   │     onSelectionChange={(rows) => setSelectedRows(viewKey, rows)}
│   │     emptyTitle={viewEntry.emptyTitle}
│   │     emptyChildren={viewEntry.emptyChildren}
│   │   />
│   ├── {selected.length > 0 && <BulkActionBar viewKey={viewKey} />}
│   └── {activeEntity && <SlideOver />}         // from P0-3 refactor; one instance
└── </div>
```

The template owns zero layout primitives beyond `view-stack`. No `grid-cols-*`, no inline styles, no `WorkspacePanel` chrome.

---

## 5. How entitySchema replaces inline columns

Today (anti-pattern, in `shared.tsx`):

```ts
// columnsByView.purchaseOrders — 22 inline ColDef entries
purchaseOrders: [
  { field: 'poNo', headerName: 'PO', pinned: 'left', width: 150 },
  { field: 'vendor', width: 190 },
  { field: 'status', width: 135 },
  { field: 'expectedDate', headerName: 'Expected', editable: true, width: 165 },
  // ... 18 more
],
```

After (each field becomes an `EntityFieldSchema.fields[]` entry in `entity-schemas.ts`):

```ts
// purchaseOrderSchema (already scaffolded for 8 of 22 fields)
{
  field: 'poNo',
  type: 'text',
  headerName: 'PO #',
  width: 140,
  pinned: 'left',
  attentionTier: 0,
  attentionRationale: 'Primary identifier — operators search, sort, and reference by PO number relentlessly.',
  // ...
},
{
  field: 'expectedDate',
  type: 'date',
  headerName: 'Expected',
  editable: true,
  width: 130,
  attentionTier: 1,
  attentionRationale: 'Operators filter by expected arrival constantly — but it is not identity.',
  // editor config for inline edits → useCommandRunner commit:
  editor: {
    type: 'date',
    commitCommand: 'updatePurchaseOrder',
    payloadShape: { id: 'id', expectedDate: 'value' },
  },
},
```

A `useColumnDefs(entity)` hook (Phase 0 work, P0-3 sibling task) reads the schema, builds an AG Grid `ColDef[]`, merges operator column prefs via the existing `mergeColumnDefsWithPrefs`, and returns the array. Cell editors derive `cellRendererParams` from `field.editor`, which `OperatorGrid` already supports. Custom cell renderers (the inline `cellRenderer` blocks in today's `columnsByView.clients`, `columnsByView.inventory`, etc.) become stable component exports under `src/client/components/cellRenderers/` and are referenced from the schema by name (`cellRenderer: 'CustomerNameCell'`). Per Manifesto §6.1, no inline `useMemo` closures over view state.

---

## 6. How entityActions replaces inline actions

Today (anti-pattern in 11 views):

```tsx
// PaymentsView.tsx — selectionActions callback returns inline StatusActionBar
selectionActions={(rows, runCommand, setNextSuccessActions) => {
  const allocate = (label) => ({
    key: 'allocate', label, icon: <Check />,
    run: (r) => { setNextSuccessActions?.([{...}]); return runCommand('allocatePayment', {...}, '...'); },
  });
  const paymentsTable: StatusActionTable = {
    rules: [
      { when: (row) => unappliedOf(row) > 0 && unappliedOf(row) >= amountOf(row), primary: allocate('Auto-apply oldest'), tray: [] },
      { when: (row) => unappliedOf(row) > 0, primary: allocate('Allocate remaining'), tray: [] },
      // ...
    ],
  };
  return <StatusActionBar rows={rows} table={paymentsTable} />;
}}
```

After (in `entity-actions.ts`):

```ts
// paymentActions.states['posted'] with row-predicate variants
posted: [
  {
    id: 'allocatePayment',
    label: 'Auto-apply oldest',
    icon: 'Check',
    commandRoute: 'commands.run',
    when: (row) => Number(row.unappliedAmount) > 0 && Number(row.unappliedAmount) >= Math.abs(Number(row.amount)),
    successAction: (row) => ({ label: 'View payment', deepLink: `/payments?id=${row.id}` }),
  },
  {
    id: 'allocatePayment',
    label: 'Allocate remaining',
    icon: 'Check',
    commandRoute: 'commands.run',
    when: (row) => Number(row.unappliedAmount) > 0 && Number(row.unappliedAmount) < Math.abs(Number(row.amount)),
  },
],
```

The `EntityAction.when?: (row) => boolean` predicate is the only additive change to the type (today's `EntityAction` has `confirmationRequired`, `slidesOver`, `minRole`; this adds `when` and `successAction`). `BulkActionBar` and `SlideOver`'s ActionBar both consume `getAllowedActions(entity, status, role)`, applying the `when` predicate against the relevant row (the single selected row for `SlideOver`, the intersection across selected rows for `BulkActionBar`).

**There is no per-view override.** If a view feels like it needs one, the correct response is a state-machine bug in `entity-actions.ts`, not a callback prop on the template.

---

## 7. View migration table

The 11 views that today render a primary grid. Each migrates to `<PrimaryGridView viewKey="..." />` (with optional `headerSlot` for the 3 noted). Each migration is one PR per view, in dependency order.

| Current view file | View key | Entity (registry) | Today's caller shape | New props shape | Migration phase |
|---|---|---|---|---|---|
| `PurchaseOrdersView.tsx` | `purchaseOrders` | `purchaseOrder` | Direct `<OperatorGrid columns={columnsByView.purchaseOrders} ... />` (3 separate grids today; main + 2 sub-grids — keep main only on `PrimaryGridView`, move sub-grids to `MasterDetailView` or `SlideOver` tabs) | `<PrimaryGridView viewKey="purchaseOrders" />` (no `headerSlot`) | **Phase 1 pilot** |
| `CloseoutView.tsx` | `closeout` | `closeoutPeriod` | `<GridJourney view="closeout" title="Archive Runs" emptyTitle="..." emptyChildren="..." />` (the simplest caller; almost no custom props) | `<PrimaryGridView viewKey="closeout" />` (no `headerSlot`; the period-status section above the grid migrates to `headerSlot` only if it qualifies as primary-task header — likely it migrates to `SlideOver` tab on the period entity) | Phase 2 (first; trivial) |
| `ConnectorsView.tsx` | `connectors` | `connectorRequest` | `<GridJourney prelude={...notes/route band...} selectionActions={routeTable} />` | `<PrimaryGridView viewKey="connectors" headerSlot={<ConnectorRouteBand />} />` (the route-to input is primary-task header context for the connector operator; safety banner moves into `FilterToolbar` as a contextual strip) | Phase 2 |
| `PurchaseReceiptsView.tsx` | `purchaseReceipts` | `purchaseReceipt` | Direct `<OperatorGrid columns={columnsByView.purchaseReceipts} ... />` (multi-grid view; lines grid stays as `MasterDetailView` or `SlideOver` tab) | `<PrimaryGridView viewKey="purchaseReceipts" />` | Phase 2 |
| `RecoveryView.tsx` | `recovery` | `commandJournalEntry` | Direct `<OperatorGrid columns={columnsByView.recovery} ... />` (recovery shows failed commands; `entity` is the journal entry) | `<PrimaryGridView viewKey="recovery" />` | Phase 2 |
| `PaymentsView.tsx` | `payments` | `payment` | `<GridJourney prelude={QuickLedger + allocation panel} inspectorTabs={(row) => [receipt, linked-orders]} actions={FilterPresetStrip + UnappliedCountBadge} selectionActions={paymentsTable} />` | `<PrimaryGridView viewKey="payments" headerSlot={<><QuickLedgerGrid /><PaymentAllocationPanel /></>} />`. The `inspectorTabs` `receipt` + `linked-orders` register as `payment` entity tabs. The `actions` FilterPresetStrip + UnappliedCountBadge migrate to `FilterToolbar` configuration. The `selectionActions` decision table migrates to `entity-actions.ts` with `when` predicates. | Phase 2 |
| `FulfillmentView.tsx` | `fulfillment` | `pick` | Direct `<OperatorGrid columns={fulfillmentPickColumns} ... />` (derives columns from `columnsByView.fulfillment` plus tweaks) | `<PrimaryGridView viewKey="fulfillment" />` (column tweaks merge into `pickSchema` field defaults) | Phase 2 |
| `OrdersView.tsx` | `orders` | `sale` (entity differs from view key by design) | Direct `<OperatorGrid columns={columnsByView.orders} inspectorTabs={(row) => [invoice]} selectionActions={ordersTable} ... />` | `<PrimaryGridView viewKey="orders" />`. `OrderInvoiceTab` moves to `src/client/components/tabs/OrderInvoiceTab.tsx` and registers as a `sale` entity tab. `selectionActions` `ordersTable` migrates to `entity-actions.ts` `saleActions`. | Phase 2 |
| `VendorPayablesView.tsx` | `vendors` | `vendorBill` (entity differs from view key) | `<GridJourney columns={vendorMatchColumns} prelude={money-out + bill tools} selectionActions={vendorBillTable} />` | `<PrimaryGridView viewKey="vendors" headerSlot={<VendorMoneyOutBand />} />`. The two `<WorkspacePanel>` wrappers in the current `prelude` are deleted (UX-3 violation): `VendorBillTools` becomes a popover triggered from `FilterToolbar`'s "+ Create bill" action; `VendorMoneyOutStrip` stays as the headerSlot when a bill is selected. `vendorBillTable` migrates to `entity-actions.ts` `vendorBillActions`. | Phase 2 |
| `ClientLedgerView.tsx` | `clients` | `customer` | `<GridJourney view="clients" title="Client Balances" columns={clientColumns} />` (heavy custom `cellRenderer` blocks for name link + balance link + matchmaking column) | `<PrimaryGridView viewKey="clients" />`. Custom cell renderers extract to `CustomerNameCell`, `CustomerBalanceCell`, `CustomerMatchmakingCell` stable components and register by name in `customerSchema`. | Phase 2 |
| `InventoryView.tsx` | `inventory` | `inventoryBatch` | `<GridJourney columns={inventoryColumns} prelude={<PhotographyQueuePanel />} actions={<FilterPresetStrip />} selectionActions={<InventoryRowActions />} onCellCommit={5-field switch} />` | `<PrimaryGridView viewKey="inventory" />`. `PhotographyQueuePanel` is **not** primary-task header context (UX-3 says supporting info goes 1 click away) — it folds into a `SlideOver` tab on the lot entity (`media-queue`) and into a `CountPill` in the `FilterToolbar`. `FilterPresetStrip` migrates to `FilterToolbar` configuration. The 5-field `onCellCommit` switch becomes 5 schema entries with `editor.commitCommand` declarations. `InventoryRowActions` migrates to `entity-actions.ts` `inventoryBatchActions` plus a `SlideOver` tab for the heavy adjust-qty form. | Phase 2 |

**SalesView and IntakeView are not in this table** — they use `MasterDetailView` and `WizardView` templates respectively, and migrate per their own phase entries (Phase 3A/3B for SalesView; Phase 3C for IntakeView).

---

## 8. Acceptance criteria for the Phase 0 refactor (no view changes)

The Phase 0b refactor lands when:

- [ ] `PrimaryGridView` exported from `src/client/templates/PrimaryGridView.tsx`.
- [ ] `GridJourney` re-exported from the same module as `@deprecated` alias.
- [ ] `PrimaryGridViewProps` exported. New signature accepts only `viewKey` and `headerSlot?`.
- [ ] Legacy-prop wrapper (transition shim) accepts the old `{view, title, actions, prelude, columns, selectionActions, inspectorTabs, onCellCommit, expansionConfig, emptyTitle, emptyChildren}` shape and maps to the new internals; logs one `console.warn` per view per session in dev.
- [ ] `useColumnDefs(entity)` hook exists and reads from `entity-schemas.ts` with `mergeColumnDefsWithPrefs` integration.
- [ ] All 6 today's `GridJourney` callers and 5 today's direct-OperatorGrid callers continue to render and pass tests unchanged. No view file is modified in Phase 0b.
- [ ] No view changes its behavior on operator screens.
- [ ] Typecheck clean. All 1608 vitest cases green. Build artifact unchanged in size by more than 2KB.
- [ ] Decisions-log entry exists and is linked from the Mercury authority chain.
- [ ] `docs/engineering-plans/specifications/templates/grid-view.md` updated to a redirect at this spec.

---

## 9. Acceptance criteria for each per-view migration PR (Phase 1, Phase 2, Phase 3A/B)

For every view that migrates to `<PrimaryGridView viewKey="X" />`, the PR includes:

- [ ] `view-registry.ts` entry for view key `X` populated (entity, template type `primaryGrid`, primaryProcedure, urlPath, title, allowedSlideOvers).
- [ ] `entity-schemas.ts` `XSchema` populated covering every field that today's `columnsByView[X]` defines (plus any per-view custom columns from the view file).
- [ ] `entity-actions.ts` `XActions` state machine populated covering every selection action today's `selectionActions` callback returns. Row-derived predicates use `when?: (row) => boolean`.
- [ ] Custom `cellRenderer` closures in today's view migrate to stable component exports under `src/client/components/cellRenderers/`. Schema references them by name. No new `useMemo` closures over view state.
- [ ] Today's `inspectorTabs` calls (PaymentsView, OrdersView) register the same tabs as `SlideOver` tabs in `tabs/registry.ts` for the corresponding entity type. Tab components move to `src/client/components/tabs/` (rename from `drawerTabs/` if needed).
- [ ] View file shrinks to ≤200 lines (Manifesto §6.1 compliance check). VendorPayablesView and InventoryView may exceed temporarily during migration with explicit acknowledgment in the PR description.
- [ ] No `<GridJourney` or legacy-prop usage remains in the view file.
- [ ] All view-level tests pass. AQA-style click-around verifies operator cannot tell anything changed.
- [ ] Persona QA run includes this view.

---

## 10. Transition behavior (Phase 0b → end of Phase 2)

The legacy-prop wrapper exists for one purpose: keep typecheck green and operator behavior unchanged while views migrate one at a time. Concretely:

```ts
// Inside src/client/templates/PrimaryGridView.tsx — the @deprecated wrapper

interface LegacyGridJourneyProps {
  view: ViewKey;
  title: string;
  actions?: (...) => ReactNode;
  prelude?: (...) => ReactNode;
  onCellCommit?: (...) => void;
  expansionConfig?: { ... };
  columns?: ColDef<GridRow>[];
  selectionActions?: (...) => ReactNode;
  inspectorTabs?: (row: GridRow) => InspectorTab[];
  emptyTitle?: string;
  emptyChildren?: ReactNode;
}

/** @deprecated Use PrimaryGridView. Removed in Phase 4. */
function GridJourneyLegacy(props: LegacyGridJourneyProps): JSX.Element {
  // Log one warning per (viewKey, propsShape) per session, in dev only:
  warnOnceDev(props.view, props);
  // Render the original GridJourney body verbatim, sourcing columns from
  // props.columns ?? columnsByView[view] ?? [].
  // No registry lookups; no state-machine integration. Pure compatibility.
  return /* … original GridJourney body … */;
}
```

The new `PrimaryGridView` function checks at call time whether legacy props are present; if so, dispatches into `GridJourneyLegacy`. If only `viewKey` (+ optional `headerSlot`) is present, dispatches into the new path that reads from registries. Both paths share the underlying `OperatorGrid` invocation; only the column/action/tab sourcing differs.

This means at any point during Phase 1 and Phase 2:

- Migrated views (`PurchaseOrdersView` from Phase 1; `CloseoutView`, `ConnectorsView`, etc. as Phase 2 progresses) render the new path. Columns come from `entity-schemas.ts`. Actions come from `entity-actions.ts`. Tabs come from `tabs/registry.ts`. `SlideOver` is the only supplementary surface.
- Unmigrated views render the legacy path. Columns come from `columnsByView` or inline. `StatusActionBar` is the selection bar. `RowInspector` is still bottom-anchored for PaymentsView and OrdersView.
- Both paths coexist within the same component file. No double-mount; no parallel templates. Operators see consistent behavior on each view (the view's own state determines which path runs).
- At the end of Phase 2, every view passes only `viewKey` (+ optional `headerSlot`). The legacy path is dead code. Phase 4 deletes it.

---

## 11. What this spec is NOT

- Not a build-from-scratch component spec. The substrate exists. Anyone treating this as a greenfield task should stop and re-read the 2026-06-16 entry in `docs/design-system/decisions-log.md`.
- Not a place to invent new view-state callbacks. `headerSlot` is the only extension surface and it is constrained to primary-task header context. If you find yourself wanting `actions` or `selectionActions` back, the right fix is in `entity-actions.ts`.
- Not a parent of master-detail views. `MasterDetailView` (Manifesto §2.1) is the template for PurchaseOrdersView lines, IntakeView batches, and similar. `PrimaryGridView` is list-style only.
- Not a parent of dashboards. `DashboardView` (Manifesto §2.1) is the template for the dashboard widget composition.
- Not a parent of wizards. `WizardView` is the template for PickView's step-by-step flow.
- Not a place for `WorkspacePanel` chrome. The 4 `<WorkspacePanel>` mounts that today live inside `GridJourney.prelude` callbacks (PaymentsView's allocations panel, VendorPayablesView's money-out + bill tools panels) **must** unwrap before migrating to `headerSlot`. Per Manifesto §6.1 anti-patterns, `<WorkspacePanel>` is a UX-3 design bug except for the dashboard widgets being migrated separately.

---

## 12. Reference reads

- `docs/design-system/decisions-log.md` — 2026-06-16 entry "GridJourney → PrimaryGridView Refactor Decision" (binding rationale).
- `docs/design-system/decisions-log.md` — 2026-06-16 entry "ContextDrawer → SlideOver Refactor Decision" (sibling P0 decision; binding for `inspectorTabs` fold-into-tabs and tab registry).
- `docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md` §2.1 (canonical shape), §4 migration map row "GridJourney", §5.2 (extension over replacement), §6.1 anti-patterns.
- `docs/engineering-plans/CPO-AUDIT-REPORT.md` F2 (the finding this spec resolves) and the "Decide GridJourney ↔ GridView template strategy" follow-up.
- `docs/engineering-plans/specifications/components/detail-slideover.md` — SlideOver refactor target spec (sibling).
- `src/client/views/operations/shared.tsx` — the substrate; the `GridJourney` body at line 247 is the starting point for the refactor; the `columnsByView` map at line 24 is the deletion target.
- `src/client/components/OperatorGrid.tsx` — the underlying AG Grid wrapper (preserved exactly; only the `inspectorTabs` prop retires in Phase 2).
- `src/client/config/entity-schemas.ts`, `src/client/config/entity-actions.ts`, `src/client/config/view-registry.ts`, `src/client/config/entity-column-map.ts` — Phase 0 scaffolds this spec consumes.
