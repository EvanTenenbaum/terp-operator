## Wireframe: WF-V-RECOVERY — RecoveryView

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Recovery                                                       [+ New Recovery]│
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [Data views ▾] │ [Date range ▾] │ [Keyword…] │ [Amount ▾] │ [Group ▾]   │ │
│ │ [Sort ▾] │ [Export ▾]                                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: In Progress ✕] [Type: Overcharge ✕] [+ Add filter]              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ GridSummaryStrip ───────────────────────────────────────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│ │ │   Open   │ │In Progrs│ │Recovered │ │Unrecov.  │ │  Total   │        │ │
│ │ │    14    │ │    22    │ │    89    │ │     3    │ │   128    │        │ │
│ │ │ $94.3k   │ │ $187.2k  │ │ $641.5k  │ │ $18.2k   │ │ $941.2k  │        │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ViewTabBar ─────────────────────────────────────────────────────────────┐ │
│ │ [All 128] [Open 14] [In Progress 22] [Recovered 89]                      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Source         │ Type        │ Amount  │ Status     │Date│ │
│ │───┼──────────┼────────────────┼─────────────┼─────────┼────────────┼────│ │
│ │ ☐ │ RCV-0128 │ INV-90124      │ Overcharge  │ $4,720  │In Progress │6/12│ │
│ │ ☐ │ RCV-0127 │ PO-3442        │ Short Ship  │ $2,310  │In Progress │6/11│ │
│ │ ☐ │ RCV-0126 │ INV-90085      │ Duplicate   │ $8,150  │ Recovered  │6/10│ │
│ │ ☐ │ RCV-0125 │ PO-3431        │ Damaged     │ $1,200  │ Recovered  │6/09│ │
│ │ ☐ │ RCV-0124 │ INV-90064      │ Pricing Err │ $3,400  │   Open     │6/09│ │
│ │ ☐ │ RCV-0123 │ PO-3420        │ Overcharge  │ $5,900  │In Progress │6/08│ │
│ │ ☐ │ RCV-0122 │ INV-90042      │ Short Pay   │ $2,800  │Unrecoverbl │6/07│ │
│ │ ☐ │ RCV-0121 │ PO-3415        │ Warranty    │ $1,050  │ Recovered  │6/07│ │
│ │───┼──────────┴────────────────┴─────────────┴─────────┴────────────┴────│ │
│ │                      Page 1 of 16   [◀ ◀ 1 2 3 … 16 ▶ ▶]                 │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (hidden until ≥1 row selected) ───────────────────────────┐ │
│ │ 3 selected • $13,930  [Mark In Progress] [Recover] [Export ▾] [More ▾]   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ DetailSlideover (right, peek 280px) ────────────────────────────────────┐ │
│ │ RCV-0128 — INV-90124 (Overcharge)                               [✕] [↗]   │ │
│ │ ┌─ DetailTabBar ───────────────────────────────────────────────────┐     │ │
│ │ │ [Details] [Supporting Docs] [History]                             │     │ │
│ │ └───────────────────────────────────────────────────────────────────┘     │ │
│ │ Status: [In Progress ▾]  Type: Overcharge                                   │ │
│ │ Amount: $4,720.00            Source: INV-90124                               │ │
│ │ Opened: 06/12/26             Target Recovery: $4,720.00                      │ │
│ │ ────────────────────────────────────────────────────────────────────────── │ │
│ │ Description:                                                                 │ │
│ │ "System overcharged FRZ-BR-001 at $4.20/unit vs contracted $3.80/unit.      │ │
│ │  100 units affected. Vendor credit memo requested on 06/12/26."              │ │
│ │                                                                              │ │
│ │ ┌─ Recovery Progress ────────────────────────────────────────────────┐    │ │
│ │ │ [Submitted ▸] [In Progress ●] [Recovered ○]                          │    │ │
│ │ │ Credit memo expected by 06/19/26                                     │    │ │
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
- **Status cell (ComboboxCellEditor):** Double-click opens combobox: Open, In Progress, Recovered, Unrecoverable; typeahead filtered; Enter commits
- **Status display:** Open = info-blue; In Progress = warning-yellow with progress indicator; Recovered = success-green with checkmark; Unrecoverable = neutral-gray with cross icon
- **Type cell:** Display-only; chip/tag: Overcharge, Short Ship, Duplicate, Damaged, Pricing Error, Short Pay, Warranty, Quality, Other; filterable
- **Source cell:** Click navigates to source (invoice or PO); link style
- **Amount cell:** Right-aligned currency; recovery amount (target)
- **Date cell:** Short date format; sortable
- **Row click:** Opens DetailSlideover at peek (280px)
- **DetailSlideover expand/collapse:** Drag resize 280px ↔ 420px ↔ 60%; click expand icon toggles
- **DetailTabBar tabs:** Click switches (Details, Supporting Docs, History)
- **Details tab:** Full description, amount, source reference, recovery type, target amount, recovery progress timeline, expected recovery date, actual recovery amount
- **Supporting Docs tab:** Document list with upload capability; document types: Invoice copy, Contract, Email correspondence, Credit memo, Photo evidence, Other
- **History tab:** Audit trail of status changes, notes added, documents attached, communications logged
- **Recovery Progress indicator:** Visual stepper in detail: Submitted → In Progress → Recovered (current step highlighted, future steps dimmed); configurable steps
- **Status dropdown (in detail):** Inline combobox
- **Mark Recovered:** Opens recovery form: actual recovered amount (may differ from target), recovery date, method (Credit Memo, Refund, Offset, Write-off), notes; [Recover] [Cancel]
- **Mark Unrecoverable:** Opens form: reason for write-off, approval (if configured), write-off account; [Write Off] [Cancel]
- **FilterToolbar:** Type dropdown (all recovery types); Date range for opened date; Amount range; Keyword searches ID + source + description
- **Filter pills (✕):** Click removes filter
- **+ Add filter:** Filter builder popover
- **Sort dropdown:** Multi-column sort builder
- **Export dropdown:** CSV, Excel, PDF; "Recovery Report" export with summary metrics
- **GridSummaryStrip cards:** Click filters to segment; Unrecoverable card clickable to review write-offs
- **BulkActionBar buttons:** Mark In Progress (batch), Recover (batch with recovery form), Export, More ▾ (Mark Unrecoverable, Add Note, Assign, Link Source)
- **Pagination:** Standard controls
- **[+ New Recovery] button:** Opens recovery creation form: select source (invoice/PO search), type dropdown, amount, description, supporting docs upload; [Create] [Cancel]
- **Column header click:** Sort; column resize via drag

