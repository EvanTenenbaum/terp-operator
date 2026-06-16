## Wireframe: WF-V-PO — PurchaseOrdersView (GridView)

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  Page Header                                  │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Purchase Orders                                          [+ New PO]      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              FilterToolbar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Data views ▾ │ Date range ▾ │ Vendor ▾ │ Amount ▾ │ Group ▾ │ Export ▾  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [Active ×]  [Ordered ×]  [Finalized ×]            [Clear all filters]   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              GridSummaryStrip                                 │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  15 POs · Total $124,500  │ 4 Draft  │ 3 Ordered  │ 5 Received  │ 3 ...  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                ViewTabBar                                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ┌─────────┐ ┌─────────┐ ┌────────────┐ ┌──────────┐ ┌───────────┐      │ │
│ │  │  All 7  │ │ Draft 2 │ │ Ordered 3  │ │Received 5│ │Finalized 3│      │ │
│ │  └─────────┘ └─────────┘ └────────────┘ └──────────┘ └───────────┘      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                               PO Table (AG Grid)                              │
│ ┌────┬─────────────┬──────────┬──────────┬───────────┬───────────┬────────┐ │
│ │ ID │ Vendor      │ Date     │ Status   │ Total     │ Lines     │Actions │ │
│ ├────┼─────────────┼──────────┼──────────┼───────────┼───────────┼────────┤ │
│ │1012│ Acme Corp   │ 06/12/26 │ Draft    │ $18,200   │ 14 lines  │ [···]  │ │
│ │    │             │          │          │           │           │        │ │
│ ├────┼─────────────┼──────────┼──────────┼───────────┼───────────┼────────┤ │
│ │1011│ GlobalFoods │ 06/11/26 │ Ordered  │ $42,500   │ 32 lines  │ [···]  │ │
│ │    │             │          │          │           │           │        │ │
│ ├────┼─────────────┼──────────┼──────────┼───────────┼───────────┼────────┤ │
│ │1010│ MetroFresh  │ 06/10/26 │Received  │ $9,800    │ 6 lines   │ [···]  │ │
│ │    │             │          │          │           │           │        │ │
│ ├────┼─────────────┼──────────┼──────────┼───────────┼───────────┼────────┤ │
│ │1009│ Acme Corp   │ 06/08/26 │Finalized │ $31,200   │ 22 lines  │ [···]  │ │
│ │    │             │          │          │           │           │        │ │
│ ├────┼─────────────┼──────────┼──────────┼───────────┼───────────┼────────┤ │
│ │1008│ PrimeProduce│ 06/05/26 │ Draft    │ $5,400    │ 4 lines   │ [···]  │ │
│ │    │             │          │          │           │           │        │ │
│ ├────┼─────────────┼──────────┼──────────┼───────────┼───────────┼────────┤ │
│ │1007│ SunState    │ 06/04/26 │Received  │ $17,300   │ 19 lines  │ [···]  │ │
│ └────┴─────────────┴──────────┴──────────┴───────────┴───────────┴────────┘ │
│                         (row height: 280px)                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                              BulkActionBar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  2 POs selected · $49,700  [Draft → Finalize]  [Ordered → Receive]       │ │
│ │                                        [More ▾: Export | Print | Delete]  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                     Detail Slideover (right panel, 280px)                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ← Back to list                          PO #1012                    [×] │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  Vendor: Acme Corp                                                       │ │
│ │  Date:   06/12/2026                                                      │ │
│ │  Status: ┌──────────┐                                                    │ │
│ │          │ Draft ▾  │  (ComboboxCellEditor)                              │ │
│ │          └──────────┘                                                    │ │
│ │  Total:  $18,200.00                                                      │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  Payment Terms: ┌───────────┐                                            │ │
│ │                 │ Net 30 ▾  │  (ComboboxCellEditor)                      │ │
│ │                 └───────────┘                                            │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ┌──────────────┐  ┌──────────────┐                                      │ │
│ │  │ Draft Intake │  │ Unfinalize   │                                      │ │
│ │  └──────────────┘  └──────────────┘                                      │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ┌─────────┐ ┌────────────┐ ┌─────────┐ ┌──────────┐                    │ │
│ │  │ Lines   │ │Linked Intake│ │ Vendor  │ │ History  │                    │ │
│ │  └─────────┘ └────────────┘ └─────────┘ └──────────┘                    │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ Lines tab (active)                                                    │ │
│ │  ┌──────────────────────────────────────────────────────────────────────┐│ │
│ │  │ Line │ Product        │ Qty   │ Price  │ Total                      ││ │
│ │  │  1   │ Roma Tomatoes  │ 50 cs │ $28.00 │ $1,400.00                  ││ │
│ │  │  2   │ Iceberg Lettuce│ 80 cs │ $22.50 │ $1,800.00                  ││ │
│ │  │  3   │ Green Peppers  │ 60 cs │ $18.00 │ $1,080.00                  ││ │
│ │  │  ... │ ...            │ ...   │ ...    │ ...                        ││ │
│ │  └──────────────────────────────────────────────────────────────────────┘│ │
│ │                                                                          │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ Vendor tab                                                            │ │
│ │  Name:     Acme Corp                                                     │ │
│ │  Terms:    Net 30                                                        │ │
│ │  Open Bills: 3 ($12,400 outstanding)                                     │ │
│ │  Prior POs:  8 (view all →)                                              │ │
│ │  [+ Quick Add Vendor Product]                                            │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │                                                                          │ │
│ │  [View Full Order →]  (navigates to /purchase-orders/:id)                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Element | Measurement |
|---------|-------------|
| Page max-width | 1440px centered |
| FilterToolbar height | 44px + 32px (active filter pills row) |
| GridSummaryStrip height | 36px |
| ViewTabBar height | 40px |
| AG Grid row height | 280px (tall rows for spreadsheet-native display) |
| ID column width | 80px |
| Vendor column width | 200px |
| Date column width | 100px |
| Status column width | 130px |
| Total column width | 120px |
| Actions column width | 80px |
| Slideover peek width | 280px |
| Slideover standard width | 420px |
| Slideover wide width | 60% viewport |
| Slideover transition | 300ms cubic-bezier(0.2, 0.8, 0.4, 1) |
| BulkActionBar height | 52px, animates up from bottom |
| Font | Inter 13px, line-height 1.4 |
| Color system | Semantic CSS classes only (no hex values) |

