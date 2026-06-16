## Wireframe: WF-V-DISPUTES — InvoiceDisputesView

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Invoice Disputes                                                [+ New Dispute]│
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [Data views ▾] │ [Date range ▾] │ [Keyword…] │ [Amount ▾] │ [Group ▾]   │ │
│ │ [Sort ▾] │ [Export ▾]                                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Open ✕] [Reason: Pricing ✕] [+ Add filter]                      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ GridSummaryStrip ───────────────────────────────────────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│ │ │   Open   │ │ Resolved │ │Escalated │ │Avg. Days │ │  Total   │        │ │
│ │ │    28    │ │   134    │ │     6    │ │  Open    │ │   168    │        │ │
│ │ │ $187.3k  │ │ $742.1k  │ │  $54.2k  │ │  14.2d   │ │ $983.6k  │        │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ViewTabBar ─────────────────────────────────────────────────────────────┐ │
│ │ [All 168] [Open 28] [Resolved 134] [Escalated 6]                         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Invoice     │ Vendor      │ Amount  │ Reason   │ Status  │ │
│ │───┼──────────┼─────────────┼─────────────┼─────────┼──────────┼─────────│ │
│ │ ☐ │ DSP-0168 │ INV-90124   │ Sysco Corp  │ $4,720  │ Pricing  │  Open   │ │
│ │ ☐ │ DSP-0167 │ INV-90118   │ US Foods    │ $2,310  │ Shortage │  Open   │ │
│ │ ☐ │ DSP-0166 │ INV-90098   │ Shamrock    │ $8,150  │ Quality  │Escalated│ │
│ │ ☐ │ DSP-0165 │ INV-90085   │ Sysco Corp  │ $1,200  │ Pricing  │Resolved │ │
│ │ ☐ │ DSP-0164 │ INV-90072   │ US Foods    │ $3,400  │ Duplicate│Resolved │ │
│ │ ☐ │ DSP-0163 │ INV-90064   │ Gordon Food │ $5,900  │ Shortage │  Open   │ │
│ │ ☐ │ DSP-0162 │ INV-90051   │ FreshPoint  │ $2,800  │ Damaged  │Resolved │ │
│ │ ☐ │ DSP-0161 │ INV-90042   │ Shamrock    │ $1,050  │ Pricing  │Resolved │ │
│ │───┼──────────┴─────────────┴─────────────┴─────────┴──────────┴─────────│ │
│ │                      Page 1 of 21   [◀ ◀ 1 2 3 … 21 ▶ ▶]                 │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (hidden until ≥1 row selected) ───────────────────────────┐ │
│ │ 3 selected • $13,930  [Resolve] [Escalate] [Add Note] [More ▾]           │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ DetailSlideover (right, peek 280px) ────────────────────────────────────┐ │
│ │ DSP-0168 — INV-90124 (Sysco Corp)                               [✕] [↗]   │ │
│ │ ┌─ DetailTabBar ───────────────────────────────────────────────────┐     │ │
│ │ │ [Details] [Resolution] [History]                                  │     │ │
│ │ └───────────────────────────────────────────────────────────────────┘     │ │
│ │ Status: [Open ▾]        Reason: Pricing                                     │ │
│ │ Disputed Amount: $4,720.00  Original: $5,210.00 (9.4% difference)           │ │
│ │ Invoice: INV-90124            Vendor: Sysco Corp                             │ │
│ │ Opened: 06/10/26              Age: 5 days                                    │ │
│ │ ────────────────────────────────────────────────────────────────────────── │ │
│ │ Dispute Detail:                                                              │ │
│ │ "Invoice line item FRZ-BR-001 billed at $4.20/unit; contracted rate         │ │
│ │  is $3.80/unit for Q2 2026. 100 units affected — requesting $400 credit."   │ │
│ │                                                                              │ │
│ │ ┌─ Attachments ──────────────────────────────────────────────────────┐    │ │
│ │ │ [📎 contract-q2-2026.pdf] [📎 pricing-sheet.xlsx] [+ Add]            │    │ │
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
- **Status cell (ComboboxCellEditor):** Double-click opens combobox: Open, Resolved, Escalated, Withdrawn; typeahead filtered; Enter commits
- **Status display:** Open = warning-yellow; Resolved = success-green; Escalated = error-red with up-arrow icon; Withdrawn = neutral-gray with strikethrough
- **Reason cell:** Display-only; rendered as chip/tag (Pricing, Shortage, Quality, Damaged, Duplicate, Other); filterable via Reason dropdown
- **Invoice cell:** Click navigates to invoice (payable) detail; link style
- **Vendor cell:** Click navigates to vendor; link style
- **Amount cell:** Disputed amount shown; right-aligned; formatted currency
- **Row click:** Opens DetailSlideover at peek (280px)
- **DetailSlideover expand/collapse:** Drag resize 280px ↔ 420px ↔ 60%; click expand icon toggles
- **DetailTabBar tabs:** Click switches (Details, Resolution, History)
- **Details tab:** Full dispute description, disputed amount vs original, line item breakdown, attached documents, timeline of events
- **Resolution tab:** Resolution notes, resolution amount, resolution date, resolution by; [Resolve] button opens resolution form
- **Status dropdown (in detail):** Inline combobox
- **Escalate action:** Opens escalation form: escalation reason, assign to (person/team), priority; sends notification
- **Attachments:** File list with download links; [+ Add] opens file upload; previews for images/PDFs
- **FilterToolbar:** Reason dropdown (Pricing, Shortage, Quality, Damaged, Duplicate, Other); Date range for opened date; Keyword searches ID + invoice + vendor
- **Filter pills (✕):** Click removes filter
- **+ Add filter:** Filter builder popover
- **Sort dropdown:** Multi-column sort builder
- **Export dropdown:** CSV, Excel, PDF
- **GridSummaryStrip cards:** Click filters to segment
- **BulkActionBar buttons:** Resolve (batch resolve with resolution form), Escalate (batch escalate), Add Note (batch note addition), More ▾ (Export selected, Withdraw, Assign)
- **Pagination:** Standard controls
- **[+ New Dispute] button:** Opens dispute creation form: select invoice, disputed amount, reason dropdown, description textarea, attachment upload; [Submit] [Cancel]
- **Column header click:** Sort; column resize via drag

