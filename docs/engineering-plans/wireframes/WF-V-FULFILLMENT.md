## Wireframe: WF-V-FULFILLMENT — FulfillmentView

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Fulfillment                                                    [+ New Shipment]│
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [Data views ▾] │ [Date range ▾] │ [Keyword…] │ [Amount ▾] │ [Group ▾]   │ │
│ │ [Sort ▾] │ [Export ▾]                                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Pending ✕] [Carrier: UPS ✕] [+ Add filter]                      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ GridSummaryStrip ───────────────────────────────────────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│ │ │ Pending  │ │In Transit│ │Delivered │ │ Delayed  │ │  Total   │        │ │
│ │ │   142    │ │    89    │ │   2,034  │ │    12    │ │  2,277   │        │ │
│ │ │ $842.3k  │ │ $421.1k  │ │ $12.4M   │ │ $67.2k   │ │ $13.7M   │        │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ViewTabBar ─────────────────────────────────────────────────────────────┐ │
│ │ [All 2,277] [Pending 142] [In Transit 89] [Delivered 2,034]              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Order     │ Customer       │ Ship Date │ Carrier │ Status  │ │
│ │───┼──────────┼───────────┼────────────────┼───────────┼─────────┼─────────│ │
│ │ ☐ │ FUL-1042 │ SO-8841   │ Fresh Harvest  │ 06/12/26  │ UPS     │ Pending │ │
│ │ ☐ │ FUL-1041 │ SO-8839   │ Green Valley   │ 06/11/26  │ FedEx   │InTransit│ │
│ │ ☐ │ FUL-1040 │ SO-8835   │ Pacific Grocers│ 06/10/26  │ DHL     │Delivered│ │
│ │ ☐ │ FUL-1039 │ SO-8832   │ Farm To Table  │ 06/09/26  │ UPS     │Delivered│ │
│ │ ☐ │ FUL-1038 │ SO-8827   │ Urban Fields   │ 06/09/26  │ FedEx   │ Delayed │ │
│ │ ☐ │ FUL-1037 │ SO-8824   │ Midwest Co-op  │ 06/08/26  │ USPS    │Delivered│ │
│ │ ☐ │ FUL-1036 │ SO-8821   │ Coastal Fresh  │ 06/07/26  │ UPS     │Delivered│ │
│ │ ☐ │ FUL-1035 │ SO-8818   │ Harvest Moon   │ 06/07/26  │ DHL     │ Pending │ │
│ │───┼──────────┴───────────┴────────────────┴───────────┴─────────┴─────────│ │
│ │                      Page 1 of 285   [◀ ◀ 1 2 3 … 285 ▶ ▶]               │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (hidden until ≥1 row selected) ───────────────────────────┐ │
│ │ 3 selected • $124.7k  [Mark Shipped] [Print Labels] [Assign Carrier ▾]   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ DetailSlideover (right, peek 280px) ────────────────────────────────────┐ │
│ │ FUL-1042 — Fresh Harvest                                      [✕] [↗]   │ │
│ │ ┌─ DetailTabBar ───────────────────────────────────────────────────┐     │ │
│ │ │ [Details] [Items] [Tracking] [History]                            │     │ │
│ │ └───────────────────────────────────────────────────────────────────┘     │ │
│ │ Status: [Pending ▾]     Ship Date: [06/12/26]                              │ │
│ │ Carrier: UPS            Tracking: 1Z999AA10123456784                        │ │
│ │ Order: SO-8841 ($42,350)                                                    │ │
│ │ Ship To: 123 Farm Rd, Fresno CA 93706                                       │ │
│ │ ────────────────────────────────────────────────────────────────────────── │ │
│ │ Notes: "Handle with care — refrigerated"                                    │ │
│ │                                                                             │ │
│ │ ┌─ Related ──────────────────────────────────────────────────────────┐    │ │
│ │ │ PO-4421 (Purchase Order) • INV-2291 (Invoice) • REC-118 (Receipt)   │    │ │
│ │ └─────────────────────────────────────────────────────────────────────┘    │ │
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
- **Status cell (ComboboxCellEditor):** Double-click opens inline combobox dropdown: Pending, In Transit, Delivered, Delayed, Cancelled; supports typeahead filtering; Enter commits, Escape cancels
- **Carrier cell (ComboboxCellEditor):** Double-click opens dropdown: UPS, FedEx, DHL, USPS, Regional; typeahead filtered
- **Ship Date cell:** Double-click opens date picker; defaults to today
- **Row click:** Opens DetailSlideover at peek width (280px) for that fulfillment record
- **DetailSlideover expand/collapse:** Drag handle to resize 280px ↔ 420px ↔ 60%; click expand icon toggles standard/wide
- **DetailTabBar tabs:** Click switches detail panel content (Details, Items, Tracking, History)
- **Status dropdown (in detail):** Inline combobox, same as grid editor
- **FilterToolbar dropdowns:** Click opens popover menu; Date range opens dual date picker; Keyword opens inline text input
- **Filter pills (✕):** Click removes that filter; grid re-filters on removal
- **+ Add filter:** Opens filter builder popover with field + operator + value
- **Sort dropdown:** Opens multi-column sort builder popover (Add sort, field, direction, remove)
- **Export dropdown:** CSV, Excel, PDF options; triggers download
- **GridSummaryStrip cards:** Click filters view to that card's segment (e.g., click "Pending 142" sets tab to Pending)
- **BulkActionBar buttons:** Mark Shipped (batch status update), Print Labels (opens print dialog), Assign Carrier (dropdown picker), More ▾ (additional bulk actions)
- **Pagination controls:** Previous/Next page, direct page input, page size selector (25/50/100/All)
- **[+ New Shipment] button:** Navigates to new shipment form or opens inline creator modal
- **Column header click:** Sorts ascending; second click toggles descending; third click removes sort
- **Column resize:** Drag right edge of column header to resize

