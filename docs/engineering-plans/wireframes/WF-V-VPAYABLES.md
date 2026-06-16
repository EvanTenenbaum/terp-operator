## Wireframe: WF-V-VPAYABLES — VendorPayablesView

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Vendor Payables                                                [+ New Invoice]│
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [Data views ▾] │ [Date range ▾] │ [Keyword…] │ [Amount ▾] │ [Group ▾]   │ │
│ │ [Sort ▾] │ [Export ▾]                                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Overdue ✕] [Vendor: Sysco ✕] [+ Add filter]                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ GridSummaryStrip ───────────────────────────────────────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│ │ │   Open   │ │ Overdue  │ │   Paid   │ │  Aging   │ │  Total   │        │ │
│ │ │   312    │ │    47    │ │  1,892   │ │  30-60d  │ │  2,251   │        │ │
│ │ │ $1.2M    │ │ $284.3k  │ │ $8.9M    │ │  $198k   │ │  $10.4M  │        │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ViewTabBar ─────────────────────────────────────────────────────────────┐ │
│ │ [All 2,251] [Open 312] [Overdue 47] [Paid 1,892]                         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Vendor        │ Invoice#  │ Amount  │ Due Date │ Status  │ │
│ │───┼──────────┼───────────────┼───────────┼─────────┼──────────┼─────────│ │
│ │ ☐ │ VPI-2217 │ Sysco Corp    │ INV-90124  │ $47,250 │ 06/05/26 │ Overdue │ │
│ │ ☐ │ VPI-2216 │ US Foods      │ INV-90118  │ $32,100 │ 06/18/26 │  Open   │ │
│ │ ☐ │ VPI-2215 │ FreshPoint    │ INV-90109  │ $18,450 │ 06/20/26 │  Open   │ │
│ │ ☐ │ VPI-2214 │ Shamrock Foods│ INV-90098  │ $63,800 │ 06/02/26 │ Overdue │ │
│ │ ☐ │ VPI-2213 │ Sysco Corp    │ INV-90085  │ $28,300 │ 05/30/26 │  Paid   │ │
│ │ ☐ │ VPI-2212 │ US Foods      │ INV-90072  │ $41,200 │ 05/28/26 │  Paid   │ │
│ │ ☐ │ VPI-2211 │ Gordon Food   │ INV-90064  │ $15,900 │ 06/15/26 │  Open   │ │
│ │ ☐ │ VPI-2210 │ FreshPoint    │ INV-90051  │ $22,750 │ 06/10/26 │  Open   │ │
│ │───┼──────────┴───────────────┴───────────┴─────────┴──────────┴─────────│ │
│ │                      Page 1 of 282   [◀ ◀ 1 2 3 … 282 ▶ ▶]               │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (hidden until ≥1 row selected) ───────────────────────────┐ │
│ │ 2 selected • $79,350  [Mark Paid] [Schedule Payment] [Assign ▾] [More ▾] │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ DetailSlideover (right, peek 280px) ────────────────────────────────────┐ │
│ │ VPI-2217 — Sysco Corp                                          [✕] [↗]   │ │
│ │ ┌─ DetailTabBar ───────────────────────────────────────────────────┐     │ │
│ │ │ [Details] [PO Links] [Payments] [History]                        │     │ │
│ │ └───────────────────────────────────────────────────────────────────┘     │ │
│ │ Status: [Overdue ▾]     Due Date: 06/05/26                                  │ │
│ │ Amount: $47,250.00      Invoice#: INV-90124                                  │ │
│ │ Vendor: Sysco Corp      Terms: Net 30                                        │ │
│ │ PO Reference: PO-3342 ($51,200)                                              │ │
│ │ ────────────────────────────────────────────────────────────────────────── │ │
│ │ Aging: 10 days overdue (since 06/05/26)                                       │ │
│ │                                                                              │ │
│ │ ┌─ Payment History ───────────────────────────────────────────────────┐    │ │
│ │ │ No payments recorded — $47,250.00 outstanding                         │    │ │
│ │ └──────────────────────────────────────────────────────────────────────┘    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| View container | 100% viewport | 100vh | flex column |
| View header | 100% | 56px | px-6, flex, items-center, justify-between |
| FilterToolbar | 100% | 40px | horizontal menubar, px-4, gap-2 |
| ActiveFilterPills | 100% | 36px | flex-wrap, px-4, gap-1 |
| GridSummaryStrip | 100% | 88px | px-4, flex, gap-3, overflow-x-auto |
| Summary card | min 160px | 72px | rounded-lg, border, p-3 |
| ViewTabBar | 100% | 40px | px-4, border-b |
| AG Grid | 100% | flex-1 | virtual scrolling |
| Grid row | 100% | 32px | Mercury standard |
| Checkbox column | 48px | 32px | center aligned |
| BulkActionBar | 100% | 48px | sticky bottom, animate slide-up |
| DetailSlideover peek | 280px | 100% parent | default peek width |
| DetailSlideover standard | 420px | 100% parent | on expand click |
| DetailSlideover wide | 60% viewport | 100% parent | on drag to expand |
| DetailTabBar | 100% | 36px | inside slideover |
| Pagination bar | 100% | 36px | border-t, px-4 |