### Interactive Elements

- **[+ New PO] CTA button**: Opens authoring slide-over at 420px. Pre-fills blank PO with today's date. Vendor field is searchable combobox. Save creates PO in Draft status.
- **FilterToolbar menu items**: Each opens a dropdown panel. "Data views" shows saved-view presets. "Date range" shows date picker with Quick options (Today, This Week, Last 7 Days, This Month, Custom). "Vendor" shows multi-select vendor picker. "Amount" shows range slider or min/max inputs. "Group" shows grouping options (by Vendor, Status, Date). "Export" triggers CSV/Excel download of current view.
- **Active filter pills**: Display below FilterToolbar. Each pill shows filter name and [×] dismiss button. "Clear all filters" link resets to default view.
- **GridSummaryStrip**: Dynamically updates count, total, and status breakdowns based on active filters and tab selection.
- **ViewTabBar tabs**: Filter the AG Grid to matching status. Tab label shows count (e.g., "Draft 2"). Active tab has underline indicator. Clicking a tab applies a client-side filter.
- **AG Grid table**: 
  - Column headers are sortable (click toggles asc/desc/none).
  - Columns are reorderable via drag.
  - Row click opens DetailSlideover at 280px peek.
  - Actions column shows a `[···]` kebab menu per row with: Edit, Duplicate, Delete, View Details.
  - Status column is an inline ComboboxCellEditor — click to open dropdown: Draft, Ordered, Received, Finalized.
  - PaymentTerms column (visible in wider views) is also a ComboboxCellEditor.
  - Multi-row selection with checkboxes (Cmd+click for multi, Shift+click for range).
  - Keyboard navigation: arrow keys between cells, Enter to edit.
- **BulkActionBar**: Slides up from bottom when rows are selected. Shows count + total. Primary action buttons change based on selected rows' statuses. "More ▾" overflow menu reveals Export, Print, Delete options. Deselecting all rows hides the bar.
- **DetailSlideover (peek, 280px)**:
  - Shows PO summary: ID, vendor, date, status (editable combobox), total, payment terms (editable combobox).
  - Action buttons: "Draft Intake" (links PO to intake workflow), "Unfinalize" (reverts Finalized → Draft with confirmation).
  - Tab bar: Lines, Linked Intake, Vendor, History.
  - "View Full Order →" link navigates to `/purchase-orders/:id`.
- **DetailSlideover (standard, 420px)**:
  - Same content as peek but with wider layout.
  - Lines tab shows full line-item table with inline editing.
  - Vendor tab shows vendor details, open bills list, prior POs list, and inline Quick Add form.
- **Slideover close**: Click [×], click overlay backdrop, or press Esc.
- **Slideover resize**: Drag handle on left edge resizes between 280px, 420px, 60%.

### States Shown

- **Default (no selections)**: Full grid visible, no slideover, no bulk bar. FilterToolbar shows default "Active" view preset.
- **Single row selected**: Row highlighted. No bulk bar (single selection is for navigation, not bulk actions).
- **Multiple rows selected (2+)**: BulkActionBar slides up from bottom. Shows count, total, context-aware action buttons.
- **Row click → DetailSlideover peek**: 280px panel slides in from right. Grid shifts left. Backdrop overlay at 30% opacity behind grid.
- **DetailSlideover standard**: 420px panel. Triggered by "View Full Order" or resize drag.
- **DetailSlideover wide**: 60% viewport. Triggered by resize drag beyond 420px.
- **ComboboxCellEditor active**: Dropdown menu appears below/beside cell. Click outside or Esc to close.
- **Loading state**: Skeleton rows in grid. FilterToolbar disabled. Summary strip shows "Loading..."
- **Empty state**: "No purchase orders found" illustration with "Create your first PO" CTA button.
- **Error state**: Inline error banner with retry button. "Could not load purchase orders. [Retry]"

