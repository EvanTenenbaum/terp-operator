## Wireframe: WF-V-PO — PurchaseOrdersView (GridView)

### UX Posture

This view exists to answer one question: *what is the state of my purchase orders?* The PO table is the only primary surface. PO authoring, vendor context, and receipt detail are slide-overs that open on demand. Action buttons follow PO state — a draft never shows `Receive` or `Draft Intake`. The first thing the operator sees in under one second is the list.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FilterToolbar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [+ New PO]  │ Status ▾ │ Data views ▾ │ Date ▾ │ Vendor ▾ │ Amount ▾ │ │
│ │              │ Group ▾  │ Sort ▾       │ Export ▾                       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [Status: Active ×]  [Vendor: Acme Corp ×]            [Clear all filters]│ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              KPI Line                                         │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  15 POs · $124,500  ·  Draft 4 · Ordered 3 · Received 5 · Finalized 3    │ │
│ │                                                       [Show breakdown ▾] │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                               PO Table (AG Grid)                              │
│ ┌────┬─────────────┬──────────┬──────────┬───────────┬───────────┬────────┐ │
│ │ ID │ Vendor      │ Date     │ Status   │ Total     │ Lines     │Actions │ │
│ ├────┼─────────────┼──────────┼──────────┼───────────┼───────────┼────────┤ │
│ │1012│ Acme Corp   │ 06/12/26 │ Draft    │ $18,200   │ 14 lines  │ [···]  │ │
│ │1011│ GlobalFoods │ 06/11/26 │ Ordered  │ $42,500   │ 32 lines  │ [···]  │ │
│ │1010│ MetroFresh  │ 06/10/26 │ Received │ $9,800    │ 6 lines   │ [···]  │ │
│ │1009│ Acme Corp   │ 06/08/26 │ Finalized│ $31,200   │ 22 lines  │ [···]  │ │
│ │1008│ PrimeProduce│ 06/05/26 │ Draft    │ $5,400    │ 4 lines   │ [···]  │ │
│ │1007│ SunState    │ 06/04/26 │ Received │ $17,300   │ 19 lines  │ [···]  │ │
│ └────┴─────────────┴──────────┴──────────┴───────────┴───────────┴────────┘ │
│                         (row height: 44px Mercury-parity)                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                  BulkActionBar (appears only when rows selected)              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  2 POs selected · $49,700   [Approve & Finalize]                         │ │
│ │                                  [More ▾: Export | Print | Discard]      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Authoring Slide-over (appears only when [+ New PO] clicked or draft row opened):
┌──────────────────────────────────────────────────────────────────────────────┐
│                  Slide-over (right panel, 420px standard)                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  New PO (draft)                                                      [×] │ │
│ │  ─────────────────────────────────────────────────────────────────────── │ │
│ │  Vendor:        [Acme Corp ▾]   (searchable combobox)                    │ │
│ │  Expected Date: [06/20/2026]                                             │ │
│ │  Payment Terms: [Net 30 ▾]                                               │ │
│ │  Notes:         [_________________________________________________]      │ │
│ │  ─────────────────────────────────────────────────────────────────────── │ │
│ │  ┌─────────┐ ┌─────────┐                                                 │ │
│ │  │ Lines   │ │ Vendor  │   ← Vendor context is one click away, not zero │ │
│ │  └─────────┘ └─────────┘                                                 │ │
│ │  ─────────────────────────────────────────────────────────────────────── │ │
│ │  ▼ Lines tab (active)                                                    │ │
│ │  ┌──────────────────────────────────────────────────────────────────────┐│ │
│ │  │ Line │ Product        │ Qty   │ Price  │ Total                       ││ │
│ │  │  1   │ [add product…] │       │        │                             ││ │
│ │  │  [+ Add line]                                                        ││ │
│ │  └──────────────────────────────────────────────────────────────────────┘│ │
│ │                                                                          │ │
│ │  Footer actions (state-gated for draft):                                 │ │
│ │  [Discard]                                  [Save Draft] [Approve & Final│ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over for an existing PO (appears on row click):
  Same shell as authoring; tabs become Lines | Vendor | Receipts | History.
  Footer actions depend on PO status (see "State-gated actions" below).
```

### State-Gated Action Surface

Action buttons never appear for states they cannot execute against. Disabled buttons are absent, not greyed out.

| PO State   | Visible Actions                                                                 |
|------------|---------------------------------------------------------------------------------|
| Draft      | `Save Draft`, `Approve & Finalize`, `Discard`                                   |
| Ordered    | `Draft Intake`, `Record Prepayment`, `Cancel Order`                             |
| Received   | `Finalize`, `Record Prepayment`, `View Linked Intake`                           |
| Finalized  | `View Linked Intake`, `Unfinalize` (with confirmation), `Export`                |

Bulk actions follow the same rule. A mixed-status selection only shows actions valid for every selected PO (e.g., `Export`, `Print`).

### Dimensions

| Element | Measurement |
|---------|-------------|
| Page max-width | 1440px centered |
| FilterToolbar height | 44px + 32px (active filter pills row) |
| KPI line height | 32px (collapsed) · ~96px (expanded breakdown) |
| AG Grid row height | **44px** (Mercury-parity dense view) |
| ID column width | 80px |
| Vendor column width | 200px |
| Date column width | 100px |
| Status column width | 130px |
| Total column width | 120px |
| Actions column width | 80px |
| Slide-over peek width | 280px |
| Slide-over standard width | 420px |
| Slide-over wide width | 60% viewport |
| Slide-over transition | 300ms cubic-bezier(0.2, 0.8, 0.4, 1) |
| BulkActionBar height | 52px, animates up from bottom |
| Font | Inter 13px, line-height 1.4 |
| Color system | Semantic CSS classes only (no hex values) |

### Interactive Elements

- **[+ New PO] button (in FilterToolbar)**: Opens authoring slide-over at 420px. Pre-fills today's date and prior vendor (if any) as suggestion. Slide-over URL: `/purchase-orders?compose=new`. Browser back closes the slide-over and preserves filter state.
- **Status ▾ pill**: Replaces the prior ViewTabBar. Multi-select popover lists `All`, `Draft (4)`, `Ordered (3)`, `Received (5)`, `Finalized (3)` with checkboxes. Counts update reactively with other filters. Selection encodes into the URL: `?status=draft,ordered`. Active selections appear as removable pills below the toolbar.
- **FilterToolbar menu items**: Each opens a dropdown panel. "Data views" shows saved-view presets. "Date" shows date picker with quick options (Today, This Week, Last 7 Days, This Month, Custom). "Vendor" shows multi-select vendor picker. "Amount" shows range slider or min/max inputs. "Group" shows grouping options (by Vendor, Status, Date). "Export" triggers CSV/Excel download of current view.
- **Active filter pills**: Display below FilterToolbar with [×] dismiss buttons. "Clear all filters" link resets to default view.
- **KPI line**: A single text line ("15 POs · $124,500 · Draft 4 · Ordered 3 · Received 5 · Finalized 3"). The status counts double as a glance-only summary; the Status ▾ pill is the actual filter control. "Show breakdown ▾" expands into 4–5 metric cards (Total Value, Draft Value, Avg PO Size, Open Vendor Count, Aging by Status). Breakdown collapses by default.
- **AG Grid table**:
  - Column headers are sortable (click toggles asc/desc/none).
  - Columns are reorderable via drag.
  - Row click opens the slide-over in detail mode at 280px peek. The opened entity encodes into the URL: `?po=PO-1012`.
  - Actions column shows a `[···]` kebab menu per row with state-gated actions (see table above).
  - Status column is an inline ComboboxCellEditor — click to open dropdown of valid transitions for the current row's state.
  - PaymentTerms column (visible in wider views) is also a ComboboxCellEditor.
  - Multi-row selection with checkboxes (Cmd+click for multi, Shift+click for range).
  - Keyboard navigation: arrow keys between cells, Enter to edit, F2 to enter cell editor.
- **BulkActionBar**: Slides up from bottom only when rows are selected. Shows count + total. Primary action buttons are filtered by the intersection of valid actions across selected rows (see "State-Gated Action Surface"). "More ▾" overflow menu reveals always-safe actions (Export, Print). Deselecting all rows hides the bar.
- **Slide-over (authoring mode)**:
  - Footer shows only the two actions a draft can take: `Save Draft` and `Approve & Finalize`. No `Receive`, `Draft Intake`, `Unfinalize`.
  - "Vendor" tab one click away holds open AP, terms, prior POs, market signals.
  - Quick Add from vendor history is a row-level affordance on the Lines grid (not buried in the Vendor tab).
  - Closing the slide-over auto-saves the draft. The URL `?compose=new` clears on close. Re-opening the draft restores the in-progress state.
- **Slide-over (detail mode)**:
  - Header shows PO number, vendor, and current state badge.
  - Footer actions depend on state (see "State-Gated Action Surface").
  - Tabs: Lines, Vendor (one click away), Receipts, History.
  - "View Full Order →" link navigates to `/purchase-orders/:id` for the full-page edit view when richer manipulation is required.
- **Slide-over close**: Click [×], click overlay backdrop, or press Esc. Browser back also closes the slide-over and restores the underlying grid state.
- **Slide-over resize**: Drag handle on left edge resizes between 280px, 420px, 60%.

### States Shown

- **Default arrival**: PO table only. No slide-over. No bulk bar. Status ▾ defaults to `Active` (Draft + Ordered + Received). KPI line collapsed to single-line summary. Operator's eye lands on the table in under 1 second.
- **Single row selected**: Row highlighted. No bulk bar (single selection is for navigation, not bulk actions).
- **Multiple rows selected (2+)**: BulkActionBar slides up from bottom. Shows count, total, intersection of valid actions.
- **Row click → Slide-over peek**: 280px panel slides in from right. Grid shifts left. Backdrop overlay at 30% opacity behind grid.
- **Slide-over standard**: 420px panel. Triggered by "View Full Order" or resize drag.
- **Slide-over wide**: 60% viewport. Triggered by resize drag beyond 420px.
- **ComboboxCellEditor active**: Dropdown menu appears below/beside cell. Click outside or Esc to close.
- **KPI breakdown expanded**: Status counts replaced with 4–5 metric cards (shadow-only styling). Click "Hide breakdown ▴" to collapse.
- **Loading state**: Skeleton rows in grid (8 rows, shimmer). FilterToolbar disabled. KPI line shows "Loading…"
- **Empty state**: "No purchase orders found" with "Create your first PO" CTA (the `+ New PO` button in the toolbar pulses subtly). FilterToolbar still visible so operator can clear filters if filter is the reason.
- **Empty filtered**: "No POs match your filters" message. "Clear all filters" link prominent.
- **Error state**: Inline error banner with retry button. "Could not load purchase orders. [Retry]"

### ARIA Annotations

- **FilterToolbar menubar**: `role="menubar"`, `aria-label="Purchase orders filter toolbar"`
- **[+ New PO] button**: `role="button"`, `aria-label="Create new purchase order"`, `aria-haspopup="dialog"`
- **Status ▾ pill**: `role="combobox"`, `aria-label="Filter by status"`, `aria-haspopup="listbox"`, `aria-expanded="false"`. Listbox: `role="listbox"`, `aria-multiselectable="true"`. Options carry counts: `aria-label="Draft, 4 purchase orders"`.
- **Filter menu items**: `role="menuitem"`, `aria-haspopup="true"`
- **Active filter pills**: `role="list"`, `aria-label="Active filters"`. Each pill: `role="listitem"`. Dismiss: `aria-label="Remove [filter name] filter"`
- **KPI line**: `role="status"`, `aria-live="polite"`, `aria-label="Summary: 15 purchase orders, total 124,500 dollars, 4 draft, 3 ordered, 5 received, 3 finalized"`
- **"Show breakdown" toggle**: `role="button"`, `aria-expanded="false"`, `aria-controls="po-kpi-breakdown"`
- **AG Grid**: `role="grid"`, `aria-label="Purchase orders table"`, `aria-rowcount="15"`, `aria-multiselectable="true"`
- **Grid column headers**: `role="columnheader"`, `aria-sort="ascending|descending|none"`
- **Grid rows**: `role="row"`, `aria-selected="true|false"`, `aria-rowindex="N"`
- **Grid cells**: `role="gridcell"`, `aria-colindex="N"`
- **ComboboxCellEditor**: `role="combobox"`, `aria-label="[Column name] for PO [ID]"`, `aria-expanded="true|false"`
- **Actions kebab menu**: `role="button"`, `aria-label="Actions for PO [ID]"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 2 selected purchase orders"`
- **Slide-over**: `role="dialog"`, `aria-label="Purchase order details"`, `aria-modal="false"` (non-blocking: grid still announces in screen reader)
- **Slide-over close**: `role="button"`, `aria-label="Close purchase order details"`
- **Slide-over tabs**: `role="tablist"`, `aria-label="Purchase order detail sections"`
- **Slide-over resize handle**: `role="separator"`, `aria-label="Resize detail panel"`, `aria-valuenow="280"`, `aria-valuemin="280"`, `aria-valuemax="60%"`
- **Loading state**: `role="progressbar"`, `aria-label="Loading purchase orders"`
- **Empty state**: `role="status"`, `aria-label="No purchase orders found"`
- **Error state**: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **Zero POs in system**: Empty state shown with guidance CTA. Status pill shows count 0 in all groups. FilterToolbar remains visible.
- **Zero POs in filtered view**: "No POs match your filters" message. "Clear all filters" link prominent.
- **Very long vendor names**: Vendor column truncates with ellipsis at 180px. Tooltip on hover shows full name.
- **Very many POs (1000+)**: Grid virtualizes (AG Grid handles). KPI line shows exact count. Filtering and sorting remain responsive.
- **All rows selected**: BulkActionBar shows "15 selected · $124,500". Actions apply to the intersection across all selected.
- **Mixed-status selection for bulk action**: Only the intersection of valid actions is shown. A selection containing both a Draft and a Finalized PO offers only `Export` and `Print` — not `Approve & Finalize` (Draft only) and not `Unfinalize` (Finalized only). The "More ▾" menu lists state-specific actions with counts: "Approve & Finalize 4 drafts."
- **Slide-over open while navigating filters**: Slide-over stays open. Filter changes affect the underlying grid; the open entity stays open even if it leaves the filter.
- **Slide-over resize past 60%**: Clamps at 60%. Drag beyond snaps back.
- **Slide-over open with narrow viewport (<768px)**: Slide-over takes full width (100%). Backdrop hidden. Back button required to return to grid.
- **ComboboxCellEditor open on last visible row**: Dropdown flips to open upward to avoid viewport clipping.
- **Concurrent edit conflict**: If another user changes a PO while editing in slide-over, optimistic update fails. Error toast: "This order was modified by another user. Reloading." Grid refreshes.
- **Browser back button with slide-over open**: Slide-over closes. URL reverts to grid-only state. Filter and selection state preserved (per UX-11: URL is the session memory).
- **Mid-flow context switch**: Operator authoring a PO can open the Status ▾ pill, filter to "Ordered," click another PO row to reference it (opening a second slide-over OR replacing the current authoring view based on operator setting), then return to their draft via browser back. Draft state is preserved at all times.
- **Keyboard-only bulk selection**: Space toggles row checkbox. Shift+Arrow extends selection. Cmd+A selects all visible rows. Cmd+Shift+A selects all rows (including off-screen).
- **"Unfinalize" on Finalized PO**: Modal confirmation only (UX-6: modals reserved for destructive operations): "Unfinalize PO #1009? This will revert it to Draft status and remove any linked intake records." Requires explicit confirmation.
- **"Draft Intake" on Ordered PO**: Navigates to IntakeView with the PO pre-selected (deep link with tight filter — UX-11). If PO has no lines, the action is absent (state gating, not disabled).

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Actions per PO state are absent for irrelevant states (not disabled). Draft never shows `Receive`. |
| UX-2: Supporting info one click away, never zero | ✓ | Vendor context lives in a slide-over tab, not a permanent panel. |
| UX-3: One primary surface per view | ✓ | The PO table is the only primary surface. Authoring, vendor, receipts all open as slide-overs. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only when ≥1 row is selected. |
| UX-5: Validation errors at point of impact | ✓ | Cell-level errors appear at the cell. No permanent validation panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Authoring is a slide-over. Modal reserved for `Unfinalize` confirmation. |
| UX-7: System never hides what mode the operator is in | ✓ | Active filters as pills; slide-over header shows entity identity; status badges visible on every row. |
| UX-8: State changes resolve in place | ✓ | Confirm/finalize updates the table inline; no navigation to a confirmation page. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill is a filter (no mode change); switching views via sidebar is the only navigation. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | ComboboxCellEditor saves on selection. Slide-over form has explicit `Save Draft`. |
| UX-11: URL is the session memory | ✓ | Slide-over entity, active filters, sort, and selection encode into the URL. Browser back works. |
| UX-12: Empty states give the operator a next step | ✓ | Empty state surfaces `+ New PO` CTA. Empty filtered state surfaces `Clear all filters`. |
