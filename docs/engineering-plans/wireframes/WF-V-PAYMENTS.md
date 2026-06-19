## Wireframe: WF-V-PAYMENTS — PaymentsView

### UX Posture

The payments table is the only primary surface. Status filter is a pill in the FilterToolbar (no ViewTabBar). Footer actions are state-gated by payment status. Large-amount and failed payments are flagged at the row level, not in permanent panels.

### Layout (ASCII)

```
┌─FilterToolbar────────────────────────────────────────────────────────────────┐
│  [+ Record Payment ▾] │ Status ▾ │ Data views │ Date │ Amount │ Method │Type│
│                       │ Sort ▾ │ Export ▾                                    │
│  [✕ date:last-30-days] [✕ status:pending] [✕ method:ach]                    │
├─KPI Line─────────────────────────────────────────────────────────────────────┤
│  38 payments · Received $94,200 · Pending $12,800 · Failed 3                 │
│                                                       [Show breakdown ▾]     │
├─AG Grid Table────────────────────────────────────────────────────────────────┤
│  ┌──────┬──────────┬────────────────┬────────┬──────────┬──────────┬──────┐  │
│  │  ☐   │ ID       │ Customer/Vendor│ Amount │ Status   │ Date     │Method│  │
│  ├──────┼──────────┼────────────────┼────────┼──────────┼──────────┼──────┤  │
│  │  ☐   │ PAY-2048 │ Acme Co        │$12,400 │ Completed│ 6/15/26  │ACH  ▾│  │
│  │  ☑   │ PAY-2047 │ Beta Inc       │ $8,200 │ Pending ▾│ 6/14/26  │Wire ▾│  │
│  │  ☑   │ PAY-2046 │ Gamma LLC      │ $3,150 │ Completed│ 6/13/26  │Card ▾│  │
│  │  ☐   │ PAY-2045 │ Delta Corp     │$22,800 │ Failed  ▾│ 6/12/26  │ACH  ▾│  │
│  │  ☑   │ PAY-2044 │ Epsilon Inc    │ $6,900 │ Completed│ 6/11/26  │Check▾│  │
│  │  ☐   │ PAY-2043 │ Zeta LLC       │$15,300 │ Pending ▾│ 6/10/26  │Wire ▾│  │
│  │  ☐   │ PAY-2042 │ Eta Corp       │ $4,500 │ Completed│ 6/09/26  │ACH  ▾│  │
│  └──────┴──────────┴────────────────┴────────┴──────────┴──────────┴──────┘  │
│                       (row height: 32px Mercury standard)                     │
├─BulkActionBar (appears only when rows selected)──────────────────────────────┤
│  3 selected · $18,250   [Approve Payments] [More ▾: Void | Export]           │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Details | Linked Invoices | History
  Footer actions (state-gated):
    Pending   → [Approve] [Void]
    Completed → [Print Receipt] [Void] (with confirmation)
    Failed    → [Retry] [Void]
    Voided    → [View History] (read-only)
```

### State-Gated Action Surface

| Payment State | Visible Actions                              |
|---------------|----------------------------------------------|
| Pending       | `Approve`, `Void`                            |
| Completed     | `Print Receipt`, `Void` (with confirmation)  |
| Failed        | `Retry`, `Void`                              |
| Voided        | `View History` (read-only)                   |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| FilterToolbar          | 100%            | 44px + 32px  | Menubar + active-chip row       |
| KPI line               | 100%            | 32px / ~96px expanded | Inter 13px |
| AG Grid Table          | 100%            | fills remain | Row height 32px                |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom         |
| Slide-over             | 420px standard  | 100% vh      | 280px peek mode                |
| Status combo cell      | —               | 28px popover | ComboboxCellEditor on dblclick |

### Interactive Elements

- **[+ Record Payment ▾]**: Split button — opens payment entry slide-over; arrow opens "Record Payment", "Batch Import", "Apply Credit".
- **Status ▾ pill**: Multi-select popover with `Pending (5)`, `Completed (30)`, `Failed (3)`, `Voided`. Replaces prior ViewTabBar.
- **FilterToolbar**: Date, Amount, Method (multi-select), Type (Customer Payment / Vendor Refund / Internal Transfer).
- **Status cell ▾**: ComboboxCellEditor on dblclick.
- **Method cell ▾**: ComboboxCellEditor for payment method.
- **Row click**: Slide-over peek (280px).
- **BulkActionBar**: Only intersection of valid actions. `Approve Payments` only valid for Pending rows; mixed selection hides it.

### States Shown

- **Default**: Payments table only. Status ▾ defaults to all open.
- **Filtering**: Active chips appear.
- **Bulk selected**: BulkActionBar slides up.
- **Large amount highlight**: Amounts ≥ $10,000 shown with warning highlight + icon.
- **Failed payment**: Error-state row styling.
- **Slide-over peek (280px)**: Shows ID, customer, amount, status badge.
- **Slide-over open (420px)**: Full detail with tabs.
- **Status cell editing**: ComboboxCellEditor open.
- **Export in progress**: Button shows spinner.
- **Error**: Toast at top-right.
- **Void with balance impact**: Modal warning if voiding will unlink from invoices.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Payments filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by payment status"`, `aria-multiselectable="true"`
- Active chip [✕]: `role="button"`, `aria-label="Remove filter"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="94,200 received, 12,800 pending, 38 payments, 3 failed"`
- AG Grid Table: `role="grid"`, `aria-label="Payments table"`, `aria-rowcount="38"`, `aria-multiselectable="true"`
- Amount cell: `role="gridcell"`, `aria-label="$12,400.00"`, right-aligned
- Status ▾: `role="gridcell"`, `aria-label="Status, Completed. Double-click to edit."`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions for 3 selected payments"`
- Slide-over: `role="dialog"`, `aria-label="Payment PAY-2047 details"`, `aria-modal="false"`
- Large amount warning: `role="alert"`, `aria-label="Amount exceeds ten thousand dollars"`

### Edge Cases Handled

- **Zero results**: Empty state with "Clear filters"; KPI line "0 payments · $0".
- **Bulk approve with non-pending items**: `Approve Payments` absent (state gating, not disabled).
- **Payment void with linked invoices**: Modal warning "This will unlink 2 invoices"; requires "I understand" checkbox.
- **Amount ≥ $10,000**: Row shows warning highlight + icon.
- **Negative amounts (refunds)**: Shown with error styling and parentheses; Method "Credit Memo".
- **Slide-over + bulk selection**: Both work independently.
- **Keyboard navigation**: Tab → grid → slide-over.
- **Concurrent edits**: Optimistic update; rollback with toast.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Approve only Pending; Retry only Failed; Print Receipt only Completed. |
| UX-2: Supporting info one click away, never zero | ✓ | Linked Invoices, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Payments table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Failed status at the row. Large amount warning at the cell. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Record payment in slide-over. Void modal for destructive op. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, status badges. |
| UX-8: State changes resolve in place | ✓ | Approve/Retry updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status/method edits save. Record payment form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over payment ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty payments → CTA. Empty filtered → Clear filters. |
