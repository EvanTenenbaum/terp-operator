## Wireframe: WF-V-PAYMENTS — PaymentsView

### Layout (ASCII)

```
┌─View Header: "Payments"                   [+ Record Payment ▾] [⚙ Settings]──┐
├─FilterToolbar────────────────────────────────────────────────────────────────┤
│  [▾ Data views] │ [▾ Date ▾] [▾ Amount ▾] [▾ Method ▾] [▾ Type ▾]           │
│                 │ [▾ Sort ▾] [⬇ Export]                                     │
│  [✕ date:last-30-days] [✕ status:pending] [✕ method:ach]                    │
├─GridSummaryStrip─────────────────────────────────────────────────────────────┤
│  [📊 Received: $94,200 · Pending: $12,800 · 18 payments · 3 Failed]         │
├─ViewTabBar───────────────────────────────────────────────────────────────────┤
│  [All (38)] [Pending (5)] [Completed (30)] [Failed (3)]                       │
├─AG Grid Table────────────────────────────────────────────────────────────────┤
│  ┌──────┬──────────┬────────────────┬────────┬──────────┬──────────┬──────┐  │
│  │  ☐   │ ID       │ Customer/Vendor│ Amount │ Status   │ Date     │Method│•││  │
│  ├──────┼──────────┼────────────────┼────────┼──────────┼──────────┼──────┤  │
│  │  ☐   │ PAY-2048 │ Acme Co        │$12,400 │ Completed│ 6/15/26  │ACH  ▾│⋮│  │
│  │  ☑   │ PAY-2047 │ Beta Inc       │ $8,200 │ Pending ▾│ 6/14/26  │Wire ▾│⋮│  │
│  │  ☑   │ PAY-2046 │ Gamma LLC      │ $3,150 │ Completed│ 6/13/26  │Card ▾│⋮│  │
│  │  ☐   │ PAY-2045 │ Delta Corp     │$22,800 │ Failed  ▾│ 6/12/26  │ACH  ▾│⋮│  │
│  │  ☑   │ PAY-2044 │ Epsilon Inc    │ $6,900 │ Completed│ 6/11/26  │Check▾│⋮│  │
│  │  ☐   │ PAY-2043 │ Zeta LLC       │$15,300 │ Pending ▾│ 6/10/26  │Wire ▾│⋮│  │
│  │  ☐   │ PAY-2042 │ Eta Corp       │ $4,500 │ Completed│ 6/09/26  │ACH  ▾│⋮│  │
│  └──────┴──────────┴────────────────┴────────┴──────────┴──────────┴──────┘  │
├─BulkActionBar (hidden until selection)───────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 3 selected · $18,250   [✓ Approve Payments] [✗ Void] [More ▾]         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
├─DetailSlideover (right side, 420px, when row clicked)────────────────────────┤
│  ┌────────────────────────┐                                                 │
│  │ PAY-2047 · Beta Inc    │  ◀ Collapse                                    │
│  ├────────────────────────┤                                                 │
│  │ [Details] [Linked Inv.]│                                                 │
│  │ [History]              │                                                 │
│  ├────────────────────────┤                                                 │
│  │ Payment Details        │                                                 │
│  │ ┌────────────────────┐ │                                                 │
│  │ │ Amount    $8,200.00│ │                                                 │
│  │ │ Method    Wire     │ │                                                 │
│  │ │ Status    Pending  │ │                                                 │
│  │ │ Date      6/14/26  │ │                                                 │
│  │ │ Reference WIRE-882 │ │                                                 │
│  │ │ Notes     Net 30   │ │                                                 │
│  │ └────────────────────┘ │                                                 │
│  │                        │                                                 │
│  │ Linked Invoices (2)    │                                                 │
│  │ ┌────────────────────┐ │                                                 │
│  │ │ INV-3021  $5,100   │ │                                                 │
│  │ │ INV-3028  $3,100   │ │                                                 │
│  │ │ Total:    $8,200   │ │                                                 │
│  │ └────────────────────┘ │                                                 │
│  │                        │                                                 │
│  │ [Approve] [Void]       │                                                 │
│  └────────────────────────┘                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| View Header            | 100%            | 56px         | Inter 20px bold, flex row      |
| FilterToolbar          | 100%            | 44px + 32px  | Menubar row + active-chip row  |
| GridSummaryStrip       | 100%            | 36px         | Inter 13px, muted bg           |
| ViewTabBar             | 100%            | 40px         | Tab height 36px, Inter 13px    |
| AG Grid Table          | 100%            | fills remain | Row height 32px, header 40px   |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom overlay |
| DetailSlideover        | 420px standard  | 100% vh      | Right panel, 280px peek mode   |
| Checkbox column        | 36px            | —            | Centered, 16px checkbox        |
| Amount column          | —               | —            | Right-aligned, tabular nums    |
| Status combo cell      | —               | 28px popover | ComboboxCellEditor on dblclick |
| Actions column (•••)   | 44px            | —            | Opens context menu             |

### Interactive Elements

- **[+ Record Payment ▾]**: Split button — opens payment entry modal; arrow opens "Record Payment", "Batch Import", "Apply Credit"
- **[⚙ Settings]**: Opens GridSettingsPanel slideover (column visibility, sort defaults, density)
- **[▾ Data views]**: Dropdown of saved filter presets — "All Payments", "Pending Approvals", "Today's Batch"
- **[▾ Date ▾]**: Filter popover with date-range picker — quick presets: Today, This Week, Last 30 Days, This Quarter, Custom
- **[▾ Amount ▾]**: Filter popover with min/max inputs and preset ranges (≤$1K, $1K–$5K, $5K–$20K, ≥$20K)
- **[▾ Method ▾]**: Filter popover with checkboxes — ACH, Wire, Card, Check, Cash, Credit Memo
- **[▾ Type ▾]**: Filter popover with checkboxes — Customer Payment, Vendor Refund, Internal Transfer
- **[▾ Sort ▾]**: "Newest First" (default), "Oldest First", "Amount High–Low", "Amount Low–High", "Customer A–Z"
- **[⬇ Export]**: Exports visible rows as CSV; spinner during generation
- **[✕ chip]**: Removes that filter; grid refreshes immediately
- **[Tab: All, Pending, Completed, Failed]**: Sets status filter; badge shows count
- **[☐ header checkbox]**: Selects all visible; indeterminate on partial selection
- **[☐ row checkbox]**: Toggles row selection; updates BulkActionBar
- **[Status cell ▾]**: Double-click opens ComboboxCellEditor (Pending, Completed, Failed, Voided). Enter to confirm, Escape to close, Arrow keys to navigate
- **[Method cell ▾]**: Double-click to edit payment method (same ComboboxCellEditor pattern)
- **[⋮ Actions button]**: Context menu — "View Details", "Approve", "Void", "Print Receipt", "Add Note"
- **[DetailSlideover tabs]**: Switch between Details, Linked Invoices, History panels
- **[◀ Collapse]**: Collapses slideover to 280px peek mode
- **[Approve button]**: Confirms pending payment; shows confirmation dialog for amounts > $10,000
- **[Void button]**: Opens void reason dialog; requires reason text before confirming
- **[BulkActionBar: ✓ Approve Payments]**: Bulk approve all selected pending payments; confirmation with total amount
- **[BulkActionBar: ✗ Void]**: Bulk void selected payments; requires void reason
- **[BulkActionBar: More ▾]**: Dropdown with "Print Receipts", "Export Selected", "Add Tag"

### States Shown

- **Empty**: "No payments match your filters. [Clear filters]" — centered illustration
- **Loading**: Skeleton rows (6 shimmer rows, 32px each); tab badges show "—"
- **Filtering**: Active chips appear below menubar; grid re-queries with 300ms debounce
- **Partial selection**: Header checkbox indeterminate (dash icon)
- **Bulk selected**: BulkActionBar slides up; shows count + total; actions contextual
- **Bulk mixed status**: "Approve Payments" enabled only if all selected are Pending; otherwise disabled with tooltip
- **Slideover peek (280px)**: Shows payment ID, customer, amount, status badge only
- **Slideover open (420px)**: Full detail panel with tabs; linked invoices displayed
- **Status cell editing**: ComboboxCellEditor open; inline popover with options
- **Export in progress**: Button shows spinner + "Generating…"; disabled during export
- **Error**: Toast: "Failed to load payments. [Retry]" at top-right
- **Large amount highlight**: Amounts ≥ $10,000 shown with subtle amber highlight and warning icon
- **Void with balance impact**: Dialog warns if voiding will unlink from invoices
- **Batch payment import**: Modal with drag-and-drop CSV upload zone and column mapping UI

### ARIA Annotations

- **View Header**: `role="banner"`, `aria-label="Payments view header"`
- **[+ Record Payment ▾]**: `role="button"`, `aria-haspopup="menu"`, `aria-label="Record new payment"`
- **[⚙ Settings]**: `role="button"`, `aria-label="Grid settings"`, `aria-haspopup="dialog"`
- **FilterToolbar**: `role="toolbar"`, `aria-label="Filter and sort toolbar"`
- **[▾ Method ▾]**: `role="combobox"`, `aria-label="Filter by payment method"`, `aria-expanded="false"`
- **Active chip [✕]**: `role="button"`, `aria-label="Remove filter: payment method is ACH"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="94,200 received, 12,800 pending, 18 payments, 3 failed"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Payment status filters"`
- **Tab [Pending (5)]**: `role="tab"`, `aria-selected="false"`, `aria-label="Pending payments, 5 items"`
- **AG Grid Table**: `role="grid"`, `aria-label="Payments table"`, `aria-rowcount="38"`, `aria-multiselectable="true"`
- **Header checkbox**: `role="columnheader"`, `aria-label="Select all rows"`
- **Row checkbox**: `role="gridcell"`, `aria-selected="true"` when checked
- **Amount cell**: `role="gridcell"`, `aria-label="$12,400.00"`, right-aligned
- **Status ▾**: `role="gridcell"`, `aria-label="Status, Completed. Double-click to edit."`
- **⋮ Actions**: `role="button"`, `aria-label="More actions for PAY-2047"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 3 selected payments"`, `aria-live="polite"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Payment PAY-2047 details"`, `aria-modal="false"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Payment detail sections"`
- **[Approve]**: `role="button"`, `aria-label="Approve payment PAY-2047"`
- **[Void]**: `role="button"`, `aria-label="Void payment PAY-2047"`
- **Large amount warning**: `role="alert"`, `aria-label="Amount exceeds ten thousand dollars"`
- **Export spinner**: `role="progressbar"`, `aria-label="Exporting payments"`

