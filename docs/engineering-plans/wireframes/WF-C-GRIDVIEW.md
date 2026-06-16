## Wireframe: WF-C-GRIDVIEW — GridView Template

The primary view template for all list-type entity views (Sales Orders, Purchase Orders, Inventory, etc.).
Composes: Header, FilterToolbar, GridSummaryStrip, ViewTabBar, OperatorGrid, BulkActionBar, DetailSlideover.

---

### Full Page Layout

```
┌─ View Header ────────────────────────────────────────────────────────────────────┐
│  "Sales Orders"                                     [+ New Order ▾] [⚙ Settings] │
│  Inter 20px semibold                                right-aligned actions        │
├─ FilterToolbar ──────────────────────────────────────────────────────────────────┤
│  [▾ Data views] │ [▾ Date ▾] [▾ Keyword ▾] [▾ Amount ▾] [▾ Group ▾]              │
│                 │ [▾ Sort ▾] [⬇ Export]                                         │
│  [✕ status:confirmed] [✕ date:last-30-days]                                      │
├─ GridSummaryStrip ───────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Total Orders│  │ Total Value │  │  Pending    │  │  Shipped    │              │
│  │      42     │  │  $128,400   │  │  5  ▲12%   │  │  3  ▼4%    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘              │
├─ ViewTabBar ─────────────────────────────────────────────────────────────────────┤
│  [All (42)]  [Draft (5)]  ┌──────────────────┐  [Posted (18)]  [Fulfilled (7)]    │
│                            │ Confirmed (12)   │                                    │
│                            └──────────────────┘  ← active tab                      │
│                              ████████████████                                     │
├─ OperatorGrid (AG Grid) ──────────────────────────────────────────────────────────┤
│  ┌──────┬────────────────┬────────────┬───────────┬──────────┬─────────┐          │
│  │  ☐   │  ID            │ Customer   │ Status    │ Date     │ Amount  │ •••      │
│  ├──────┼────────────────┼────────────┼───────────┼──────────┼─────────┤          │
│  │  ☐   │ SO-1042        │ Acme Co    │ Confirmed▾│ 6/15/26  │ $12,400 │  ⋮       │
│  │  ☑   │ SO-1041        │ Beta Inc   │ Posted  ▾ │ 6/14/26  │ $8,200  │  ⋮       │
│  │  ☐   │ SO-1040        │ Gamma LLC  │ Draft   ▾ │ 6/13/26  │ $3,150  │  ⋮       │
│  │  ☐   │ SO-1039        │ Delta Corp │ Posted  ▾ │ 6/12/26  │ $22,800 │  ⋮       │
│  │  ☐   │ SO-1038        │ Epsilon In │ Confirmed▾│ 6/11/26  │ $6,900  │  ⋮       │
│  │  ☑   │ SO-1037        │ Zeta LLC   │ Shipped ▾ │ 6/10/26  │ $15,300 │  ⋮       │
│  │  ☐   │ SO-1036        │ Eta Corp   │ Draft   ▾ │ 6/09/26  │ $4,500  │  ⋮       │
│  │  ☐   │ SO-1035        │ Theta Inc  │ Posted  ▾ │ 6/08/26  │ $11,200 │  ⋮       │
│  │  ☐   │ SO-1034        │ Iota LLC   │ Confirmed▾│ 6/07/26  │ $9,800  │  ⋮       │
│  │  ☐   │ SO-1033        │ Kappa Co   │ Draft   ▾ │ 6/06/26  │ $3,600  │  ⋮       │
│  └──────┴────────────────┴────────────┴───────────┴──────────┴─────────┘          │
│                                                                                    │
├─ BulkActionBar (hidden until >0 selected) ─────────────────────────────────────────┤
├─ DetailSlideover (hidden until row click) ─────────────────────────────────────────┤
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Section Details

#### 1. View Header
- **Height:** 52px. `bg-white`, `border-bottom: 1px solid border-zinc-200`
- **Title:** Inter 20px, `font-weight: 600` (semibold), `text-zinc-900`. Left-aligned, 16px left padding
- **Actions:** Right-aligned. Primary action button (e.g., "+ New Order") with dropdown for variants. Secondary: Settings gear icon. Inter 13px medium, padding: 6px 12px, border-radius: 6px
- **ARIA:** `role="banner"` (view-level, not page-level). Title: `aria-level="1"`

#### 2. FilterToolbar
- **Component:** `FilterToolbar` with entity-specific filter config. See `WF-C-FILTER.md`
- **Height:** 44px (default) to 84px (with pill row). `bg-white`, `border-bottom: 1px solid border-zinc-200`

#### 3. GridSummaryStrip
- **Component:** `GridSummaryStrip` with entity-specific metrics. See `WF-C-SUMMARY.md`
- **Height:** 80px (64px cards + 8px padding top/bottom). `bg-zinc-50`

#### 4. ViewTabBar
- **Component:** `ViewTabBar` with entity state machine tabs. See `WF-C-TABBAR.md`
- **Height:** 40px. `bg-white`, `border-bottom: 1px solid border-zinc-200`

#### 5. OperatorGrid (AG Grid)
- **Component:** AG Grid Community Edition with entity column definitions
- **Height:** Fills remaining viewport space (`flex-grow: 1`, `height: calc(100vh - [header - toolbar - summary - tabbar - bulkbar])`)
- **Columns:** Generated from entity schema (`entity-schemas.ts`), not per-view ColDef arrays
- **Cell editors:** ComboboxCellEditor for status/dropdown columns. Inline text editors for text/number columns
- **Selection:** Checkbox column (leftmost, 40px). Multi-select: Ctrl+Click, Shift+Click for range
- **Row menu:** "⋮" kebab menu (rightmost column, 32px). Actions: Edit, Duplicate, Delete, Open in full view
- **Status cells:** ComboboxCellEditor with dropdown. Color-coded status badges (not raw text)
- **Sorting:** Column header click to sort. Multi-sort via Shift+Click on additional columns
- **ARIA:** AG Grid's built-in `role="grid"`, `role="row"`, `role="gridcell"`. Keyboard navigation: Tab, Arrow keys, Enter to edit

#### 6. BulkActionBar
- **Component:** `BulkActionBar`. See `WF-C-BULK.md`
- **Position:** Fixed bottom, 56px. Appears when selection > 0. Z-index: 40

#### 7. DetailSlideover
- **Component:** `DetailSlideover`. See `WF-C-SLIDEOVER.md`
- **Position:** Fixed right, 0px to 60vw. Appears on row click. Z-index: 30

---

### View Composition Rules

```
GridView = (
  <div className="flex flex-col h-screen">
    <ViewHeader        entity={entity} config={viewConfig.header} />
    <FilterToolbar     entity={entity} config={viewConfig.filters} />
    <GridSummaryStrip  entity={entity} metrics={viewConfig.metrics} />
    <ViewTabBar        entity={entity} tabs={entityStateMachine.tabs} />
    <OperatorGrid      entity={entity} columns={entitySchema.columns}
                       rowData={data} onRowClick={openSlideover} />
    {selectedCount > 0 && <BulkActionBar entity={entity} />}
    {selectedRow && <DetailSlideover entity={entity} row={selectedRow} />}
  </div>
)
```

### Data Flow

```
View Config (view-registry.ts)
    │
    ├──▶ FilterToolbar      ← useViewData (tRPC useQuery)
    ├──▶ GridSummaryStrip   ← tRPC gridSummary query
    ├──▶ ViewTabBar         ← entity state machine
    └──▶ OperatorGrid       ← tRPC grid query (paginated, filtered)
         │
         ├──▶ BulkActionBar ← useCommandRunner (runBulk)
         └──▶ DetailSlideover ← useCommandRunner (per-entity commands)
```

### Keyboard Shortcuts (Global)

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Focus filter toolbar keyword input |
| `Ctrl+A` | Select all rows |
| `Escape` | Close slideover / clear selection / close popover |
| `Enter` | Open selected row in slideover (single selection) |
| `Ctrl+Enter` | Open in full view |
| `Ctrl+Shift+F` | Clear all filters |

### Responsive Notes

- Below 1024px: FilterToolbar chips wrap to 2 rows, Export moves to "More" dropdown
- Below 768px: SummaryStrip wraps to 2 columns. Grid columns auto-hide low-priority columns (configurable per entity schema `mobilePriority` field)
- Below 480px: Slideover takes full width (100vw). BulkActionBar actions collapse to "More" menu

---
*Font: Inter 20px headers, Inter 13px body. Colors: semantic classes only. All sections: border-bottom separation.*