### States Shown

- **Empty state:** "No recovery cases found" + "Clear filters" or "No cost recovery cases — all transactions are clean" + [+ New Recovery]
- **Loading state:** 8 skeleton rows; skeleton summary cards; skeleton tabs
- **Error state:** Banner "Failed to load recovery cases. [Retry]"
- **Filter active:** ActiveFilterPills visible; menubar indicators
- **No filters:** ActiveFilterPills hidden
- **Row selected:** Highlight + checkbox; BulkActionBar slides up
- **Open recovery:** Info-blue; newly created; no progress yet; editable
- **In Progress recovery:** Warning-yellow; progress indicator shows current step; expected recovery date visible; actions: Recover, Add Note
- **Recovered recovery:** Green with checkmark; actual recovery amount may differ from target; difference shown in detail; read-only
- **Unrecoverable recovery:** Gray with cross; write-off reason required; approval note if applicable
- **Partial recovery (recovered less than target):** Status Recovered; detail shows "Recovered $3,200 of $4,720 target (67.8%)"; difference tracked as write-off or outstanding
- **Over-recovery (recovered more than target):** Status Recovered; detail highlights positive variance
- **Aging recovery (open >30 days):** Row highlighted; Date cell bold; detail shows "Open 45 days — may require escalation"
- **Row editing:** Combobox for status; date fields editable
- **Row saving:** Spinner; non-interactive
- **Row save failed:** Red flash; toast with retry
- **Bulk recover:** Recovery form modal: per-line recovery amounts, common recovery date, common method; [Recover All] [Per-item] [Cancel]
- **Bulk action in progress:** "Recovering 3 cases…"; buttons disabled
- **Bulk action complete:** Toast "3 recovery cases marked as Recovered"; refresh
- **DetailSlideover open:** Grid narrows; keyboard trapped
- **Detail Supporting Docs empty:** "No supporting documents uploaded" + [Upload Document] button
- **Document upload:** File picker; type selector; drag-and-drop zone; progress bar for large files; preview for images
- **New Recovery form:** Modal: source search/selector, type dropdown, amount input, description, file upload; [Create] [Create & Open] [Cancel]
- **Write-off approval flow:** If Unrecoverable requires approval: status changes to "Pending Write-off Approval"; approval notification sent; detail shows approval status; approver can Approve/Reject from detail or notification
- **Recovery report export:** Report with summary: total open/in progress/recovered/unrecoverable, recovery rate %, average days to recover, breakdown by type
- **Offline:** Banner; cached data; queued actions
- **Keyboard:** Arrow keys; F2 edit status; Enter detail; Tab cycle; Escape close

### ARIA Annotations