### States Shown

- **Empty state:** "No invoice disputes found" + "Clear filters" or "No disputes — all invoices matched" + [+ New Dispute]
- **Loading state:** 8 skeleton rows; skeleton summary cards; skeleton tabs
- **Error state:** Banner "Failed to load disputes. [Retry]"
- **Filter active:** ActiveFilterPills visible; menubar indicators
- **No filters:** ActiveFilterPills hidden
- **Row selected:** Highlight + checkbox; BulkActionBar slides up
- **Open dispute:** Warning-yellow status; Age cell shows day count; escalatable
- **Resolved dispute:** Green status; shows resolution amount and date; non-editable status
- **Escalated dispute:** Red status; shows escalation date and assignee; locked editing except by assignee
- **Overdue open dispute (>30 days):** Row highlighted; Age cell bold red; "Overdue" badge; auto-escalation trigger candidate
- **Withdrawn dispute:** Gray strikethrough; detail shows withdrawal reason
- **Row editing:** Combobox for status; inline text for notes
- **Row saving:** Spinner; non-interactive
- **Row save failed:** Red flash; toast with retry
- **Bulk resolve:** Resolution form modal with common resolution notes; amount auto-sum; [Apply to all] [Per-item amounts]
- **Bulk action in progress:** "Resolving 3 disputes…"; buttons disabled
- **Bulk action complete:** Toast "3 disputes resolved"; refresh
- **DetailSlideover open:** Grid narrows; keyboard trapped
- **DetailSlideover with attachments:** File preview inline for images; download link for PDFs
- **Resolution form:** Sub-form in Resolution tab: resolution amount (pre-filled with disputed), date picker, notes textarea, [Resolve] [Cancel]
- **New Dispute form:** Modal: invoice search/selector (typeahead from payables), disputed amount (auto from invoice or manual), reason dropdown, description, files; [Submit] [Cancel]
- **Escalation notification:** On escalate, toast "Dispute DSP-0166 escalated to [Assignee]"; detail shows escalation chain
- **Offline:** Banner; cached data; queued actions
- **Keyboard:** Arrow keys; F2 edit status; Enter detail; Tab cycle; Escape close

### ARIA Annotations

