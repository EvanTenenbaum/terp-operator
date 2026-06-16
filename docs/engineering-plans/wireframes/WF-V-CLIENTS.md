## Wireframe: WF-V-CLIENTS — ClientsView

### Layout (ASCII)

```
┌─View Header: "Clients"                     [+ Add Client ▾] [⚙ Settings]──┐
├─FilterToolbar──────────────────────────────────────────────────────────────┤
│  [▾ Data views] │ [▾ Keyword ▾] [▾ Credit ▾] [▾ Status ▾] [▾ Last Order ▾]│
│                 │ [▾ Sort ▾] [⬇ Export]                                   │
│  [✕ credit:pending-review] [✕ status:past-due]                             │
├─GridSummaryStrip───────────────────────────────────────────────────────────┤
│  [👤 Total: 56 clients · 42 Active · $87,500 Total AR · 3 Past Due]       │
├─ViewTabBar─────────────────────────────────────────────────────────────────┤
│  [All (56)] [Active (42)] [Past Due (3)] [Inactive (11)]                   │
├─AG Grid Table──────────────────────────────────────────────────────────────┤
│  ┌──────┬─────────┬────────────┬─────────────────┬───────┬──────────┬────┐│
│  │  ☐   │ ID      │ Name       │ Contact         │Balance│ Credit   │Last│•│││
│  ├──────┼─────────┼────────────┼─────────────────┼───────┼──────────┼────┤│
│  │  ☐   │ CLT-319 │ Whole Foods │ buyer@wf.com    │$12,400│ Approved │6/15│⋮ ││
│  │  ☑   │ CLT-318 │ Kroger     │ ap@kroger.com   │ $5,200│ Approved │6/14│⋮ ││
│  │  ☑   │ CLT-317 │ Trader Joes│ orders@tjs.com  │ $8,800│ Pending  │6/12│⋮ ││
│  │  ☐   │ CLT-316 │ Publix     │ apricot@pub.com │$22,800│ Approved │6/10│⋮ ││
│  │  ☐   │ CLT-315 │ Safeway    │ buyer@safeway.. │     $0│ Inactive │3/02│⋮ ││
│  │  ☑   │ CLT-314 │ Costco     │ orders@costco.. │ $3,150│ Approved │6/11│⋮ ││
│  │  ☐   │ CLT-313 │ Walmart    │ acct@walmart..  │$15,300│ Past Due │6/08│⋮ ││
│  └──────┴─────────┴────────────┴─────────────────┴───────┴──────────┴────┘│
├─BulkActionBar (hidden until selection)─────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 3 selected · $17,150 AR   [📧 Email] [🏷 Tag] [More ▾]              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
├─DetailSlideover (right side, 420px, when row clicked)──────────────────────┤
│  ┌───────────────────────────┐                                              │
│  │ CLT-318 · Kroger          │  ◀ Collapse                                 │
│  ├───────────────────────────┤                                              │
│  │ [Profile] [Orders]        │                                              │
│  │ [Payments] [History]      │                                              │
│  ├───────────────────────────┤                                              │
│  │ Client Profile            │                                              │
│  │ ┌───────────────────────┐ │                                              │
│  │ │ Company    Kroger     │ │                                              │
│  │ │ Contact    Jane Smith │ │                                              │
│  │ │ Email      ap@kroger..│ │                                              │
│  │ │ Phone      (555) 123..│ │                                              │
│  │ │ Credit     Approved   │ │                                              │
│  │ │ Limit      $50,000    │ │                                              │
│  │ │ Balance    $5,200     │ │                                              │
│  │ │ Available  $44,800    │ │                                              │
│  │ │ Terms      Net 30     │ │                                              │
│  │ │ Since      2023-01    │ │                                              │
│  │ └───────────────────────┘ │                                              │
│  │                           │                                              │
│  │ Recent Orders (3)         │                                              │
│  │ ┌───────────────────────┐ │                                              │
│  │ │ SO-1041  $8,200 6/14  │ │                                              │
│  │ │ SO-1035  $3,100 6/10  │ │                                              │
│  │ │ SO-1028  $6,500 6/05  │ │                                              │
│  │ └───────────────────────┘ │                                              │
│  │                           │                                              │
│  │ [Edit] [New Order]        │                                              │
│  └───────────────────────────┘                                              │
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
| Balance column         | —               | —            | Right-aligned, tabular nums    |
| Credit Status cell     | —               | —            | Color badge: green (Approved), amber (Pending), red (Past Due), gray (Inactive) |
| Actions column (•••)   | 44px            | —            | Opens context menu             |

### Interactive Elements

- **[+ Add Client ▾]**: Split button — opens create-client modal; arrow opens "Add Client", "Import Clients", "Request Credit App"
- **[⚙ Settings]**: Opens GridSettingsPanel slideover (column visibility, sort defaults, density)
- **[▾ Data views]**: Dropdown — "All Clients", "Active Clients", "Past Due", "Credit Pending", "My Accounts"
- **[▾ Keyword ▾]**: Filter popover with text input; searches across Name, Contact, Email, Phone, Notes
- **[▾ Credit ▾]**: Filter popover with checkboxes — Approved, Pending Review, Denied, On Hold
- **[▾ Status ▾]**: Filter popover with checkboxes — Active, Past Due, Inactive, Suspended
- **[▾ Last Order ▾]**: Filter popover with date-range picker — "Last 7 Days", "Last 30 Days", "Last 90 Days", "No Orders", Custom
- **[▾ Sort ▾]**: "Name A–Z" (default), "Name Z–A", "Balance High–Low", "Balance Low–High", "Last Order Newest", "Oldest Client"
- **[⬇ Export]**: Exports visible rows as CSV; spinner during generation
- **[✕ chip]**: Removes that filter; updates grid immediately
- **[Tab: All, Active, Past Due, Inactive]**: Sets status filter; badge shows count
- **[☐ header checkbox]**: Selects all visible; indeterminate on partial selection
- **[☐ row checkbox]**: Toggles row selection; updates BulkActionBar
- **[Credit Status cell]**: Color-coded badge — green (Approved), amber (Pending Review), red (Past Due/Denied), gray (Inactive). Click opens credit details panel
- **[Balance cell]**: Right-aligned; negative balances shown in red; Past Due clients show balance in red text
- **[Client Name cell]**: Click opens DetailSlideover; underline on hover indicates link behavior
- **[Last Order cell]**: Shows date; "No orders" in muted text for inactive clients
- **[⋮ Actions]**: Context menu — "View Profile", "Edit", "New Order", "Record Payment", "Credit Review", "Deactivate"
- **[DetailSlideover tabs]**: Switch between Profile, Orders, Payments, History panels
- **[◀ Collapse]**: Collapses slideover to 280px peek mode
- **[Edit button]**: Opens client edit modal
- **[New Order button]**: Opens create order modal pre-filled with this client
- **[BulkActionBar: 📧 Email]**: Opens email compose with selected clients' contacts; requires at least one client with email
- **[BulkActionBar: 🏷 Tag]**: Opens tag assignment popover for bulk tagging
- **[BulkActionBar: More ▾]**: Dropdown — "Credit Review", "Export Selected", "Merge Clients", "Deactivate Selected"

### States Shown

- **Empty**: "No clients match your filters. [Clear filters]" — centered illustration
- **Loading**: Skeleton rows (6 shimmer rows, 32px each); tab badges show "—"
- **Filtering**: Active chips appear; grid re-queries with 300ms debounce
- **Partial selection**: Header checkbox indeterminate
- **Bulk selected**: BulkActionBar slides up; shows count + total AR; actions contextual
- **Past Due row**: Row has subtle red left-border accent; balance in red text; Status badge red
- **Credit Pending row**: Row has amber left-border accent; Status badge amber with "Pending Review"
- **Inactive row**: Row slightly dimmed (opacity 0.7); Last Order shows "N/A" or old date
- **Slideover peek (280px)**: Shows client ID, name, balance, credit status badge
- **Slideover open (420px)**: Full profile with tabs
- **Credit near limit**: Balance bar shows percentage; > 80% shows amber; > 95% shows red
- **Zero balance client**: Balance shows "$0.00" in muted text
- **Negative balance (credit owed to client)**: Amount in red with parentheses
- **Export in progress**: Button shows spinner + "Generating…"; disabled during export
- **Error**: Toast: "Failed to load clients. [Retry]" at top-right

### ARIA Annotations

- **View Header**: `role="banner"`, `aria-label="Clients view header"`
- **[+ Add Client ▾]**: `role="button"`, `aria-haspopup="menu"`, `aria-label="Add new client"`
- **[⚙ Settings]**: `role="button"`, `aria-label="Grid settings"`, `aria-haspopup="dialog"`
- **FilterToolbar**: `role="toolbar"`, `aria-label="Filter and sort toolbar"`
- **[▾ Credit ▾]**: `role="combobox"`, `aria-label="Filter by credit status"`, `aria-expanded="false"`
- **[▾ Last Order ▾]**: `role="combobox"`, `aria-label="Filter by last order date"`, `aria-expanded="false"`
- **Active chip [✕]**: `role="button"`, `aria-label="Remove filter: credit status is pending review"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="56 clients, 42 active, 87,500 dollars total AR, 3 past due"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Client status filters"`
- **Tab [Past Due (3)]**: `role="tab"`, `aria-selected="false"`, `aria-label="Past due clients, 3 items"`
- **AG Grid Table**: `role="grid"`, `aria-label="Clients table"`, `aria-rowcount="56"`, `aria-multiselectable="true"`
- **Header checkbox**: `role="columnheader"`, `aria-label="Select all rows"`
- **Row checkbox**: `role="gridcell"`, `aria-selected="true"` when checked
- **Credit Status cell**: `role="gridcell"`, `aria-label="Credit status: Approved. Click for details."`
- **Balance cell (Past Due)**: `role="gridcell"`, `aria-label="Balance $5,200, past due warning"`
- **⋮ Actions**: `role="button"`, `aria-label="More actions for CLT-318"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 3 selected clients"`, `aria-live="polite"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Client CLT-318 Kroger details"`, `aria-modal="false"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Client detail sections"`
- **Orders tab panel**: `role="tabpanel"`, `aria-label="Recent orders for Kroger"`
- **[Edit]**: `role="button"`, `aria-label="Edit client profile"`
- **[New Order]**: `role="button"`, `aria-label="Create new order for Kroger"`
- **Credit utilization bar**: `role="progressbar"`, `aria-label="Credit utilization 10 percent"`, `aria-valuenow="10"`, `aria-valuemin="0"`, `aria-valuemax="100"`
- **Export spinner**: `role="progressbar"`, `aria-label="Exporting clients"`

