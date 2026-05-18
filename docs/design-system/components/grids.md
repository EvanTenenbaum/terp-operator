# AG Grid Patterns

> **Always use `OperatorGrid` as the wrapper for top-level operator screens.** It handles theme, selection, undo/redo, search input, CSV export, side bar, expansion, and integrates with `useUiStore.gridFilters`. Reach for raw `AgGridReact` only for embedded grids (e.g., `QuickLedgerGrid`) where the wrapper's chrome is wrong.

## `OperatorGrid` — the standard wrapper

Defined in `src/client/components/OperatorGrid.tsx`. Public surface:

```tsx
interface OperatorGridProps {
  view: ViewKey;                                    // routes filter state via useUiStore
  title: string;                                    // panel title
  subtitle?: string;                                // defaults to row count
  rows: GridRow[];                                  // your data
  columns: ColDef<GridRow>[];                       // your columns (≤8, see audit)
  loading?: boolean;
  actions?: ReactNode;                              // toolbar actions (rendered when canWrite)
  selectionActions?: (rows: GridRow[]) => ReactNode;// shown in SelectionSummary
  onSelectionChange?: (rows: GridRow[]) => void;
  onCellCommit?: (event: CellValueChangedEvent<GridRow>) => void;
  emptyTitle?: string;
  emptyChildren?: ReactNode;
  expansionConfig?: {
    enabled: boolean;
    actionsRenderer?: (row: GridRow) => ReactNode;
    historyRenderer?: (row: GridRow) => ReactNode;
    childrenRenderer?: (row: GridRow) => ReactNode;
    isRowMaster?: (row: GridRow) => boolean;
  };
}
```

What it gives you for free:
- `ag-theme-quartz` shell + `grid-shell` container class
- Row-number column auto-injected (`withRowNumbers`)
- Status column → `StatusPill` cell renderer auto-applied (`withStatusRenderer`)
- Quick-filter search bar wired to `useUiStore.gridFilters[view]` (parses `field:value` syntax)
- CSV export via the AG Grid API, file named `terp-agro-<view>.csv`
- Selection (multiRow + range cell selection), undo/redo cell editing
- Side bar (columns + filters, hidden by default)
- Empty state via `EmptyState` component
- `SelectionSummary` bar when rows selected, with hooks for opening history / relationship / issue drawers
- Master-detail expansion when `expansionConfig.enabled`

## Standard column definition

```ts
const columnDefs = useMemo<ColDef<GridRow>[]>(() => [
  { field: 'poNo', headerName: 'PO', pinned: 'left', minWidth: 180 },
  { field: 'vendor', headerName: 'Vendor', minWidth: 160 },
  { field: 'status', minWidth: 140 },                                       // becomes StatusPill automatically
  { field: 'createdAt', width: 180 },
  // ≤ 8 total visible columns (excluding the auto-injected row-number column)
], []);
```

Build the array with `useMemo` and the right dependency list. AG Grid will rebind columns on every reference change.

### Audit constraint: ≤8 visible columns

Issue #31 enforces this. The audit treats row numbers, status pills, and expansion chevrons as exempt — the count is **your** data columns. See `docs/GRID_COLUMN_AUDIT.md` for the per-grid breakdown of which are compliant and which were fixed in commit `f5c33d8`.

If your grid genuinely needs more, prefer:
1. Master-detail expansion (`expansionConfig.enabled = true` + a `childrenRenderer`)
2. Drawer-based detail view (`useUiStore.toggleDrawer(view)`)
3. A "wide" view variant gated by a UI toggle

## Cell renderers

Two styles in the codebase:

### Inline arrow function (the common case)
```ts
{
  field: 'product',
  cellRenderer: (params: { value: unknown; data: GridRow }) => {
    const fallback = params.value ?? params.data?.itemName ?? '';
    return (
      <span>
        {params.data?.itemAlias ? (
          <span title="Customer-facing alias" style={{ color: '#eab308', marginRight: 4 }}>●</span>
        ) : null}
        {String(fallback)}
      </span>
    );
  }
}
```

Used heavily in `SalesView.tsx`, `OperationsViews.tsx`, `IntakeView.tsx`. Type the params explicitly — `ICellRendererParams<GridRow>` is the typed alternative when you need full AG Grid params.

### Component-wrapped renderer
```ts
{ field: 'status', cellRenderer: (params: { value?: string }) => <StatusPill status={params.value} /> }
```

`OperatorGrid.withStatusRenderer` auto-applies this for any column with `field: 'status'` — you usually don't need to write it.

### Named built-in renderer
```ts
{ field: 'poNo', cellRenderer: 'agGroupCellRenderer', pinned: 'left', minWidth: 180 }
```