### Interactive Elements

- **Checkbox (per row):** Click toggles row selection; header checkbox selects/deselects all visible rows
- **Status cell (ComboboxCellEditor):** Double-click opens inline combobox: Open, Overdue, Paid, Disputed, Void; typeahead filtered; Enter commits, Escape cancels
- **Amount cell:** Display-only formatted currency ($XX,XXX.00); right-aligned; negative amounts in parentheses
- **Due Date cell:** Double-click opens date picker; overdue dates render with warning styling
- **Vendor cell:** Click navigates to vendor detail view; rendered as link
- **Row click:** Opens DetailSlideover at peek width (280px) for that payable record
- **DetailSlideover expand/collapse:** Drag handle to resize 280px ↔ 420px ↔ 60%; click expand icon toggles
- **DetailTabBar tabs:** Click switches detail content (Details, PO Links, Payments, History)
- **Status dropdown (in detail):** Inline combobox, same as grid editor
- **PO Links tab:** Lists linked purchase orders with amounts, status, clickable to navigate to PO
- **Payments tab:** Table of payment records with date, amount, method, reference; [Record Payment] button opens payment form
- **FilterToolbar dropdowns:** Click opens popover menu; Date range opens dual date picker; Amount opens numeric range input
- **Filter pills (✕):** Click removes that filter; grid re-filters on removal
- **+ Add filter:** Opens filter builder popover with field selector, operator, value input
- **Sort dropdown:** Multi-column sort builder popover
- **Export dropdown:** CSV, Excel, PDF options
- **GridSummaryStrip cards:** Click filters to that card's segment (e.g., click "Overdue 47" opens tab and filters to Overdue)
- **BulkActionBar buttons:** Mark Paid (batch status), Schedule Payment (opens payment scheduler modal), Assign (assignee dropdown), More ▾ (Export selected, Add note, Link to PO)
- **Pagination controls:** Previous/Next page, direct page input, page size selector (25/50/100/All)
- **[+ New Invoice] button:** Opens new invoice form (manual entry or import)
- **Column header click:** Sort ascending/descending/remove
- **Column resize:** Drag right edge of column header

### States Shown

- **Empty state:** "No payables found" illustration + "Clear filters" link + [+ New Invoice] button
- **Loading state:** 8 skeleton rows (32px, shimmer); skeleton summary cards; skeleton tabs
- **Error state:** Banner "Failed to load payables. [Retry]" with error details
- **Filter active:** ActiveFilterPills visible; menubar buttons show active indicator dot
- **No filters:** ActiveFilterPills hidden
- **Row selected:** Highlight + checkbox checked; BulkActionBar slides up
- **Row editing:** Combobox dropdown overlays grid; dimmed background rows
- **Row saving:** Spinner in cell; row non-interactive
- **Row save failed:** Red flash; toast "Failed to update. [Retry] [Undo]"
- **Overdue row:** Row background tint (error-light); Due Date cell bold red; Status pill "Overdue" red
- **Aging summary card:** "30-60d" card shows count and amount for aging bucket; additional buckets in tooltip
- **Bulk action in progress:** "Updating 2 payables…"; buttons disabled
- **Bulk action complete:** Toast "2 invoices marked as Paid"; selections cleared
- **Bulk action failed:** Toast "Failed to update. [Retry] [View details]"
- **DetailSlideover open:** Grid narrows; keyboard trapped in slideover; row highlight persists
- **DetailSlideover loading:** Skeleton in tab content
- **DetailSlideover PO Links empty:** "No purchase orders linked" + [Link PO] button
- **DetailSlideover Payments empty:** "No payments recorded" + [Record Payment] button
- **Export in progress:** Spinner on Export button; toast "Preparing export…"
- **Conflict on save:** Toast "This invoice was updated by [User]. [Refresh] [Keep changes]"
- **Offline:** Banner "You're offline"; cached data shown; edits queued
- **Schedule Payment modal:** Overlay modal with payment amount, date picker, method dropdown, reference field, [Schedule] [Cancel]

### ARIA Annotations

