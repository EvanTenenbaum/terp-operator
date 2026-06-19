## Wireframe: WF-C-GRIDVIEW — GridView Template

The primary view template for all list-type entity views (Sales Orders, Purchase Orders, Inventory, etc.).
Composes: Header, FilterToolbar, GridSummaryStrip, OperatorGrid, BulkActionBar, DetailSlideover.

> **UX-first principles for this template (UX-3, UX-4, UX-2, UX-11):**
> - **One primary surface:** the OperatorGrid is the view. Nothing else is permanent enough to compete.
> - **Status is a filter, not a tab.** The legacy `ViewTabBar` is removed from this template; status lives in the FilterToolbar Status pill (WF-C-FILTER). See WF-C-TABBAR for its new content-tab role.
> - **GridSummaryStrip is collapsed by default** to a single inline KPI line (WF-C-SUMMARY). Operator clicks "Show breakdown ▾" only when they need it.
> - **Actions are state-gated.** The "+ New" button is always shown; per-row actions render only when they apply to the row's current state.
> - **BulkActionBar appears on selection only** (UX-4). Dark translucent overlay.
> - **DetailSlideover encodes target+tab into the URL** (UX-11). Browser back closes it before navigating away.

---

### Full Page Layout

```
┌─ View Header ────────────────────────────────────────────────────────────────────┐
│  "Sales Orders"                                     [+ New Order ▾] [⚙ Settings] │
│  Inter 20px semibold                                right-aligned actions        │
├─ FilterToolbar ──────────────────────────────────────────────────────────────────┤
│  [▾ Data views] │ [▾ Date ▾] [▾ Keyword ▾] [▾ Amount ▾] [▾ Status (2)]           │
│                 │ [⬇ Export]                                                     │
│  [✕ status: Draft, Confirmed]  [✕ date: last-30-days]                            │
├─ GridSummaryStrip (collapsed by default) ────────────────────────────────────────┤
│  42 orders · $128,400 total · 5 pending · 3 shipped         [Show breakdown ▾]   │
├─ OperatorGrid (AG Grid) ─────────────────────────────────────────────────────────┤
│  (Status now lives in FilterToolbar Status pill — no ViewTabBar above the grid)  │
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
- **Component:** `GridSummaryStrip`. See `WF-C-SUMMARY.md`
- **Height:** 36px collapsed (inline KPI text), 116px expanded after "Show breakdown ▾"
- **Status filtering does NOT live here.** Status is part of the FilterToolbar Status pill (multi-select, UX-9). No ViewTabBar above the grid.

#### 4. ~~ViewTabBar~~ → Removed from this template
- Status-by-status filtering is in the FilterToolbar Status pill (WF-C-FILTER).
- The legacy `ViewTabBar` component is repurposed as the content-kind `ContentTabBar` for slide-overs, profiles, and dashboards (WF-C-TABBAR). It does not appear in the GridView template.

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
                       {/* Status pill is part of FilterToolbar, NOT a separate TabBar */}
    <GridSummaryStrip  entity={entity} metrics={viewConfig.metrics}
                       defaultCollapsed />
    <OperatorGrid      entity={entity} columns={entitySchema.columns}
                       rowData={data} onRowClick={openSlideover} />
    {selectedCount > 0 && <BulkActionBar entity={entity} />}
    {urlState.slideoverTarget && <DetailSlideover entity={entity} />}
  </div>
)
```

URL state is the source of truth for selection, filters, and the open slide-over —
not local React state. Reload reproduces the exact view (UX-11).

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

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Per-row "⋮" menu shows only actions valid for the row state; absent (not disabled) actions for other states |
| UX-2 Supporting info one click away | ✅ | Slide-over carries history, vendor, customer detail; no permanent VendorContextPanel / PurchaseHistoryPanel |
| UX-3 One primary surface per view | ✅ | OperatorGrid is the surface; everything else is a thin band or transient overlay |
| UX-4 Bulk actions on selection only | ✅ | BulkActionBar renders only when `selectedCount > 0` |
| UX-5 Validation at point of impact | ✅ | Inline cell editor errors per WF-C-COMBOBOX; no permanent validation strip |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Inventory Finder, Saved Views run in slide-overs; modals only for irreversible confirms |
| UX-7 Mode is always visible | ✅ | Active filters (chip pills) and selection count are continuously visible |
| UX-8 State changes resolve in place | ✅ | Cell edits, bulk actions, slide-over saves all resolve without leaving the grid view |
| UX-9 Filtering fluid; navigation durable | ✅ | Status is a filter inside FilterToolbar; no TabBar masquerading as filter |
| UX-10 Cell saves immediate; forms explicit | ✅ | OperatorGrid cells inline-save; slide-over forms have explicit Save/Cancel |
| UX-11 URL is session memory | ✅ | Filters, sort, selection, open slide-over target+tab, breakdown state all encode to URL |
| UX-12 Empty states give next step | ✅ | Zero results show "No [entities] match. [Clear filters]" with primary action |

---
*Font: Inter 20px headers, Inter 13px body. Colors: semantic classes only. All sections: border-bottom separation.*