- **View container:** `role="region" aria-label="Cost Recovery view"`
- **View header:** `role="banner"`
- **FilterToolbar:** `role="menubar" aria-label="Filter and view options"`
- **FilterToolbar items:** `role="menuitem" aria-haspopup="true"`
- **ActiveFilterPills:** `role="list" aria-label="Active filters"`
- **Filter pill:** `role="listitem"`; remove: `aria-label="Remove Type: Overcharge filter"`
- **+ Add filter:** `role="button" aria-label="Add filter"`
- **GridSummaryStrip:** `role="region" aria-label="Recovery summary"`
- **Summary card:** `role="button" aria-label="In Progress: 22 cases, $187.2k — click to filter" tabindex="0"`
- **ViewTabBar:** `role="tablist" aria-label="Recovery status tabs"`
- **Tab:** `role="tab" aria-selected="true|false" aria-label="In Progress — 22 cases"`
- **AG Grid:** `role="grid" aria-label="Cost recovery records" aria-multiselectable="true" aria-rowcount="128"`
- **Grid header row:** `role="row" aria-rowindex="1"`
- **Column header:** `role="columnheader" aria-sort="none|ascending|descending" aria-label="Amount — click to sort"`
- **Grid data row:** `role="row" aria-rowindex="N" aria-selected="false|true"`
- **Checkbox cell:** `role="gridcell" aria-colindex="1"`; checkbox: `role="checkbox" aria-label="Select RCV-0128"`
- **Status cell (editable):** `role="gridcell" aria-colindex="6" aria-readonly="false"`; combobox: `role="combobox" aria-expanded="false" aria-label="Status for RCV-0128"`
- **Source cell:** `role="gridcell"`; link: `role="link" aria-label="View source INV-90124"`
- **Unrecoverable row:** `aria-label="RCV-0122 — Unrecoverable — $2,800 written off"`
- **BulkActionBar:** `role="toolbar" aria-label="Bulk actions — 3 selected" aria-live="polite"`
- **Pagination:** `role="navigation" aria-label="Grid pagination"`
- **DetailSlideover:** `role="dialog" aria-label="Recovery RCV-0128 details" aria-modal="true"`
- **Slideover close:** `aria-label="Close details"`
- **Slideover expand:** `aria-label="Expand to 420px"`
- **DetailTabBar:** `role="tablist" aria-label="Recovery detail sections"`
- **Recovery progress stepper:** `role="progressbar" aria-valuenow="2" aria-valuemin="0" aria-valuemax="3" aria-label="Step 2 of 3: In Progress"`
- **Supporting docs list:** `role="list" aria-label="Supporting documents for RCV-0128"`
- **Upload zone:** `role="button" aria-label="Upload supporting document — drag and drop or click to browse"`
- **Recover form:** `role="form" aria-label="Mark RCV-0128 as Recovered"`
- **Write-off form:** `role="form" aria-label="Write off RCV-0128"`
- **Toast:** `role="alert" aria-live="assertive"`
- **New Recovery form:** `role="dialog" aria-label="Create new recovery case" aria-modal="true"`

### Edge Cases Handled

- **No recovery cases at all:** Full-page empty; "No cost recovery cases — all transactions are clean" + [New Recovery]; summary/tabs hidden
- **All cases recovered:** Normal view; Open/In Progress with count 0; Recovered tab selected; summary shows 100% recovery rate
- **Recovery for zero amount:** Allowed for documentation/tracking purposes; amount $0.00 with "Non-monetary recovery" badge
- **Multiple recovery cases from same source:** Source link shows count "INV-90124 — 2 recovery cases"; detail lists related cases
- **Very large recovery amount:** Formatted appropriately; detail shows full precision
- **Recovery target vs actual mismatch:** Partial recovery tracked with remaining balance; over-recovery tracked as positive variance
- **Recovery without source:** Source cell shows "—"; detail allows free-text source description; [Link Source] action available
- **Write-off without approval (if approval is optional):** Write-off proceeds immediately; audit trail records
- **Write-off requiring approval:** Status changes to "Pending Write-off Approval"; approver notified; detail shows "Awaiting approval from [Approver]"
- **Write-off approved:** Status updates to Unrecoverable with approval note; audit trail records approver + timestamp
- **Write-off rejected:** Status reverts to previous; detail shows rejection reason; toast notification
- **Document upload failure:** Toast "Failed to upload. [Retry]"; queued locally
- **Document type validation:** File type filter per document type category; supported: PDF, JPG, PNG, XLSX, DOCX, EML; max 25MB per file
- **Concurrent status change:** Conflict detection; toast "Case was updated by [User]. [Refresh] [Keep changes]"
- **Bulk recover with mixed targets:** Recovery form shows per-row target amounts; actual recovered can be edited per row; total calculated
- **Recovery aging report:** "22 cases in progress, avg 14 days open — 3 cases overdue (>30 days)"
- **Large dataset:** Virtual scrolling; pre-computed summary
- **Rapid filter changes:** 300ms debounce
- **Browser back:** Closes slideover; restores state
- **Keyboard:** Arrow keys; F2 edit; Enter detail; Tab cycle; Escape close
- **Screen reader:** "22 cases in progress, $187.2k potential recovery" on filter; "RCV-0128 — In Progress — Step 2 of 3 — $4,720 overcharge on INV-90124"
