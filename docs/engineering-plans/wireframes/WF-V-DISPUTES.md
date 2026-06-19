## Wireframe: WF-V-DISPUTES — InvoiceDisputesView

### UX Posture

The disputes table is the only primary surface. Status filter is a pill in the FilterToolbar. Footer actions are state-gated by dispute status. Attachments and resolution form live in the slide-over.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [+ New Dispute] │ Status ▾ │ Data views │ Date range │ Keyword │ Amount │ │
│ │                 │ Group ▾ │ Sort ▾ │ Export ▾                            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Open ✕] [Reason: Pricing ✕] [+ Add filter]                      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ KPI Line ───────────────────────────────────────────────────────────────┐ │
│ │ 168 disputes · $983.6k  ·  Open 28 · Resolved 134 · Escalated 6 ·       │ │
│ │ Avg 14.2d open                                       [Show breakdown ▾]  │ │
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
│ │                       (row height: 32px Mercury standard)                  │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (appears only when ≥1 row selected) ──────────────────────┐ │
│ │ 3 selected • $13,930  [Resolve] [Escalate] [More ▾: Add Note | Withdraw]│ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Details | Resolution | History
  Footer actions (state-gated):
    Open      → [Resolve] [Escalate] [Withdraw] [Add Note]
    Escalated → [Resolve] [De-escalate] [Add Note]
    Resolved  → [View Resolution] [Re-open] (with approval)
    Withdrawn → [View History] (read-only)
```

### State-Gated Action Surface

| Dispute State  | Visible Actions                                  |
|----------------|--------------------------------------------------|
| Open           | `Resolve`, `Escalate`, `Withdraw`, `Add Note`    |
| Escalated      | `Resolve`, `De-escalate`, `Add Note`             |
| Resolved       | `View Resolution`, `Re-open` (with approval)     |
| Withdrawn      | `View History` (read-only)                       |

### Dimensions

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| FilterToolbar | 100% | 40px | horizontal menubar |
| ActiveFilterPills | 100% | 36px | flex-wrap |
| KPI line | 100% | 32px / ~96px expanded | px-4 |
| AG Grid | 100% | flex-1 | virtual scrolling |
| Grid row | 100% | 32px | Mercury standard |
| BulkActionBar | 100% | 48px | sticky bottom, slide-up |
| Slide-over | 280/420/60% | 100% parent | three sizes |

### Interactive Elements

- **[+ New Dispute] button**: Opens dispute creation in slide-over.
- **Status ▾ pill**: Multi-select with `Open (28)`, `Resolved (134)`, `Escalated (6)`, `Withdrawn`. Replaces prior ViewTabBar.
- **Status cell (ComboboxCellEditor)**: Valid transitions only.
- **Status display**: Open = warning; Resolved = success; Escalated = error with up-arrow icon; Withdrawn = neutral with strikethrough.
- **Reason cell**: Display-only chip (Pricing, Shortage, Quality, Damaged, Duplicate, Other).
- **Invoice cell**: Click navigates to invoice detail.
- **Vendor cell**: Click navigates to vendor.
- **Amount cell**: Disputed amount; right-aligned currency.
- **Row click**: Slide-over peek (280px).
- **DetailTabBar tabs**: Details (full description + attachments), Resolution, History.
- **Resolution tab [Resolve] button**: Opens resolution form.
- **Escalate action**: Opens escalation form with reason, assignee, priority.
- **Attachments**: File list with download links; [+ Add] opens upload.
- **FilterToolbar**: Reason dropdown, Date range, Keyword (ID + invoice + vendor).
- **BulkActionBar**: Only intersection of valid actions.

### States Shown

- **Empty state**: "No invoice disputes found" + Clear filters or "No disputes — all invoices matched" + CTA.
- **Loading state**: 8 skeleton rows.
- **Error state**: Banner with retry.
- **Open dispute**: Warning status; Age cell shows day count.
- **Resolved dispute**: Success status; resolution amount and date.
- **Escalated dispute**: Error status; assignee shown.
- **Overdue open (>30 days)**: Row highlighted; Age cell bold error.
- **Withdrawn dispute**: Strikethrough; withdrawal reason in detail.
- **Bulk resolve**: Modal with common resolution notes; amount auto-sum.
- **Bulk action in progress**: "Resolving 3 disputes…"; buttons disabled.
- **Slide-over open**: Grid narrows.
- **Slide-over with attachments**: File preview inline for images; download for PDFs.
- **Resolution form**: Sub-form in Resolution tab.
- **New Dispute form**: Slide-over with invoice typeahead, amount, reason, description, files.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Disputes filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by dispute status"`, `aria-multiselectable="true"`
- ActiveFilterPills: `role="list"`, `aria-label="Active filters"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="168 disputes, $983.6k. Open 28, Resolved 134, Escalated 6. Average 14.2 days open."`
- AG Grid: `role="grid"`, `aria-label="Invoice dispute records"`, `aria-multiselectable="true"`
- Status cell (editable): `role="combobox"`, `aria-label="Status for DSP-0168"`
- Invoice cell: `role="link"`, `aria-label="View invoice INV-90124"`
- Overdue row: `aria-label="DSP-0168 — Open 35 days — overdue"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions — 3 selected"`
- Slide-over: `role="dialog"`, `aria-label="Dispute DSP-0168 details"`
- Attachment list: `role="list"`, `aria-label="Attachments for DSP-0168"`
- Resolution form: `role="form"`, `aria-label="Resolve dispute DSP-0168"`
- Toast: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **No disputes at all**: Full-page empty.
- **All disputes resolved**: Normal view; Resolved pre-selected.
- **Dispute for non-existent invoice**: Soft reference; detail shows "Original invoice not found."
- **Multiple disputes on same invoice**: Detail shows "2 disputes on INV-90124" with link to related.
- **Long description (>500 chars)**: Truncated with tooltip; detail shows full with expand/collapse.
- **Zero-amount dispute**: Allowed; "Non-monetary" badge.
- **Partial resolution**: Tracks original vs resolution difference.
- **Escalation chain**: History shows: Opened → Escalated to Manager → Escalated to Director.
- **Attachment upload failure**: Toast with retry.
- **Attachment size limit (>25MB)**: Inline error.
- **Duplicate dispute prevention**: Warning if invoice has open dispute.
- **Concurrent resolution**: Conflict detection.
- **Bulk resolution mixed status**: Only Open resolvable in bulk; others skipped with toast.
- **Large dataset**: Virtual scrolling.
- **Browser back**: Closes slide-over.
- **Screen reader**: "28 open disputes totaling $187.3k" on filter.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Resolve only on Open/Escalated; Re-open only on Resolved. |
| UX-2: Supporting info one click away, never zero | ✓ | Resolution, History as slide-over tabs. Attachments inline in Details. |
| UX-3: One primary surface per view | ✓ | Disputes table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Overdue at the row. No permanent panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | New Dispute in slide-over. Re-open modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header. |
| UX-8: State changes resolve in place | ✓ | Resolve/Escalate updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save. Resolution form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → New Dispute CTA. Empty filtered → Clear filters. |