### ARIA Annotations

- **Page header**: `role="banner"`, `aria-label="Purchase Orders"`
- **[+ New PO] button**: `role="button"`, `aria-label="Create new purchase order"`, `aria-haspopup="dialog"`
- **FilterToolbar menubar**: `role="menubar"`, `aria-label="Filter toolbar"`
- **Filter menu items**: `role="menuitem"`, `aria-haspopup="true"`
- **Active filter pills**: `role="list"`, `aria-label="Active filters"`. Each pill: `role="listitem"`. Dismiss: `aria-label="Remove [filter name] filter"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="Summary: 15 purchase orders, total 124,500 dollars"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Purchase order status filters"`
- **ViewTabBar tabs**: `role="tab"`, `aria-selected="true|false"`, `aria-controls="po-grid"`
- **AG Grid**: `role="grid"`, `aria-label="Purchase orders table"`, `aria-rowcount="15"`, `aria-multiselectable="true"`
- **Grid column headers**: `role="columnheader"`, `aria-sort="ascending|descending|none"`, `aria-label="Sort by [column name]"`
- **Grid rows**: `role="row"`, `aria-selected="true|false"`, `aria-rowindex="N"`
- **Grid cells**: `role="gridcell"`, `aria-colindex="N"`
- **ComboboxCellEditor**: `role="combobox"`, `aria-label="[Column name] for PO [ID]"`, `aria-expanded="true|false"`
- **Actions kebab menu**: `role="button"`, `aria-label="Actions for PO [ID]"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 2 selected purchase orders"`
- **"More ▾" overflow**: `role="button"`, `aria-label="More bulk actions"`, `aria-haspopup="menu"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Purchase order details"`, `aria-modal="true"`
- **Slideover back button**: `role="button"`, `aria-label="Back to purchase orders list"`
- **Slideover close**: `role="button"`, `aria-label="Close purchase order details"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Purchase order detail sections"`
- **Slideover resize handle**: `role="separator"`, `aria-label="Resize detail panel"`, `aria-valuenow="280"`, `aria-valuemin="280"`, `aria-valuemax="60%"`
- **Loading state**: `role="progressbar"`, `aria-label="Loading purchase orders"`
- **Empty state**: `role="status"`, `aria-label="No purchase orders found"`
- **Error state**: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **Zero POs in system**: Empty state shown with guidance CTA. "All" tab shows count 0. FilterToolbar and ViewTabBar remain visible.
- **Zero POs in filtered view**: "No POs match your filters" message. "Clear all filters" link prominent. ViewTabBar tabs still shown but all counts are 0.
- **Very long vendor names**: Vendor column truncates with ellipsis at 180px. Tooltip on hover shows full name.
- **Very many POs (1000+)**: Grid virtualizes (AG Grid handles). Summary strip shows exact count. Filtering and sorting remain responsive.
- **All rows selected**: BulkActionBar shows "15 selected · $124,500". Actions apply to all.
- **Mixed-status selection for bulk action**: Only valid transitions shown. Selected Draft POs → "Finalize" button. Selected Ordered POs → "Receive" button. Mixed selection disables incompatible actions with tooltip: "Some selected POs cannot be finalized."
- **Slideover open while navigating tabs**: Slideover content updates to reflect newly selected row. If no row selected and slideover is open, slideover closes.
- **Slideover resize past 60%**: Clamps at 60%. Drag beyond snaps back.
- **Slideover open with narrow viewport (<768px)**: Slideover takes full width (100%). Backdrop hidden. Back button required to return to grid.
- **ComboboxCellEditor open on last visible row**: Dropdown flips to open upward to avoid viewport clipping.
- **Concurrent edit conflict**: If another user changes a PO while editing in slideover, optimistic update fails. Error toast: "This order was modified by another user. Reloading." Grid refreshes.
- **Browser back button with slideover open**: Slideover closes, URL reverts to grid-only state. Grid filter/tab state preserved.
- **Keyboard-only bulk selection**: Space toggles row checkbox. Shift+Arrow extends selection. Cmd+A selects all visible rows. Cmd+Shift+A selects all rows (including off-screen).
- **"Unfinalize" on Finalized PO**: Opens confirmation dialog: "Unfinalize PO #1009? This will revert it to Draft status and remove any linked intake records." Requires explicit confirmation.
- **"Draft Intake" on Draft PO**: Navigates to IntakeView with the PO pre-selected. If PO has no lines, shows warning: "This PO has no line items. Add lines before creating intake."
