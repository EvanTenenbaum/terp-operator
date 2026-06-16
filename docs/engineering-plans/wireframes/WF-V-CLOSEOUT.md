## Wireframe: WF-V-CLOSEOUT — CloseoutView

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Closeout                                                          [+ New Close│
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [Data views ▾] │ [Period ▾] │ [Keyword…] │ [Total ▾] │ [Entity ▾]       │ │
│ │ [Sort ▾] │ [Export ▾]                                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: In Review ✕] [Period: May 2026 ✕] [+ Add filter]                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ GridSummaryStrip ───────────────────────────────────────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│ │ │   Open   │ │In Review │ │  Closed  │ │ Variance │ │  Total   │        │ │
│ │ │    12    │ │     5    │ │    47    │ │  $12.4k  │ │    64    │        │ │
│ │ │ $2.3M    │ │ $892k    │ │ $11.8M   │ │          │ │  $15.0M  │        │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ViewTabBar ─────────────────────────────────────────────────────────────┐ │
│ │ [All 64] [Open 12] [In Review 5] [Closed 47]                             │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Period     │ Entity    │ Status  │ Total      │ Actions   │ │
│ │───┼──────────┼────────────┼───────────┼─────────┼────────────┼───────────│ │
│ │ ☐ │ CLO-0064 │ May 2026   │ AP        │In Review│ $892,450   │ [▸]       │ │
│ │ ☐ │ CLO-0063 │ May 2026   │ AR        │In Review│ $1,234,100 │ [▸]       │ │
│ │ ☐ │ CLO-0062 │ May 2026   │ Inventory │  Open   │ $3,456,200 │ [▸]       │ │
│ │ ☐ │ CLO-0061 │ Apr 2026   │ AP        │ Closed  │ $789,300   │ [▸]       │ │
│ │ ☐ │ CLO-0060 │ Apr 2026   │ AR        │ Closed  │ $1,102,500 │ [▸]       │ │
│ │ ☐ │ CLO-0059 │ Apr 2026   │ Inventory │ Closed  │ $3,210,800 │ [▸]       │ │
│ │ ☐ │ CLO-0058 │ Apr 2026   │ Banking   │ Closed  │ $2,450,000 │ [▸]       │ │
│ │ ☐ │ CLO-0057 │ Mar 2026   │ AP        │ Closed  │ $765,000   │ [▸]       │ │
│ │───┼──────────┴────────────┴───────────┴─────────┴────────────┴───────────│ │
│ │                      Page 1 of 8   [◀ ◀ 1 2 3 … 8 ▶ ▶]                   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (hidden until ≥1 row selected) ───────────────────────────┐ │
│ │ 2 selected • $890.4k  [Start Review] [Close Period] [Export ▾] [More ▾]  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ DetailSlideover (right, peek 280px) ────────────────────────────────────┐ │
│ │ CLO-0064 — May 2026 AP                                          [✕] [↗]   │ │
│ │ ┌─ DetailTabBar ───────────────────────────────────────────────────┐     │ │
│ │ │ [Summary] [Transactions] [Adjustments] [History]                  │     │ │
│ │ └───────────────────────────────────────────────────────────────────┘     │ │
│ │ Status: [In Review ▾]   Period: May 2026                                    │ │
│ │ Entity: Accounts Payable  Total: $892,450.00                                │ │
│ │ Opened: 06/01/26          Reviewer: Jane Smith                              │ │
│ │ ────────────────────────────────────────────────────────────────────────── │ │
│ │ ┌─ Period Summary ──────────────────────────────────────────────────┐     │ │
│ │ │ Opening Balance: $812,300     Inflows: $445,200                      │     │ │
│ │ │ Outflows: $365,050            Closing Balance: $892,450               │     │ │
│ │ │ Variance: $0.00 ✓             Transactions: 1,247                     │     │ │
│ │ │ Adjustments: 3 pending        Flags: 0                               │     │ │
│ │ └─────────────────────────────────────────────────────────────────────┘     │ │
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
- **Status cell (ComboboxCellEditor):** Double-click opens combobox: Open, In Review, Closed, Reopened; typeahead filtered; Enter commits; Closed status has additional confirmation "Closing this period is permanent. Continue?"
- **Status display:** Open = info-blue; In Review = warning-yellow; Closed = success-green with lock icon; Reopened = purple
- **Period cell:** Click filters to that period; rendered as link
- **Entity cell:** Chip/tag: AP, AR, Inventory, Banking, Payroll, GL; filterable
- **Total cell:** Right-aligned currency; clickable to expand breakdown
- **Actions cell:** [▸] button opens quick actions menu: View, Start Review, Close, Reopen, Export
- **Row click:** Opens DetailSlideover at peek (280px)
- **DetailSlideover expand/collapse:** Drag resize 280px ↔ 420px ↔ 60%; click expand icon toggles
- **DetailTabBar tabs:** Click switches (Summary, Transactions, Adjustments, History)
- **Summary tab:** Period summary with opening/closing balances, inflows/outflows, variance, transaction count, adjustment count, flags; summary cards layout
- **Transactions tab:** Filtered list of all transactions in period; mini-grid with type, date, amount, reference; click navigates to source transaction
- **Adjustments tab:** List of adjustments with type (Accrual, Deferral, Correction), amount, status (Pending, Applied), date; [New Adjustment] button; each adjustment expandable for detail
- **History tab:** Audit trail of status changes, review actions, adjustments applied; timestamp + user + action
- **Status dropdown (in detail):** Inline combobox with additional confirmation for Close
- **FilterToolbar:** Period dropdown (month/year picker or list); Entity dropdown (AP, AR, Inventory, Banking, Payroll, GL); Total range filter; Keyword searches ID
- **Filter pills (✕):** Click removes filter
- **+ Add filter:** Filter builder popover
- **Sort dropdown:** Multi-column sort builder
- **Export dropdown:** CSV, Excel, PDF; Closeout-specific: "Export Close Package" (bundled PDF with summary + transactions + adjustments)
- **GridSummaryStrip cards:** Click filters to segment; Variance card clickable to show only closeouts with non-zero variance
- **BulkActionBar buttons:** Start Review (batch status change), Close Period (batch close with confirmation and optional close notes), Export (export selected), More ▾ (Reopen, Add Adjustment, Assign Reviewer)
- **Pagination:** Standard controls
- **[+ New Close] button:** Opens period close creation: select period (month/year), select entity (AP/AR/Inventory/etc.), auto-calculates balances from transactions; [Create] [Create & Review] [Cancel]
- **Column header click:** Sort; column resize via drag
- **Review workflow:** Start Review → Review transactions → Apply adjustments → Close; progress tracked in status