### States Shown

- **Empty state:** When no fulfillments match filters: centered illustration "No shipments found" with "Clear filters" link and [+ New Shipment] button
- **Loading state:** Grid shows 8 skeleton rows (32px each, shimmer animation); summary strip shows skeleton cards; tabs show skeleton badge counts
- **Error state:** Inline error banner above grid: "Failed to load shipments. [Retry]" with error details in collapsible section
- **Filter active:** ActiveFilterPills row visible with remove buttons; menubar filter buttons show active indicator (dot/underline)
- **No filters:** ActiveFilterPills row hidden; menubar filters show default state
- **Row selected:** Row background highlight; checkbox checked; BulkActionBar animates up from bottom
- **Row editing:** Status/Carrier cell shows combobox dropdown overlaying grid; other rows dim slightly
- **Row saving:** Cell shows spinner after commit until server confirms; row temporarily non-interactive
- **Row save failed:** Cell border flashes red; inline toast "Failed to update. [Retry] [Undo]" appears
- **Bulk action in progress:** BulkActionBar shows progress indicator "Updating 3 shipments…"; buttons disabled
- **Bulk action complete:** Toast "3 shipments marked as Shipped"; selections cleared; BulkActionBar hides
- **Bulk action failed:** Toast "Failed to update 2 of 3 shipments. [Retry] [View details]"
- **DetailSlideover open:** Grid viewport narrows by slideover width; row highlight persists; keyboard focus trapped in slideover
- **DetailSlideover loading:** Tab content area shows skeleton; tab labels visible immediately
- **DetailSlideover empty tab:** "No items recorded" or "No tracking events" with contextual help text
- **Resize grid-column:** Cursor becomes col-resize; ghost line shows proposed position; snap to 48px minimum
- **Export in progress:** Export button shows spinner; dropdown disabled; toast "Preparing export…" (large datasets)
- **Export complete:** Browser download starts; toast "Export ready — 2,277 rows"

### ARIA Annotations