### Edge Cases Handled

- **Zero results**: Empty state with "Clear filters"; summary strip shows "0 clients · $0"
- **All rows selected**: Header checkbox fully checked; BulkActionBar shows full count + total AR
- **Deselect all**: BulkActionBar slides down; hidden when count = 0
- **Client with no orders**: Last Order column shows "No orders" in muted text; Orders tab in slideover shows empty state "No orders yet"
- **Client with no email**: "Email" bulk action disabled for that client; tooltip "Client has no email address"
- **Past Due + Active orders**: Row shows red balance highlight AND green status badge for active orders
- **Credit limit exceeded**: Balance > limit; red warning badge "Over Limit" appears; credit bar at 100% red
- **Client merge**: "Merge Clients" bulk action opens merge wizard — select primary, map fields from secondary
- **Client deactivation**: Confirmation dialog warns "Deactivating will not cancel open orders"
- **DetailSlideover open + bulk selection**: Slideover stays; bulk selection independent
- **Keyboard navigation**: Tab through toolbar → grid → slideover. Enter on client name opens slideover. Space toggles checkbox. Arrow keys navigate cells.
- **Export with no rows**: Button disabled; tooltip "No clients to export"
- **Long company names**: Truncated with ellipsis; full name in tooltip
- **Large balance values**: Formatted with $ and commas; right-aligned; negative in red with parentheses
- **Slideover close via Escape**: Focus returns to triggering row
- **Concurrent edits**: Optimistic update on profile edit; rollback with toast on conflict
- **Touch device**: 44px minimum row touch target; swipe to quickly view profile
