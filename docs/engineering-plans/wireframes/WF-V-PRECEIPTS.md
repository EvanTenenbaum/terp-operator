## Wireframe: WF-V-PRECEIPTS — PurchaseReceiptsView

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Purchase Receipts                                               [+ New Receipt]│
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [Data views ▾] │ [Date range ▾] │ [Keyword…] │ [Amount ▾] │ [Group ▾]   │ │
│ │ [Sort ▾] │ [Export ▾]                                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Pending ✕] [Vendor: US Foods ✕] [+ Add filter]                  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ GridSummaryStrip ───────────────────────────────────────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│ │ │ Pending  │ │ Received │ │ Verified │ │ Discrep. │ │  Total   │        │ │
│ │ │    47    │ │   312    │ │   289    │ │    12    │ │   660    │        │ │
│ │ │ $341.2k  │ │ $2.1M    │ │ $1.9M    │ │ $82.4k   │ │ $4.5M    │        │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ViewTabBar ─────────────────────────────────────────────────────────────┐ │
│ │ [All 660] [Pending 47] [Received 312] [Verified 289]                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ PO#      │ Vendor       │ Received   │ Qty │ Status      │ │
│ │───┼──────────┼──────────┼──────────────┼────────────┼─────┼─────────────│ │
│ │ ☐ │ REC-0660 │ PO-3451  │ US Foods     │ 06/14/26   │ 240 │ Pending     │ │
│ │ ☐ │ REC-0659 │ PO-3448  │ Sysco Corp   │ 06/14/26   │ 180 │ Received    │ │
│ │ ☐ │ REC-0658 │ PO-3445  │ FreshPoint   │ 06/13/26   │ 500 │ Verified    │ │
│ │ ☐ │ REC-0657 │ PO-3442  │ Shamrock     │ 06/13/26   │ 320 │ Received    │ │
│ │ ☐ │ REC-0656 │ PO-3440  │ US Foods     │ 06/12/26   │ 150 │ Discrepancy │ │
│ │ ☐ │ REC-0655 │ PO-3438  │ Gordon Food  │ 06/12/26   │ 410 │ Verified    │ │
│ │ ☐ │ REC-0654 │ PO-3435  │ FreshPoint   │ 06/11/26   │ 280 │ Received    │ │
│ │ ☐ │ REC-0653 │ PO-3431  │ Sysco Corp   │ 06/11/26   │ 195 │ Verified    │ │
│ │───┼──────────┴──────────┴──────────────┴────────────┴─────┴─────────────│ │
│ │                      Page 1 of 83   [◀ ◀ 1 2 3 … 83 ▶ ▶]                 │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (hidden until ≥1 row selected) ───────────────────────────┐ │
│ │ 3 selected • 770 units  [Mark Received] [Verify] [Link PO ▾] [More ▾]    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ DetailSlideover (right, peek 280px) ────────────────────────────────────┐ │
│ │ REC-0660 — PO-3451 (US Foods)                                   [✕] [↗]   │ │
│ │ ┌─ DetailTabBar ───────────────────────────────────────────────────┐     │ │
│ │ │ [Items] [PO Link] [History]                                       │     │ │
│ │ └───────────────────────────────────────────────────────────────────┘     │ │
│ │ Status: [Pending ▾]     Received Date: 06/14/26                             │ │
│ │ PO#: PO-3451            Vendor: US Foods                                    │ │
│ │ Expected Qty: 250       Received Qty: 240                                    │ │
│ │ Variance: -10 units (4%)                                                     │ │
│ │ ────────────────────────────────────────────────────────────────────────── │ │
│ │ ┌─ Line Items ───────────────────────────────────────────────────────┐    │ │
│ │ │ SKU         │ Desc           │ PO Qty │ Recv Qty │ Variance        │    │ │
│ │ │───────────────────────────────────────────────────────────────────│    │ │
│ │ │ FRZ-BR-001  │ Broccoli Floret│ 100    │ 100      │ ✓               │    │ │
│ │ │ FRZ-SP-003  │ Spinach Chopped│  80    │  72      │ -8 (shortage)   │    │ │
│ │ │ CAN-TM-012  │ Diced Tomatoes │  70    │  68      │ -2 (shortage)   │    │ │
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