### Edge Cases Handled

- **Zero results**: Empty state with "Clear filters" action; summary strip shows "0 payments · $0"
- **All rows selected**: Header checkbox fully checked; BulkActionBar shows full count + total
- **Deselect all**: BulkActionBar slides down; hidden when count = 0
- **Bulk approve with non-pending items**: "Approve Payments" disabled; tooltip "Only pending payments can be approved"
- **Payment void with linked invoices**: Confirmation dialog warns "This will unlink 2 invoices"; requires "I understand" checkbox
- **Amount ≥ $10,000**: Row shows amber highlight + ⚠ icon; slideover shows flag indicator
- **Negative amounts (refunds)**: Shown in red with parentheses; Method cell shows "Credit Memo"
- **DetailSlideover open + bulk selection**: Slideover stays; bulk selection operates independently
- **Keyboard navigation**: Tab through toolbar → grid → slideover. Enter opens slideover. Space toggles checkbox. Arrow keys navigate cells.
- **Export with no rows**: Button disabled; tooltip "No payments to export"
- **Long customer/vendor names**: Truncated with ellipsis; full name in tooltip
- **Multiple payment methods per batch**: Method cell shows primary method; detail shows breakdown
- **Slideover close via Escape**: Focus returns to triggering row
- **Concurrent edits**: Optimistic update on status; rollback with toast on conflict
- **Touch device**: 44px minimum row touch target; swipe left to void, swipe right to approve
