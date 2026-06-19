## Wireframe: WF-V-VPAYABLES — VendorPayablesView

### UX Posture

The payables table is the only primary surface. Status filter is a pill in the FilterToolbar. Footer actions are state-gated. Aging buckets surface in the KPI line, not as competing surfaces.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [+ New Invoice] │ Status ▾ │ Data views │ Date range │ Keyword │ Amount │ │
│ │                 │ Group ▾ │ Sort ▾ │ Export ▾                            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Overdue ✕] [Vendor: Sysco ✕] [+ Add filter]                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ KPI Line ───────────────────────────────────────────────────────────────┐ │
│ │ 2,251 payables · $10.4M  ·  Open 312 · Overdue 47 · Paid 1,892 ·        │ │
│ │ Aging 30-60d $198k                                  [Show breakdown ▾]   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Vendor        │ Invoice#  │ Amount  │ Due Date │ Status  │ │
│ │───┼──────────┼───────────────┼───────────┼─────────┼──────────┼─────────│ │
│ │ ☐ │ VPI-2217 │ Sysco Corp    │ INV-90124 │ $47,250 │ 06/05/26 │ Overdue │ │
│ │ ☐ │ VPI-2216 │ US Foods      │ INV-90118 │ $32,100 │ 06/18/26 │  Open   │ │
│ │ ☐ │ VPI-2215 │ FreshPoint    │ INV-90109 │ $18,450 │ 06/20/26 │  Open   │ │
│ │ ☐ │ VPI-2214 │ Shamrock Foods│ INV-90098 │ $63,800 │ 06/02/26 │ Overdue │ │
│ │ ☐ │ VPI-2213 │ Sysco Corp    │ INV-90085 │ $28,300 │ 05/30/26 │  Paid   │ │
│ │ ☐ │ VPI-2212 │ US Foods      │ INV-90072 │ $41,200 │ 05/28/26 │  Paid   │ │
│ │ ☐ │ VPI-2211 │ Gordon Food   │ INV-90064 │ $15,900 │ 06/15/26 │  Open   │ │
│ │ ☐ │ VPI-2210 │ FreshPoint    │ INV-90051 │ $22,750 │ 06/10/26 │  Open   │ │
│ │                      Page 1 of 282   [◀ ◀ 1 2 3 … 282 ▶ ▶]               │ │
│ │                       (row height: 32px Mercury standard)                  │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (appears only when ≥1 row selected) ──────────────────────┐ │
│ │ 2 selected • $79,350  [Mark Paid] [Schedule Payment] [More ▾]            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Details | PO Links | Payments | History
  Footer actions (state-gated):
    Open      → [Mark Paid] [Schedule Payment] [Dispute] [Void]
    Overdue   → [Mark Paid] [Schedule Payment] [Escalate]
    Paid      → [Void] (with approval) [View Receipt]
    Disputed  → [Resolve Dispute] [Mark Paid]
    Void      → [View History] (read-only)
```

### State-Gated Action Surface

| Payable State | Visible Actions                                  |
|---------------|--------------------------------------------------|
| Open          | `Mark Paid`, `Schedule Payment`, `Dispute`, `Void` |
| Overdue       | `Mark Paid`, `Schedule Payment`, `Escalate`      |
| Paid          | `Void` (with approval), `View Receipt`           |
| Disputed      | `Resolve Dispute`, `Mark Paid`                   |
| Void          | `View History` (read-only)                       |

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

- **[+ New Invoice] button**: Opens invoice creation slide-over.
- **Status ▾ pill**: Multi-select with `Open (312)`, `Overdue (47)`, `Paid (1,892)`, `Disputed`, `Void`. Replaces prior ViewTabBar.
- **Status cell (ComboboxCellEditor)**: Open, Overdue, Paid, Disputed, Void.
- **Amount cell**: Right-aligned currency; negative in parentheses.
- **Due Date cell**: Date picker; overdue dates warning styling.
- **Vendor cell**: Click navigates to vendor.
- **Row click**: Slide-over peek (280px).
- **DetailTabBar tabs**: Details, PO Links, Payments, History.
- **PO Links tab**: Linked POs with amounts, status, clickable.
- **Payments tab**: Payment records; [Record Payment] opens form.
- **FilterToolbar**: Date range, Amount, Keyword.
- **BulkActionBar buttons**: Mark Paid (batch), Schedule Payment (opens scheduler), Assign (dropdown). Only intersection of valid actions.

### States Shown

- **Empty state**: "No payables found" + Clear filters or "Add your first invoice" CTA.
- **Loading state**: 8 skeleton rows.
- **Error state**: Banner with retry.
- **Overdue row**: Warning background tint; Due Date cell bold error; status pill error.
- **Bulk action in progress**: "Updating 2 payables…"; buttons disabled.
- **Slide-over open**: Grid narrows.
- **Slide-over PO Links empty**: "No purchase orders linked" + [Link PO].
- **Slide-over Payments empty**: "No payments recorded" + [Record Payment].
- **Conflict on save**: Toast "Updated by [user]. [Refresh] [Keep changes]"
- **Schedule Payment modal**: Modal with payment amount, date, method, reference.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Vendor payables filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by payable status"`, `aria-multiselectable="true"`
- ActiveFilterPills: `role="list"`, `aria-label="Active filters"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="2,251 payables, $10.4M. Open 312, Overdue 47, Paid 1,892. 30-60 days aging: $198k."`
- AG Grid: `role="grid"`, `aria-label="Vendor payable records"`, `aria-multiselectable="true"`, `aria-rowcount="2251"`
- Status cell (editable): `role="combobox"`, `aria-label="Status for VPI-2217"`
- Vendor cell: `role="link"`, `aria-label="View Sysco Corp details"`
- Amount cell: `role="gridcell"`, `aria-label="$47,250.00"`
- Overdue row: `aria-label="VPI-2217 — Sysco Corp — Overdue — 10 days"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions — 2 selected"`
- Slide-over: `role="dialog"`, `aria-label="Invoice VPI-2217 details"`
- Schedule Payment modal: `role="dialog"`, `aria-label="Schedule payment for VPI-2217"`
- Toast: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **No payables at all**: Full-page empty.
- **All paid**: Normal view; Paid pre-selected.
- **Negative amount (credit memo)**: Parentheses + "Credit" badge.
- **Very large amount**: Formatted appropriately.
- **Missing vendor**: Grid shows "—".
- **Missing PO link**: PO Links tab "No purchase order linked — [Link to PO]".
- **Overlapping payment dates**: Payment history ordered desc.
- **Multiple POs per invoice**: PO Links shows table of linked POs.
- **Aging bucket edge**: Counts aggregate per bucket.
- **Concurrent edit**: Conflict handling.
- **Large dataset**: Virtual scrolling.
- **Browser back**: Closes slide-over.
- **Offline**: Cached data; queued edits.
- **Schedule Payment from bulk**: Per-invoice breakdown.
- **Keyboard navigation**: Standard.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Mark Paid only on Open/Overdue; Void only on Paid (with approval). |
| UX-2: Supporting info one click away, never zero | ✓ | PO Links, Payments, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Payables table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Overdue at the row. Aging in KPI line. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Invoice creation in slide-over. Schedule Payment modal because it's a scheduling commitment. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header. |
| UX-8: State changes resolve in place | ✓ | Mark Paid updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status edits save. Payment form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → New Invoice CTA. Empty filtered → Clear filters. |