- **View container:** `role="region" aria-label="Vendor Payables view"`
- **View header:** `role="banner"`
- **FilterToolbar:** `role="menubar" aria-label="Filter and view options"`
- **FilterToolbar items:** `role="menuitem" aria-haspopup="true"` for dropdown triggers
- **ActiveFilterPills:** `role="list" aria-label="Active filters"`
- **Filter pill:** `role="listitem"`; remove: `aria-label="Remove Status: Overdue filter"`
- **+ Add filter:** `role="button" aria-label="Add filter"`
- **GridSummaryStrip:** `role="region" aria-label="Payables summary"`
- **Summary card:** `role="button" aria-label="Overdue: 47 invoices, $284.3k — click to filter" tabindex="0"`
- **ViewTabBar:** `role="tablist" aria-label="Payable status tabs"`
- **Tab:** `role="tab" aria-selected="true|false" aria-label="Overdue — 47 invoices"`
- **AG Grid:** `role="grid" aria-label="Vendor payable records" aria-multiselectable="true" aria-rowcount="2251"`
- **Grid header row:** `role="row" aria-rowindex="1"`
- **Column header:** `role="columnheader" aria-sort="none|ascending|descending" aria-label="Amount — click to sort"`
- **Grid data row:** `role="row" aria-rowindex="N" aria-selected="false|true"`
- **Checkbox cell:** `role="gridcell" aria-colindex="1"`; checkbox: `role="checkbox" aria-label="Select VPI-2217"`
- **Status cell (editable):** `role="gridcell" aria-colindex="7" aria-readonly="false"`; combobox: `role="combobox" aria-expanded="false" aria-label="Status for VPI-2217"`
- **Vendor cell:** `role="gridcell"`; link: `role="link" aria-label="View Sysco Corp details"`
- **Amount cell:** `role="gridcell" aria-label="$47,250.00"`
- **BulkActionBar:** `role="toolbar" aria-label="Bulk actions — 2 selected" aria-live="polite"`
- **Pagination:** `role="navigation" aria-label="Grid pagination"`
- **DetailSlideover:** `role="dialog" aria-label="Invoice VPI-2217 details" aria-modal="true"`
- **Slideover close:** `aria-label="Close details"`
- **Slideover expand:** `aria-label="Expand to 420px"`
- **DetailTabBar:** `role="tablist" aria-label="Payable detail sections"`
- **Toast notifications:** `role="alert" aria-live="assertive"`
- **Overdue row:** `aria-label="VPI-2217 — Sysco Corp — Overdue — 10 days"` via row-level label
- **Schedule Payment modal:** `role="dialog" aria-label="Schedule payment for VPI-2217" aria-modal="true"`

### Edge Cases Handled

- **No payables at all:** Full-page empty: "No vendor payables yet — add your first invoice to start tracking" + [New Invoice] button; summary strip hidden; tabs hidden
- **All payables paid:** Normal view; Open/Overdue tabs shown with count 0; Paid tab selected by default; Summary strip shows $0 open/overdue
- **Negative amount (credit memo):** Amount displayed in parentheses with "Credit" badge; sort handles negative correctly; summary strip aggregates credit memos in separate count or nets against total
- **Very large amount (>$10M):** Displayed with appropriate formatting ($12.4M); grid tooltip shows exact value; detail view shows full precision
- **Missing vendor:** Grid shows "—"; Vendor filter includes "(No vendor)" option
- **Missing PO link:** PO Links tab shows "No purchase order linked — [Link to PO]" with searchable PO picker
- **Overlapping payment dates:** Payment history ordered by date descending; total reconciliation at bottom of Payments tab showing "Applied: $47,250.00 | Remaining: $0.00"
- **Multiple POs per invoice:** PO Links tab shows table of linked POs; totals reconcile "Invoice: $47,250 | POs: $51,200 | Difference: $3,950 credit"
- **Aging bucket edge:** Aging card "30-60d" = $198k aggregated from rows 30-60 days past due; day 0 = due date; 0-30d, 30-60d, 60-90d, 90d+ buckets
- **Concurrent edit:** Same conflict handling as FulfillmentView
- **Large dataset:** Virtual scrolling; pre-computed summary; export warning for >10k rows
- **Rapid filter changes:** 300ms debounce; request cancellation; delayed loading indicator
- **Browser back:** Closes slideover; restores scroll/filter state
- **Offline:** Cached data; queued edits; offline banner
- **Schedule Payment from bulk:** If amounts differ across selected invoices, shows per-invoice breakdown in modal with individual amounts and total
- **Keyboard navigation:** Arrow keys for grid cells; Space for checkbox; Enter for detail; F2 for edit; Tab for toolbar↔grid↔detail; Escape to close; Ctrl+A select all
- **Screen reader:** "47 overdue invoices totaling $284.3k" on filter; "Sorted by due date, oldest first" on sort