### States Shown

- **Empty state:** "No closeout periods found" + "Clear filters" or "No periods closed yet — start your first month-end close" + [+ New Close]
- **Loading state:** 8 skeleton rows; skeleton summary cards; skeleton tabs
- **Error state:** Banner "Failed to load closeout periods. [Retry]"
- **Filter active:** ActiveFilterPills visible; menubar indicators
- **No filters:** ActiveFilterPills hidden
- **Row selected:** Highlight + checkbox; BulkActionBar slides up
- **Open closeout:** Info-blue status; editable; can start review
- **In Review closeout:** Warning-yellow; reviewer name visible; adjustments can be added; transactions locked
- **Closed closeout:** Green with lock; all fields read-only; no adjustments; transactions locked
- **Reopened closeout:** Purple; previously closed now editable; audit trail shows reopen reason
- **Variance non-zero:** Total cell shows variance amount in parentheses; variance summary card highlighted; adjustments tab shows pending items
- **Period with flags:** Row shows flag icon ⚑ count; detail Summary shows flags list "3 transactions flagged for review"
- **Review in progress by another user:** Row shows "Reviewing — Jane Smith" with user avatar; non-editable except by reviewer
- **Row editing:** Combobox for status; confirmation for close
- **Row saving:** Spinner; non-interactive
- **Row save failed:** Red flash; toast with retry
- **Bulk close:** Confirmation modal: "Close 3 periods? This action is permanent and will lock all transactions. [Close Notes…] [Cancel] [Close Periods]"
- **Bulk action in progress:** "Starting review on 2 periods…"; buttons disabled
- **Bulk action complete:** Toast; refresh
- **DetailSlideover open:** Grid narrows; keyboard trapped
- **Detail Transactions loading:** Mini-grid with skeleton rows; filters inside transactions tab
- **Detail Adjustments empty:** "No adjustments for this period" + [New Adjustment] button
- **New Close form:** Modal: period selector (shows only unclosed periods), entity selector (multi-select or single), auto-balance calculation with preview; [Create] [Cancel]
- **New Adjustment form:** Sub-form in Adjustments tab: type dropdown, amount input, date picker, description textarea, reference field; [Apply] [Cancel]
- **Close package export:** "Preparing close package for May 2026 AP…" spinner; downloads ZIP with summary PDF + CSV transactions + adjustments log
- **Offline:** Banner; cached data; queued actions
- **Keyboard:** Arrow keys; F2 edit status; Enter detail; Tab cycle; Escape close

### ARIA Annotations