For master-detail expansion, AG Grid's `agGroupCellRenderer` is what you want on the master column.

### Action-button renderer (for per-row actions)
```ts
{
  headerName: 'Actions',
  width: 100,
  cellRenderer: (params: ICellRendererParams<IntakeBatchRow>) => {
    const row = params.data;
    if (!row || !canWrite) return null;
    return <BatchRowActions row={row} onFlag={onFlag} onReject={onReject} onDeleteDraft={onDeleteDraft} />;
  }
}
```

Pattern: gate by `canWrite`, extract the action UI to a separate component (`BatchRowActions`), pass handlers via grid-level closures.

## Value formatters

For display-only transformations (no React):

```ts
// Currency
{ field: 'price', valueFormatter: (params) => `$${Number(params.value ?? 0).toFixed(2)}`, minWidth: 110 }

// Enum label lookup
{ field: 'source', headerName: 'From', valueFormatter: (params) => formatRequestSource(params.value) }
{ field: 'requestType', valueFormatter: (params) => formatRequestType(params.value) }
{ field: 'commandName', valueFormatter: (params) => commandLabelFor(params.value) }
```

These helpers (`formatRequestSource`, `commandLabelFor`, `formatGridValue`) live near the view that uses them or in `src/shared/`. Search before reinventing.

`OperatorGrid`'s `defaultColDef` already sets `valueFormatter: formatGridValue` — a generic fallback that handles dates, arrays, objects. Your column-level `valueFormatter` overrides it.

## Editable cells

```ts
{ field: 'quantity', editable: true, type: 'numericColumn', minWidth: 110 }
```

`OperatorGrid.withStatusRenderer` adds `cellClass: 'editable-cell'` to editable columns when `canWrite` is true (so the operator sees a visual cue). For viewer role, `editable: true` is overridden to `false`.

Hook into commits via `onCellCommit`:

```tsx
<OperatorGrid
  ...
  onCellCommit={(event) => {
    runCommand('updateBatch', {
      batchId: event.data.id,
      [event.colDef.field!]: event.newValue
    }, 'Inline batch edit from grid');
  }}
/>
```

## Expansion / master-detail

```tsx
<OperatorGrid
  view="intake"
  ...
  expansionConfig={{
    enabled: true,
    childrenRenderer: (row) => <BatchDetail batch={row} />,
    historyRenderer: (row) => <CommandHistoryList entityId={row.id} />,
    actionsRenderer: (row) => <BatchExpandedActions row={row} />,
  }}
/>
```

`OperatorGrid` injects an expansion chevron column at index 1 (after row numbers) and renders `ExpansionPanel` with the row's slot content. Set `isRowMaster` if not every row should be expandable.

## Keyboard

AG Grid's defaults are on (Tab, Enter, Esc, arrows, Cmd+C/V, Cmd+Z/Shift+Z for undo/redo cell editing). `OperatorGrid` enables `undoRedoCellEditing`. Don't disable these — operators rely on them.

App-level shortcuts (Cmd+K palette, Cmd+1..N view switching) are in `Hotkeys.tsx`.

## Real reference

- **Composed top-level grid:** `IntakeView.tsx` (uses `OperatorGrid`, expansion, action renderer, currency formatter).
- **Wrapper internals:** `OperatorGrid.tsx`.
- **Status renderer:** `StatusPill.tsx` (lookup table for known statuses → Tailwind classes).
- **Embedded grid (raw `AgGridReact`):** `QuickLedgerGrid.tsx` — uses `AgGridReact` directly because it lives inside another panel and needs custom chrome.
- **Audit:** `docs/GRID_COLUMN_AUDIT.md` for column-count compliance.

## Don'ts

❌ **Don't use `<table>`/`<thead>` etc. for tabular operator data.** Use `OperatorGrid`. The exception is `finder-table` (small lookup tables inside drawers and dialogs — that uses native `<table>` with `.finder-table` styling).

❌ **Don't exceed 8 visible columns** without a documented exception. If you must, open an issue against `docs/GRID_COLUMN_AUDIT.md`.

❌ **Don't write a custom theme.** `ag-theme-quartz` is the chosen theme. Customization happens via Tailwind on the wrapper, not via AG Grid theme overrides.

❌ **Don't disable `undoRedoCellEditing` or `cellSelection`.** Range copy + undo are operator-critical.

❌ **Don't compute columns inline in JSX.** Use `useMemo<ColDef<Row>[]>`. AG Grid will tear down state on reference changes.

✅ **Do gate write actions by `canWrite`** — `OperatorGrid` passes the user's role through and the `actions` prop only renders when `canWrite`.

✅ **Do extract complex cell renderers into named components** instead of inline arrow functions, when the renderer is non-trivial.
