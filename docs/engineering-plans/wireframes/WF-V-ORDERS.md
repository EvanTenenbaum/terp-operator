## Wireframe: WF-V-ORDERS — OrdersView

### Layout (ASCII)

```
┌─View Header: "Sales Orders"              [+ New Order ▾] [⚙ Settings]──┐
├─FilterToolbar──────────────────────────────────────────────────────────┤
│  [▾ Data views] │ [▾ Date ▾] [▾ Keyword ▾] [▾ Amount ▾] [▾ Group ▾]   │
│                 │ [▾ Sort ▾] [⬇ Export]                               │
│  [✕ status:confirmed] [✕ amount:gte:5000] [✕ date:last-30-days]       │
├─GridSummaryStrip───────────────────────────────────────────────────────┤
│  [📊 Total: 42 orders  ·  $128,400  ·  5 Pending  ·  3 Shipped]       │
├─ViewTabBar─────────────────────────────────────────────────────────────┤
│  [All (42)] [Draft (5)] [Confirmed (12)] [Posted (18)] [Fulfilled (7)] │
├─AG Grid Table──────────────────────────────────────────────────────────┤
│  ┌──────┬────────────────┬────────────┬──────────┬──────────┬──────┐   │
│  │  ☐   │  ID            │ Customer   │ Status   │ Date     │Amount│ ••││   │
│  ├──────┼────────────────┼────────────┼──────────┼──────────┼──────┤   │
│  │  ☐   │ SO-1042        │ Acme Co    │ Confirmed│ 6/15/26  │$12,40│  ⋮ │   │
│  │  ☑   │ SO-1041        │ Beta Inc   │ Posted  ▾│ 6/14/26  │$8,200│  ⋮ │   │
│  │  ☐   │ SO-1040        │ Gamma LLC  │ Draft   ▾│ 6/13/26  │$3,150│  ⋮ │   │
│  │  ☑   │ SO-1039        │ Delta Corp │ Posted  ▾│ 6/12/26  │$22,80│  ⋮ │   │
│  │  ☐   │ SO-1038        │ Epsilon Inc│ Confirmed│ 6/11/26  │$6,900│  ⋮ │   │
│  │  ☑   │ SO-1037        │ Zeta LLC   │ Shipped ▾│ 6/10/26  │$15,30│  ⋮ │   │
│  │  ☐   │ SO-1036        │ Eta Corp   │ Draft   ▾│ 6/09/26  │$4,500│  ⋮ │   │
│  └──────┴────────────────┴────────────┴──────────┴──────────┴──────┘   │
├─BulkActionBar (hidden until selection)─────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 3 selected · $46,300   [✏ Edit Status] [📄 Print] [More ▾]     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
├─DetailSlideover (right side, 420px, when row clicked)──────────────────┤
│  ┌──────────────────────┐                                              │
│  │ SO-1041 · Beta Inc   │  ◀ Collapse                                 │
│  ├──────────────────────┤                                              │
│  │ [Lines][Pricing]     │                                              │
│  │ [Fulfillment][History]                                              │
│  ├──────────────────────┤                                              │
│  │ Line Items (4)       │                                              │
│  │ ┌──────────────────┐ │                                              │
│  │ │ Product    Qty   │ │                                              │
│  │ │ Apples   200 ct  │ │                                              │
│  │ │ Oranges  150 ct  │ │                                              │
│  │ │ Bananas  300 ct  │ │                                              │
│  │ │ Grapes   100 ct  │ │                                              │
│  │ └──────────────────┘ │                                              │
│  │                      │                                              │
│  │ Subtotal:  $7,200    │                                              │
│  │ Tax:         $580    │                                              │
│  │ Shipping:    $420    │                                              │
│  │ ─────────────────    │                                              │
│  │ Total:     $8,200    │                                              │
│  │                      │                                              │
│  │ [Edit Order] [Cancel]│                                              │
│  └──────────────────────┘                                              │
└────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| View Header            | 100%            | 56px         | Inter 20px bold, flex row      |
| FilterToolbar          | 100%            | 44px + 32px  | Menubar row + active-chip row  |
| GridSummaryStrip       | 100%            | 36px         | Inter 13px, muted background   |
| ViewTabBar             | 100%            | 40px         | Tab height 36px, Inter 13px    |
| AG Grid Table          | 100%            | fills remain | Row height 32px, header 40px   |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom overlay |
| DetailSlideover        | 420px standard  | 100% vh      | Right panel, 280px peek mode   |
| Checkbox column        | 36px            | —            | Centered, 16px checkbox        |
| Status combo cell      | —               | 28px popover | ComboboxCellEditor on dblclick |
| Actions column (•••)   | 44px            | —            | Opens context menu             |

### Interactive Elements

- **[+ New Order ▾]**: Split button — click opens create modal; arrow opens dropdown with "Blank Order", "From Template", "Duplicate Selected"
- **[⚙ Settings]**: Opens GridSettingsPanel slideover (column visibility, sort defaults, density)
- **[▾ Data views]**: Dropdown of saved filter/column presets — "Default", "My Open Orders", "This Week's Shipments", plus "Save Current View…"
- **[▾ Date ▾]**: Filter popover with date-range picker and quick presets (Today, This Week, Last 30 Days, Custom)
- **[▾ Keyword ▾]**: Filter popover with single text input, searches across ID, Customer name, Notes
- **[▾ Amount ▾]**: Filter popover with min/max inputs and preset ranges (≤$1K, $1K–$5K, $5K–$20K, ≥$20K)
- **[▾ Group ▾]**: Filter popover with checkboxes for Status, Sales Rep, Region, Fulfillment Type
- **[▾ Sort ▾]**: Sort popover — "Newest First" (default), "Oldest First", "Amount High–Low", "Amount Low–High", "Customer A–Z"
- **[⬇ Export]**: Exports visible rows as CSV; shows spinner during generation
- **[✕ chip]**: Removes that filter; updates grid immediately
- **[Tab: All, Draft, Confirmed, Posted, Fulfilled]**: Sets status filter; badge shows count. Click updates grid
- **[☐ header checkbox]**: Selects all visible rows; indeterminate when partial selection
- **[☐ row checkbox]**: Toggles row selection; updates BulkActionBar count
- **[Status cell ▾]**: Double-click opens ComboboxCellEditor dropdown (Draft, Confirmed, Posted, Shipped, Fulfilled, Cancelled). Enter to confirm, Escape to close, Arrow keys to navigate
- **[⋮ Actions button]**: Opens ContextMenuTrigger with — "View Details", "Edit", "Duplicate", "Print", "Cancel Order"
- **[DetailSlideover tabs]**: Click switches between Lines, Pricing, Fulfillment, History panels
- **[◀ Collapse]**: Collapses slideover to 280px peek mode
- **[Edit Order button]**: Opens order in full edit mode inline or in modal
- **[Cancel button]**: Opens confirmation dialog for order cancellation
- **[BulkActionBar: ✏ Edit Status]**: Opens inline dropdown to bulk-set status on selected rows
- **[BulkActionBar: 📄 Print]**: Generates print view for selected orders
- **[BulkActionBar: More ▾]**: Dropdown with "Assign Rep", "Add Tag", "Export Selected", "Delete"

### States Shown

- **Empty**: "No orders match your filters. [Clear filters]" — centered illustration + link
- **Loading**: AG Grid skeleton rows (6 shimmer rows, 32px each), tab badges show "—"
- **Filtering**: Active chips appear below menubar; grid re-queries with debounce (300ms)
- **Partial selection**: Header checkbox in indeterminate state (dash icon)
- **Bulk selected**: BulkActionBar slides up; shows count + total; contextual actions change by selection mix
- **Bulk mixed status**: "Edit Status" disabled if selected rows have different statuses
- **Slideover peek (280px)**: Shows order ID, customer, status badge, total amount only
- **Slideover open (420px)**: Full detail panel with tabs
- **Slideover edit mode**: Panel expands to 60% width; inline editable fields
- **Status cell editing**: ComboboxCellEditor open; inline popover with options; background dim behind
- **Export in progress**: Export button shows spinner + "Generating…"; disabled during export
- **Error**: Toast notification: "Failed to load orders. [Retry]" at top-right
- **Empty order (no lines)**: Slideover Lines tab shows "No line items yet. [+ Add Line]"

### ARIA Annotations

- **View Header**: `role="banner"`, `aria-label="Orders view header"`
- **[+ New Order ▾]**: `role="button"`, `aria-haspopup="menu"`, `aria-label="Create new order"`
- **[⚙ Settings]**: `role="button"`, `aria-label="Grid settings"`, `aria-haspopup="dialog"`
- **FilterToolbar**: `role="toolbar"`, `aria-label="Filter and sort toolbar"`
- **[▾ Data views]**: `role="combobox"`, `aria-label="Saved data views"`, `aria-expanded="false"`
- **[▾ Date ▾]**: `role="combobox"`, `aria-label="Filter by date range"`, `aria-expanded="false"`
- **Active chip [✕]**: `role="button"`, `aria-label="Remove filter: status is confirmed"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="42 orders, 128,400 dollars total, 5 pending"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Order status filters"`
- **Tab [All (42)]**: `role="tab"`, `aria-selected="true"`, `aria-label="All orders, 42 items"`
- **AG Grid Table**: `role="grid"`, `aria-label="Orders table"`, `aria-rowcount="42"`, `aria-multiselectable="true"`
- **Header checkbox**: `role="columnheader"`, `aria-label="Select all rows"`
- **Row checkbox**: `role="gridcell"`, `aria-selected="true"` when checked
- **Status ▾**: `role="gridcell"`, `aria-label="Status, Posted. Double-click to edit."`
- **⋮ Actions button**: `role="button"`, `aria-label="More actions for SO-1041"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 3 selected orders"`, `aria-live="polite"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Order SO-1041 details"`, `aria-modal="false"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Order detail sections"`
- **Slideover tab panel [Lines]**: `role="tabpanel"`, `aria-label="Line items"`
- **[◀ Collapse]**: `role="button"`, `aria-label="Collapse detail panel"`
- **Export spinner**: `role="progressbar"`, `aria-label="Exporting orders"`

