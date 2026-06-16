## Wireframe: WF-V-PRECEIPTS — PurchaseReceiptsView

### UX Posture

The receipts table is the only primary surface. Status filter is a pill in the FilterToolbar. Footer actions state-gated by receipt state. Discrepancies surface at the row, not in a permanent panel.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [+ New Receipt] │ Status ▾ │ Data views │ Date range │ Keyword │ Amount │ │
│ │                 │ Group ▾ │ Sort ▾ │ Export ▾                            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Pending ✕] [Vendor: US Foods ✕] [+ Add filter]                  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ KPI Line ───────────────────────────────────────────────────────────────┐ │
│ │ 660 receipts · $4.5M  ·  Pending 47 · Received 312 · Verified 289 ·     │ │
│ │ Discrepancy 12                                       [Show breakdown ▾]  │ │
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
│ │                       (row height: 32px Mercury standard)                  │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (appears only when ≥1 row selected) ──────────────────────┐ │
│ │ 3 selected • 770 units  [Mark Received] [Verify] [More ▾]                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Items | PO Link | History
  Footer actions (state-gated):
    Pending      → [Mark Received] [Cancel]
    Received     → [Verify] [Flag Discrepancy]
    Verified     → [View PO]
    Discrepancy  → [Resolve] [Escalate] [View PO]
    Cancelled    → [View History] (read-only)
```

### State-Gated Action Surface

| Receipt State | Visible Actions                              |
|---------------|----------------------------------------------|
| Pending       | `Mark Received`, `Cancel`                    |
| Received      | `Verify`, `Flag Discrepancy`                 |
| Verified      | `View PO`                                    |
| Discrepancy   | `Resolve`, `Escalate`, `View PO`             |
| Cancelled     | `View History` (read-only)                   |

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

- **[+ New Receipt] button**: Opens receipt entry slide-over (PO selector, auto-populates line items).
- **Status ▾ pill**: Multi-select with `Pending (47)`, `Received (312)`, `Verified (289)`, `Discrepancy (12)`, `Cancelled`. Replaces prior ViewTabBar.
- **Status cell (ComboboxCellEditor)**: Valid transitions only.
- **Status display**: Pending = neutral; Received = info; Verified = success; Discrepancy = warning with icon.
- **PO# cell**: Click navigates to PO.
- **Vendor cell**: Click navigates to vendor.
- **Qty cell**: Right-aligned; discrepancy rows show variance.
- **Received Date cell**: Date picker.
- **Row click**: Slide-over peek (280px).
- **DetailTabBar tabs**: Items (line items with variances highlighted), PO Link, History.
- **Items tab**: Per-item SKU, description, PO qty, received qty, variance (error = shortage, success = match, info = overage).
- **PO Link tab**: Linked PO summary with reconciliation.
- **FilterToolbar**: Date range for received date, Amount for qty range, Keyword (PO# + vendor + SKU).
- **BulkActionBar**: Mark Received (batch), Verify (batch), Link PO (associate receipts to POs). Only intersection of valid actions.

### States Shown

- **Empty state**: "No purchase receipts found" + Clear filters or "Create your first receipt" CTA.
- **Loading state**: 8 skeleton rows.
- **Error state**: Banner with retry.
- **Discrepancy row**: Warning status pill; Qty cell variance in parentheses; row warning background.
- **Bulk action in progress**: "Verifying 3 receipts…"; buttons disabled.
- **Slide-over open**: Grid narrows.
- **Detail Items with line-level discrepancy**: Per-line status (match / shortage / overage); marks individual lines as verified/disputed.
- **New Receipt form**: Slide-over with PO selector typeahead; auto-populates line items; editable received quantities.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Purchase receipts filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by receipt status"`, `aria-multiselectable="true"`
- ActiveFilterPills: `role="list"`, `aria-label="Active filters"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="660 receipts, $4.5M. Pending 47, Received 312, Verified 289, Discrepancy 12."`
- AG Grid: `role="grid"`, `aria-label="Purchase receipt records"`, `aria-multiselectable="true"`
- Status cell (editable): `role="combobox"`, `aria-label="Status for REC-0660"`
- Variance row: `aria-label="REC-0656 — Discrepancy — 150 units received"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions — 3 selected"`
- Slide-over: `role="dialog"`, `aria-label="Receipt REC-0660 details"`
- Line items table: `role="table"`, `aria-label="Line items for REC-0660"`
- Variance cell: `aria-label="Broccoli Floret — exact match"` or `aria-label="Spinach Chopped — shortage of 8 units"`
- Toast: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **No receipts at all**: Full-page empty.
- **All verified**: Normal view; Verified pre-selected.
- **Zero-quantity receipt**: Items show all 0; discrepancy flag.
- **Partial line item receipt**: "50/100" in both columns; Status "Partial"; ability to add additional receipt.
- **Multiple receipts for same PO**: PO Link tab lists all receipts; reconciliation table.
- **Backdated receipt**: Soft warning "Receipt date precedes PO date."
- **Overage approval threshold**: > 10% over PO qty triggers "Over-receipt requires approval."
- **Damaged goods**: Line item marked "Damaged" with qty separate from shortage.
- **Unlinked PO**: PO# "—"; `Link PO` available.
- **Zero-value PO**: Discrepancy logic based on qty only.
- **Concurrent verification**: Conflict toast.
- **Large dataset**: Virtual scrolling.
- **Browser back**: Closes slide-over.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Mark Received only Pending; Verify only Received; Resolve only Discrepancy. |
| UX-2: Supporting info one click away, never zero | ✓ | Items, PO Link, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Receipts table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Discrepancy at the row; variance at the line. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | New receipt in slide-over. Cancel modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header. |
| UX-8: State changes resolve in place | ✓ | Verify updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status edits save. Receipt form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → New Receipt CTA. Empty filtered → Clear filters. |