- **View container:** `role="region" aria-label="Fulfillment view"`
- **View header:** `role="banner"`
- **FilterToolbar:** `role="menubar" aria-label="Filter and view options"`
- **FilterToolbar items:** `role="menuitem" aria-haspopup="true"` for dropdown triggers
- **ActiveFilterPills:** `role="list" aria-label="Active filters"`
- **Filter pill:** `role="listitem"`; remove button: `aria-label="Remove Status: Pending filter"`
- **+ Add filter:** `role="button" aria-label="Add filter"`
- **GridSummaryStrip:** `role="region" aria-label="Fulfillment summary"`
- **Summary card:** `role="button" aria-label="Pending: 142 shipments, $842.3k value — click to filter" tabindex="0"`
- **ViewTabBar:** `role="tablist" aria-label="Fulfillment status tabs"`
- **Tab:** `role="tab" aria-selected="true|false" aria-label="All — 2,277 shipments"`
- **AG Grid:** `role="grid" aria-label="Fulfillment records" aria-multiselectable="true" aria-rowcount="2277"`
- **Grid header row:** `role="row" aria-rowindex="1"`
- **Column header:** `role="columnheader" aria-sort="none|ascending|descending" aria-label="ID — click to sort"`
- **Grid data row:** `role="row" aria-rowindex="N" aria-selected="false|true"`
- **Checkbox cell:** `role="gridcell" aria-colindex="1"`; checkbox: `role="checkbox" aria-label="Select FUL-1042"`
- **Status cell (editable):** `role="gridcell" aria-colindex="6" aria-readonly="false"`; combobox: `role="combobox" aria-expanded="false" aria-label="Status for FUL-1042"`
- **Status cell (display):** `role="gridcell" aria-colindex="6" aria-readonly="true"`
- **BulkActionBar:** `role="toolbar" aria-label="Bulk actions — 3 selected" aria-live="polite"`
- **BulkActionBar buttons:** `role="button" aria-label="Mark 3 shipments as Shipped"`
- **Pagination:** `role="navigation" aria-label="Grid pagination"`; buttons: `aria-label="Page 2" aria-current="page|false"`
- **DetailSlideover:** `role="dialog" aria-label="Fulfillment FUL-1042 details" aria-modal="true"`
- **Slideover close button:** `aria-label="Close details"`
- **Slideover expand button:** `aria-label="Expand to 420px"` or `aria-label="Expand to 60%"`
- **DetailTabBar:** `role="tablist" aria-label="Fulfillment detail sections"`
- **Toast notifications:** `role="alert" aria-live="assertive"`
- **Loading state:** `aria-busy="true"` on grid region
- **Error banner:** `role="alert"`

### Edge Cases Handled

- **No fulfillments at all:** Full-page empty state: illustration + "No shipments yet — create your first shipment to start tracking" + [New Shipment] button; summary strip hidden; tab bar hidden; BulkActionBar hidden
- **All fulfillments delivered:** Normal view; summary strip shows 0 pending / 0 in transit; Pending/In Transit tabs still shown with count 0; Delivered tab selected by default
- **Single fulfillment:** Grid shows 1 row; pagination hidden; summary strip single-row context still valid; BulkActionBar still works for single selection
- **Very long customer name (>40 chars):** Grid cell truncates with ellipsis; full name in tooltip on hover; full name shown in DetailSlideover
- **Missing carrier:** Grid shows "—" dash; Carrier filter still lists all carriers including "(No carrier)" option
- **Missing ship date:** Grid shows "—"; sort treats null as epoch (or configurable: first/last); date filter skips null rows
- **Duplicate tracking number:** Grid shows warning icon ⚠ next to tracking number; tooltip "Duplicate tracking number detected — FUL-1032"; not blocked, advisory only
- **Very large dataset (>10k rows):** Virtual scrolling active; summary strip uses pre-computed aggregations (not live grid count); export warns "Large export — 50,000+ rows may take a moment"; pagination caps at page 500 with "…" indicator
- **Rapid filter changes:** Debounced 300ms; previous in-flight request cancelled; loading indicator only after 200ms delay (avoids flicker)
- **Browser back from detail:** Browser back button closes DetailSlideover; restores previous grid scroll position and filter state
- **Concurrent edit conflict:** If another user changes status while editing: on save, toast "This shipment was updated by [User]. [Refresh] [Keep my changes]"
- **Offline:** Grid shows last cached data; banner "You're offline — changes will sync when reconnected"; edits queued locally; status indicator in header
- **Print labels (bulk):** If >50 selected, confirm dialog "Print 142 labels? This may take a moment."; print preview in new tab
- **Keyboard navigation:** Full grid keyboard support: Arrow keys navigate cells; Space toggles checkbox; Enter opens detail; F2 or Double-click activates cell editor; Tab moves between toolbar/grid/detail; Escape closes detail/editor/modal; Ctrl+A selects all filtered rows; Ctrl+Shift+A deselects all
- **Screen reader grid navigation:** Announce row count on filter change "2,034 shipments matching filters"; announce selection "3 shipments selected, $124.7k total"; announce sort "Sorted by Ship Date, newest first"