- **Checkbox (per row):** Click toggles row selection; header checkbox selects/deselects all visible
- **Status cell (ComboboxCellEditor):** Double-click opens combobox: Pending, Received, Verified, Discrepancy, Cancelled; typeahead filtered; Enter commits
- **Status display:** Pending = neutral-gray; Received = info-blue; Verified = success-green; Discrepancy = warning-yellow with icon
- **PO# cell:** Click navigates to related Purchase Order; rendered as link
- **Vendor cell:** Click navigates to vendor detail; rendered as link
- **Qty cell:** Display-only; right-aligned; discrepancy rows show variance indicator
- **Received Date cell:** Double-click opens date picker
- **Row click:** Opens DetailSlideover at peek (280px)
- **DetailSlideover expand/collapse:** Drag resize 280px ↔ 420px ↔ 60%; click expand icon toggles
- **DetailTabBar tabs:** Click switches (Items, PO Link, History)
- **Items tab:** Table of line items with SKU, description, PO qty, received qty, variance; variances highlighted (red = shortage, green = overage, checkmark = exact)
- **PO Link tab:** Summary of linked purchase order with PO status, expected totals, receipt totals, reconciliation; [View Full PO] link
- **Status dropdown (in detail):** Inline combobox, same as grid editor
- **FilterToolbar:** Date range for received date; Amount for qty range; Keyword searches PO# + vendor + SKU
- **Filter pills (✕):** Click removes filter; grid re-filters
- **+ Add filter:** Filter builder popover
- **Sort dropdown:** Multi-column sort builder
- **Export dropdown:** CSV, Excel, PDF
- **GridSummaryStrip cards:** Click filters to that card's segment
- **BulkActionBar buttons:** Mark Received (batch status), Verify (batch verification), Link PO (associate receipts to POs), More ▾ (Export selected, Add note, Flag discrepancy)
- **Pagination:** Standard controls
- **[+ New Receipt] button:** Opens receipt entry form: select PO, enter received quantities per line item, received date, notes; auto-calculates variances
- **Column header click:** Sort; column resize via drag

### States Shown