- **View container:** `role="region" aria-label="Invoice Disputes view"`
- **View header:** `role="banner"`
- **FilterToolbar:** `role="menubar" aria-label="Filter and view options"`
- **FilterToolbar items:** `role="menuitem" aria-haspopup="true"`
- **ActiveFilterPills:** `role="list" aria-label="Active filters"`
- **Filter pill:** `role="listitem"`; remove: `aria-label="Remove Status: Open filter"`
- **+ Add filter:** `role="button" aria-label="Add filter"`
- **GridSummaryStrip:** `role="region" aria-label="Disputes summary"`
- **Summary card:** `role="button" aria-label="Open: 28 disputes, $187.3k — click to filter" tabindex="0"`
- **ViewTabBar:** `role="tablist" aria-label="Dispute status tabs"`
- **Tab:** `role="tab" aria-selected="true|false" aria-label="Open — 28 disputes"`
- **AG Grid:** `role="grid" aria-label="Invoice dispute records" aria-multiselectable="true" aria-rowcount="168"`
- **Grid header row:** `role="row" aria-rowindex="1"`
- **Column header:** `role="columnheader" aria-sort="none|ascending|descending" aria-label="Amount — click to sort"`
- **Grid data row:** `role="row" aria-rowindex="N" aria-selected="false|true"`
- **Checkbox cell:** `role="gridcell" aria-colindex="1"`; checkbox: `role="checkbox" aria-label="Select DSP-0168"`
- **Status cell (editable):** `role="gridcell" aria-colindex="7" aria-readonly="false"`; combobox: `role="combobox" aria-expanded="false" aria-label="Status for DSP-0168"`
- **Invoice cell:** `role="gridcell"`; link: `role="link" aria-label="View invoice INV-90124"`
- **Overdue row:** `aria-label="DSP-0168 — Open 35 days — overdue"`
- **BulkActionBar:** `role="toolbar" aria-label="Bulk actions — 3 selected" aria-live="polite"`
- **Pagination:** `role="navigation" aria-label="Grid pagination"`
- **DetailSlideover:** `role="dialog" aria-label="Dispute DSP-0168 details" aria-modal="true"`
- **Slideover close:** `aria-label="Close details"`
- **Slideover expand:** `aria-label="Expand to 420px"`
- **DetailTabBar:** `role="tablist" aria-label="Dispute detail sections"`
- **Attachment list:** `role="list" aria-label="Attachments for DSP-0168"`
- **Resolution form:** `role="form" aria-label="Resolve dispute DSP-0168"`
- **Escalation form:** `role="form" aria-label="Escalate dispute DSP-0168"`
- **Toast:** `role="alert" aria-live="assertive"`
- **New Dispute form:** `role="dialog" aria-label="Create new dispute" aria-modal="true"`

### Edge Cases Handled

- **No disputes at all:** Full-page empty state; summary hidden; tabs hidden; CTA to create if there are invoices, or "All invoices reconciled — no disputes needed"
- **All disputes resolved:** Normal view; Open/Escalated tabs with count 0; Resolved tab selected
- **Dispute for non-existent invoice:** Soft reference — invoice ID displayed but link disabled; detail shows "Original invoice not found (may have been deleted)"
- **Multiple disputes on same invoice:** Detail shows "2 disputes on INV-90124" with link to related disputes; grid shows distinct rows
- **Long dispute description (>500 chars):** Grid truncated with tooltip; detail shows full text with expand/collapse
- **Zero-amount dispute:** Allowed for documentation/non-monetary disputes; amount shows $0.00 with "Non-monetary" badge
- **Dispute resolution for less than full amount:** Resolution amount editable; can be $0 (full credit) to full disputed; detail tracks original vs resolution difference
- **Escalation chain:** History shows escalation path: Opened → Escalated to Manager → Escalated to Director; each with timestamp and notes
- **Attachment upload failure:** Toast "Failed to upload file. [Retry]"; file queued locally
- **Attachment size limit (>25MB):** Inline validation on file select; error "File exceeds 25MB limit. Please compress or use a link."
- **Duplicate dispute prevention:** Warning on new dispute creation if invoice already has open dispute "INV-90124 already has an open dispute (DSP-0165). Create another?"
- **Concurrent resolution:** Conflict detection; second resolver gets toast "Dispute was already resolved by [User]"
- **Bulk resolution with mixed status:** Only Open disputes resolvable in bulk; Escalated/Resolved skipped with toast counts
- **Large dataset:** Virtual scrolling; pre-computed summary
- **Rapid filter changes:** 300ms debounce; request cancellation
- **Browser back:** Closes slideover; restores state
- **Keyboard:** Arrow keys; F2 edit; Enter detail; Tab cycle; Escape close
- **Screen reader:** "28 open disputes totaling $187.3k" on filter; "Dispute DSP-0168 — Pricing — $4,720 — Open 5 days"