- **View container:** `role="region" aria-label="Closeout view"`
- **View header:** `role="banner"`
- **FilterToolbar:** `role="menubar" aria-label="Filter and view options"`
- **FilterToolbar items:** `role="menuitem" aria-haspopup="true"`
- **ActiveFilterPills:** `role="list" aria-label="Active filters"`
- **Filter pill:** `role="listitem"`; remove: `aria-label="Remove Period: May 2026 filter"`
- **+ Add filter:** `role="button" aria-label="Add filter"`
- **GridSummaryStrip:** `role="region" aria-label="Closeout summary"`
- **Summary card:** `role="button" aria-label="Open: 12 periods, $2.3M — click to filter" tabindex="0"`
- **ViewTabBar:** `role="tablist" aria-label="Closeout status tabs"`
- **Tab:** `role="tab" aria-selected="true|false" aria-label="In Review — 5 periods"`
- **AG Grid:** `role="grid" aria-label="Closeout period records" aria-multiselectable="true" aria-rowcount="64"`
- **Grid header row:** `role="row" aria-rowindex="1"`
- **Column header:** `role="columnheader" aria-sort="none|ascending|descending" aria-label="Total — click to sort"`
- **Grid data row:** `role="row" aria-rowindex="N" aria-selected="false|true"`
- **Checkbox cell:** `role="gridcell" aria-colindex="1"`; checkbox: `role="checkbox" aria-label="Select CLO-0064"`
- **Status cell (editable):** `role="gridcell" aria-colindex="5" aria-readonly="false"`; combobox: `role="combobox" aria-expanded="false" aria-label="Status for CLO-0064"`
- **Locked row (Closed):** `aria-readonly="true"` on all cells; `aria-label="CLO-0061 — Closed — read only"`
- **BulkActionBar:** `role="toolbar" aria-label="Bulk actions — 2 selected" aria-live="polite"`
- **Pagination:** `role="navigation" aria-label="Grid pagination"`
- **DetailSlideover:** `role="dialog" aria-label="Closeout CLO-0064 details" aria-modal="true"`
- **Slideover close:** `aria-label="Close details"`
- **Slideover expand:** `aria-label="Expand to 420px"`
- **DetailTabBar:** `role="tablist" aria-label="Closeout detail sections"`
- **Summary balances:** `role="region" aria-label="Period balance summary"`
- **Flags indicator:** `aria-label="3 transactions flagged for review"`
- **Close confirmation dialog:** `role="alertdialog" aria-label="Close period — permanent action" aria-modal="true"`
- **New Adjustment form:** `role="form" aria-label="Create adjustment for CLO-0064"`
- **Toast:** `role="alert" aria-live="assertive"`
- **Close package export progress:** `role="progressbar" aria-label="Preparing close package"`

### Edge Cases Handled

- **No closeouts at all:** Full-page empty; CTA to start first month-end close; summary/tabs hidden
- **All periods closed:** Normal view; Open/In Review with count 0; Closed tab selected; all rows locked
- **Period with zero transactions:** Total $0.00; Summary shows all zeros; variance $0.00 ✓; closeable normally
- **Period spanning multiple entities:** Grid shows one row per entity-period combination; detail Entity field is single value
- **Negative total (net outflow period):** Total displayed in parentheses; summary inflows < outflows; variance calculation still works
- **Reopening a closed period:** Confirmation "Reopening May 2026 AP will unlock all transactions. Adjustments made after close may be required. [Reason for reopening…] [Cancel] [Reopen]"; reopen creates audit trail entry; status changes to Reopened
- **Closing with unresolved adjustments:** Warning "3 adjustments are still pending. Close anyway? [Review adjustments] [Close anyway] [Cancel]"
- **Closing with non-zero variance:** Warning "Period has $12,400 variance. Close anyway? [Review variance] [Force close] [Cancel]"; variance can be forced closed with note
- **Concurrent close:** If another user closes while reviewing, toast "Period was closed by [User]. Refreshing."; page refreshes
- **Reviewer assignment:** Detail shows current reviewer; [Assign Reviewer] action available; bulk assign available
- **Transaction from closed period:** Source transaction detail view shows "Period closed — read only" banner; edit disabled
- **Adjustment dependencies:** If Adjustment A offsets Adjustment B, both must be applied together; validation on close
- **Month-end workload:** If many periods open for same month, summary card "Month-end status: 4 of 5 entities closed, AP still in review"
- **Historical close data:** Filters by period allow historical lookback; no restriction on past period viewing
- **Large dataset (many historical periods):** Virtual scrolling; pre-computed summary; period filter groups by year
- **Rapid filter changes:** 300ms debounce
- **Browser back:** Closes slideover; restores state
- **Keyboard:** Full grid keyboard; F2 edit; Enter detail; Tab cycle; Escape close
- **Screen reader:** "5 periods in review totaling $892k" on filter; "CLO-0064 — May 2026 AP — In Review — $892,450"