- **Empty state:** "No purchase receipts found" + "Clear filters" or "Create your first receipt" + [+ New Receipt]
- **Loading state:** 8 skeleton rows; skeleton summary cards; skeleton tabs
- **Error state:** Banner "Failed to load receipts. [Retry]"
- **Filter active:** ActiveFilterPills visible; menubar indicators
- **No filters:** ActiveFilterPills hidden
- **Row selected:** Highlight + checkbox; BulkActionBar slides up
- **Discrepancy row:** Status pill warning-yellow; Qty cell shows variance in parentheses; row has subtle warning background; detail Items tab shows per-item variances
- **Pending receipt:** Neutral status; clickable to mark received
- **Verified receipt:** Green status; locked editing except for notes
- **Row editing:** Combobox dropdown for status; date picker for received date
- **Row saving:** Spinner; non-interactive
- **Row save failed:** Red flash; toast with retry
- **Bulk action in progress:** "Verifying 3 receipts…"; buttons disabled; progress on large batches
- **Bulk action complete:** Toast "3 receipts verified"; refresh
- **Partial receipt (some items received):** Status Pending; Qty shows partial count; detail Items tab shows mixed status per line item
- **Over-receipt (more received than ordered):** Discrepancy status; positive variance highlighted orange; detail notes "Over-receipt requires approval"
- **DetailSlideover open:** Grid narrows; keyboard trapped
- **Detail Items with line-level discrepancy:** Variances per line item; ability to mark individual lines as verified/disputed
- **New Receipt form:** Modal or inline form; PO selector (search by PO# / vendor); auto-populates line items from PO; editable received quantities; [Save] [Save & New] [Cancel]
- **Offline:** Banner; cached data; queued actions
- **Keyboard:** Arrow keys grid navigation; F2 edit status; Enter detail; Tab cycle; Escape close

### ARIA Annotations

- **View container:** `role="region" aria-label="Purchase Receipts view"`
- **View header:** `role="banner"`
- **FilterToolbar:** `role="menubar" aria-label="Filter and view options"`
- **FilterToolbar items:** `role="menuitem" aria-haspopup="true"`
- **ActiveFilterPills:** `role="list" aria-label="Active filters"`
- **Filter pill:** `role="listitem"`; remove: `aria-label="Remove Status: Pending filter"`
- **+ Add filter:** `role="button" aria-label="Add filter"`
- **GridSummaryStrip:** `role="region" aria-label="Receipts summary"`
- **Summary card:** `role="button" aria-label="Discrepancy: 12 receipts, $82.4k — click to filter" tabindex="0"`
- **ViewTabBar:** `role="tablist" aria-label="Receipt status tabs"`
- **Tab:** `role="tab" aria-selected="true|false" aria-label="Pending — 47 receipts"`
- **AG Grid:** `role="grid" aria-label="Purchase receipt records" aria-multiselectable="true" aria-rowcount="660"`
- **Grid header row:** `role="row" aria-rowindex="1"`
- **Column header:** `role="columnheader" aria-sort="none|ascending|descending" aria-label="Qty — click to sort"`
- **Grid data row:** `role="row" aria-rowindex="N" aria-selected="false|true"`
- **Checkbox cell:** `role="gridcell" aria-colindex="1"`; checkbox: `role="checkbox" aria-label="Select REC-0660"`
- **Status cell (editable):** `role="gridcell" aria-colindex="7" aria-readonly="false"`; combobox: `role="combobox" aria-expanded="false" aria-label="Status for REC-0660"`
- **Variance row:** `aria-label="REC-0656 — Discrepancy — 150 units received"` via row-level
- **BulkActionBar:** `role="toolbar" aria-label="Bulk actions — 3 selected" aria-live="polite"`
- **Pagination:** `role="navigation" aria-label="Grid pagination"`
- **DetailSlideover:** `role="dialog" aria-label="Receipt REC-0660 details" aria-modal="true"`
- **Slideover close:** `aria-label="Close details"`
- **Slideover expand:** `aria-label="Expand to 420px"`
- **DetailTabBar:** `role="tablist" aria-label="Receipt detail sections"`
- **Line items table:** `role="table" aria-label="Line items for REC-0660"`
- **Variance cell:** `aria-label="Broccoli Floret — exact match"` or `aria-label="Spinach Chopped — shortage of 8 units"`
- **Toast:** `role="alert" aria-live="assertive"`
- **New Receipt form:** `role="dialog" aria-label="Create new receipt" aria-modal="true"`

### Edge Cases Handled

- **No receipts at all:** Full-page empty; summary/tabs hidden; direct CTA to [+ New Receipt]
- **All receipts verified:** Normal view; Pending/Received tabs shown with count 0; Verified tab selected; all summary cards show numbers
- **Zero-quantity receipt:** Qty shows 0; Detail Items tab shows all items with 0 received; discrepancy flag
- **Partial line item receipt (e.g., 50 of 100 received):** Line item shows "50/100" in both columns; Status "Partial"; ability to add additional receipt against same PO line
- **Multiple receipts for same PO:** Detail PO Link tab lists all receipts against this PO; reconciliation table: PO total vs sum of all receipts
- **Backdated receipt:** Received Date before PO date triggers soft warning "Receipt date precedes PO date" — advisory only; does not block save
- **Overage approval threshold:** If received qty exceeds PO qty by >10% (configurable), status shows "Over-receipt" with approval required; workflow triggers
- **Damaged goods receipt:** Line item can be marked "Damaged" with qty; separate from shortage; detail shows damaged qty with reason field
- **Unlinked PO (receipt without PO):** PO# cell shows "—"; [Link PO] action available in detail; PO Link tab shows "No PO linked — [Link to PO]"
- **Zero-value PO (samples/free goods):** Amount shown as $0.00; discrepancy logic based on qty only, not value
- **Concurrent verification:** Conflict detection if two users try to verify same receipt; second user gets toast "This receipt was already verified"
- **Large dataset:** Virtual scrolling; pre-computed summary
- **Rapid filter changes:** 300ms debounce; request cancellation
- **Browser back:** Closes slideover; restores state
- **Keyboard:** Full grid keyboard; F2 edit; Enter detail; Tab cycle; Escape close
- **Screen reader:** "47 pending receipts, 12 with discrepancies" on summary; "Sorted by received date, newest first"