### Edge Cases Handled

- **Zero results after filter**: Empty state with illustration and "Clear filters" action; summary strip shows "0 orders · $0"
- **All rows selected**: Header checkbox is fully checked; BulkActionBar shows "42 selected · $128,400"
- **Deselect all**: BulkActionBar slides down with animation; hidden when count = 0
- **Status cell edited on selected row**: Row stays selected; grid refreshes; tab counts update
- **Bulk edit across mixed statuses**: "Edit Status" is disabled in BulkActionBar; tooltip explains "Selected orders have different statuses"
- **DetailSlideover open + bulk selection**: Slideover stays open on selected row; other rows may be bulk-selected independently
- **Keyboard navigation**: Tab moves through toolbar → grid → slideover. Enter on row opens slideover. Space toggles checkbox. Arrow keys navigate cells. Ctrl+A selects all.
- **Export with no rows**: Export button disabled; tooltip "No orders to export"
- **Long customer names**: Truncated with ellipsis; full name in tooltip on hover
- **Very large order total**: Formatted with $ and commas; right-aligned in cell
- **Slideover close via Escape**: Slides closed; focus returns to triggering row
- **Concurrent edits**: Optimistic update on status change; rollback with toast on conflict
- **Touch device**: Rows have 44px minimum touch target; swipe actions on rows for quick status change
