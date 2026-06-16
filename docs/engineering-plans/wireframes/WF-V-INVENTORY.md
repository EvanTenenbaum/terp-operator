## Wireframe: WF-V-INVENTORY — InventoryView

### Layout (ASCII)

```
┌─View Header: "Inventory"                 [+ Receive Stock ▾] [⚙ Settings]──┐
├─FilterToolbar───────────────────────────────────────────────────────────────┤
│  [▾ Data views] │ [▾ Keyword ▾] [▾ Status ▾] [▾ Location ▾] [▾ Category ▾]│
│                 │ [▾ Sort ▾] [⬇ Export]                                   │
│  [✕ location:warehouse-a] [✕ status:available] [✕ category:produce]        │
├─GridSummaryStrip────────────────────────────────────────────────────────────┤
│  [📦 Total: 847 items · $312,400 value · 12 Low Stock · 3 Out of Stock]    │
├─ViewTabBar──────────────────────────────────────────────────────────────────┤
│  [All (847)] [Available (690)] [Reserved (112)] [Sold (45)]                  │
├─AG Grid Table───────────────────────────────────────────────────────────────┤
│  ┌──────┬─────────┬──────────────┬──────────┬─────┬──────────┬────────┬───┐│
│  │  ☐   │ ID      │ Batch        │ Product  │ Qty │ Location │ Status │•│││
│  ├──────┼─────────┼──────────────┼──────────┼─────┼──────────┼────────┼───┤│
│  │  ☐   │ INV-5502│ BTH-FJ-0615  │ Apples   │ 200 │ WH-A     │Avail ▾ │⋮ ││
│  │  ☑   │ INV-5501│ BTH-GA-0614  │ Oranges  │ 150 │ WH-B     │Resvd ▾ │⋮ ││
│  │  ☑   │ INV-5500│ BTH-HC-0613  │ Bananas  │  85 │ WH-A     │Avail ▾ │⋮ ││
│  │  ☐   │ INV-5499│ BTH-ID-0612  │ Grapes   │   5 │ WH-C     │Low! ▾  │⋮ ││
│  │  ☑   │ INV-5498│ BTH-JE-0611  │ Tomatoes │ 300 │ WH-B     │Avail ▾ │⋮ ││
│  │  ☐   │ INV-5497│ BTH-KF-0610  │ Lettuce  │   0 │ WH-A     │Out! ▾  │⋮ ││
│  │  ☐   │ INV-5496│ BTH-LA-0609  │ Potatoes │ 500 │ WH-C     │Avail ▾ │⋮ ││
│  └──────┴─────────┴──────────────┴──────────┴─────┴──────────┴────────┴───┘│
├─BulkActionBar (hidden until selection)──────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ 3 selected · 535 units   [📦 Transfer] [🏷 Tag] [More ▾]             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
├─DetailSlideover (right side, 420px, when row clicked)───────────────────────┤
│  ┌──────────────────────────┐                                               │
│  │ INV-5501 · BTH-GA-0614   │  ◀ Collapse                                  │
│  ├──────────────────────────┤                                               │
│  │ [Details][Movement]      │                                               │
│  │ [Sales][Photos]          │                                               │
│  ├──────────────────────────┤                                               │
│  │ Item Details             │                                               │
│  │ ┌──────────────────────┐ │                                               │
│  │ │ Product    Oranges   │ │                                               │
│  │ │ Category   Produce   │ │                                               │
│  │ │ Qty        150 cases │ │                                               │
│  │ │ Location   WH-B-A12  │ │                                               │
│  │ │ Status     Reserved  │ │                                               │
│  │ │ Received   6/14/26   │ │                                               │
│  │ │ Expires    7/14/26   │ │                                               │
│  │ │ Cost/unit  $14.50    │ │                                               │
│  │ │ Total val  $2,175    │ │                                               │
│  │ └──────────────────────┘ │                                               │
│  │                          │                                               │
│  │ Recent Movement (3)      │                                               │
│  │ ┌──────────────────────┐ │                                               │
│  │ │ 6/14 +150  Received  │ │                                               │
│  │ │ 6/12  -50  Reserved  │ │                                               │
│  │ │ 6/10 +100  Adjusted  │ │                                               │
│  │ └──────────────────────┘ │                                               │
│  │                          │                                               │
│  │ [Adjust] [Transfer]      │                                               │
│  └──────────────────────────┘                                               │
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
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom         |
| DetailSlideover        | 420px standard  | 100% vh      | Right panel, 280px peek mode   |
| Checkbox column        | 36px            | —            | Centered, 16px checkbox        |
| Qty column             | 64px            | —            | Right-aligned, tabular nums    |
| Status combo cell      | —               | 28px popover | ComboboxCellEditor on dblclick |
| Actions column (•••)   | 44px            | —            | Opens context menu             |

### Interactive Elements

- **[+ Receive Stock ▾]**: Split button — opens receive-stock modal; arrow opens "Receive Stock", "Bulk Receive", "Adjustment"
- **[⚙ Settings]**: Opens GridSettingsPanel slideover (column visibility, sort defaults, density)
- **[▾ Data views]**: Dropdown — "All Inventory", "Low Stock Items", "Expiring Soon", "Warehouse A Only"
- **[▾ Keyword ▾]**: Filter popover with single text input; searches across ID, Batch, Product name, Notes
- **[▾ Status ▾]**: Filter popover with checkboxes — Available, Reserved, Sold, On Hold, Damaged
- **[▾ Location ▾]**: Filter popover with hierarchical location tree — Warehouse → Zone → Aisle → Bin
- **[▾ Category ▾]**: Filter popover with checkboxes — Produce, Dairy, Dry Goods, Beverage, Frozen, Packaging
- **[▾ Sort ▾]**: "Newest First", "Oldest First", "Product A–Z", "Qty Low–High" (default for Low Stock view), "Qty High–Low"
- **[⬇ Export]**: Exports visible rows as CSV; spinner during generation
- **[✕ chip]**: Removes that filter; updates grid immediately
- **[Tab: All, Available, Reserved, Sold]**: Sets status filter; badge shows count
- **[☐ header checkbox]**: Selects all visible; indeterminate on partial selection
- **[☐ row checkbox]**: Toggles row selection; updates BulkActionBar
- **[Status cell ▾]**: Double-click opens ComboboxCellEditor (Available, Reserved, Sold, On Hold, Damaged). Enter to confirm, Escape to close, Arrow keys to navigate
- **[Location cell]**: Single-click shows pin icon; hover shows tooltip with full location path
- **[Qty cell]**: Low stock (≤10) shown in amber; out of stock (0) shown in red with "Out!" status
- **[⋮ Actions]: Context menu — "View Details", "Adjust Quantity", "Transfer", "Mark Damaged", "Print Label", "View Photos"
- **[DetailSlideover tabs]**: Switch between Details, Movement, Sales, Photos panels
- **[◀ Collapse]**: Collapses slideover to 280px peek mode
- **[Adjust button]**: Opens quantity adjustment modal with reason dropdown and notes
- **[Transfer button]**: Opens transfer modal — select destination location + quantity
- **[BulkActionBar: 📦 Transfer]**: Bulk transfer selected items to a location
- **[BulkActionBar: 🏷 Tag]**: Opens tag assignment popover
- **[BulkActionBar: More ▾]**: Dropdown — "Print Labels", "Export Selected", "Mark Damaged", "Cycle Count"

### States Shown

- **Empty**: "No inventory items match your filters. [Clear filters]" — centered illustration
- **Loading**: Skeleton rows (6 shimmer rows, 32px each); tab badges show "—"
- **Filtering**: Active chips appear; grid re-queries with 300ms debounce
- **Partial selection**: Header checkbox indeterminate
- **Bulk selected**: BulkActionBar slides up; shows count + total units
- **Low stock row**: Amber background highlight on qty cell; qty ≤ 10; Status shows "Low!"
- **Out of stock row**: Red background highlight; qty = 0; Status shows "Out!"; row slightly dimmed
- **Slideover peek (280px)**: Shows item ID, product, qty, location, status badge
- **Slideover open (420px)**: Full detail panel with tabs
- **Expiring item**: Detail view shows amber warning badge next to expiration date when < 7 days
- **Status cell editing**: ComboboxCellEditor open; inline popover with options
- **Export in progress**: Button shows spinner + "Generating…"; disabled during export
- **Error**: Toast: "Failed to load inventory. [Retry]" at top-right
- **Stock adjustment confirmation**: Modal with before/after qty preview and reason required
- **Transfer in progress**: Source row shows animated "moving" indicator during transfer

### ARIA Annotations

- **View Header**: `role="banner"`, `aria-label="Inventory view header"`
- **[+ Receive Stock ▾]**: `role="button"`, `aria-haspopup="menu"`, `aria-label="Receive new stock"`
- **[⚙ Settings]**: `role="button"`, `aria-label="Grid settings"`, `aria-haspopup="dialog"`
- **FilterToolbar**: `role="toolbar"`, `aria-label="Filter and sort toolbar"`
- **[▾ Location ▾]**: `role="combobox"`, `aria-label="Filter by warehouse location"`, `aria-expanded="false"`
- **[▾ Category ▾]**: `role="combobox"`, `aria-label="Filter by product category"`, `aria-expanded="false"`
- **Active chip [✕]**: `role="button"`, `aria-label="Remove filter: location is warehouse-a"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="847 items, 312,400 dollars value, 12 low stock, 3 out of stock"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Inventory status filters"`
- **Tab [Available (690)]**: `role="tab"`, `aria-selected="true"`, `aria-label="Available inventory, 690 items"`
- **AG Grid Table**: `role="grid"`, `aria-label="Inventory table"`, `aria-rowcount="847"`, `aria-multiselectable="true"`
- **Header checkbox**: `role="columnheader"`, `aria-label="Select all rows"`
- **Row checkbox**: `role="gridcell"`, `aria-selected="true"` when checked
- **Low stock qty cell**: `role="gridcell"`, `aria-label="5 units, low stock warning"`
- **Out of stock qty cell**: `role="gridcell"`, `aria-label="0 units, out of stock"`
- **Status ▾**: `role="gridcell"`, `aria-label="Status, Available. Double-click to edit."`
- **⋮ Actions**: `role="button"`, `aria-label="More actions for INV-5501"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 3 selected items"`, `aria-live="polite"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Inventory item INV-5501 details"`, `aria-modal="false"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Inventory detail sections"`
- **Photos tab panel**: `role="tabpanel"`, `aria-label="Product photos"`
- **[Adjust]**: `role="button"`, `aria-label="Adjust inventory quantity"`
- **[Transfer]**: `role="button"`, `aria-label="Transfer inventory to another location"`
- **Expiration warning**: `role="alert"`, `aria-label="Item expires in 5 days"`
- **Export spinner**: `role="progressbar"`, `aria-label="Exporting inventory"`

### Edge Cases Handled

- **Zero results**: Empty state with "Clear filters"; summary strip shows "0 items · $0"
- **All rows selected**: Header checkbox fully checked; BulkActionBar shows full count
- **Deselect all**: BulkActionBar slides down; hidden when count = 0
- **Low stock threshold**: Configurable per category; default ≤10 units; amber highlight on row
- **Out of stock**: Qty = 0; red highlight; row slightly dimmed (opacity 0.6); status forced to "Out!"
- **Bulk transfer across locations**: "Transfer" disabled if selected items are in different warehouses; tooltip "Selected items are in different locations"
- **DetailSlideover open + bulk selection**: Slideover stays open; bulk selection operates independently
- **Photos tab empty**: Shows "No photos uploaded. [+ Upload Photos]" with drag-and-drop zone
- **Movement history empty**: Shows "No movement recorded yet"
- **Expiration date proximity**: < 7 days shows amber badge; < 2 days shows red badge with "EXPIRING" label
- **Adjustment to zero**: Warning dialog "Setting quantity to zero will mark this item as Out of Stock"
- **Keyboard navigation**: Tab through toolbar → grid → slideover. Enter opens slideover. Space toggles checkbox. Arrow keys navigate cells.
- **Export with no rows**: Button disabled; tooltip "No items to export"
- **Long product names**: Truncated with ellipsis; full name in tooltip
- **Large quantity values**: Formatted with commas; right-aligned; thousands separator
- **Slideover close via Escape**: Focus returns to triggering row
- **Concurrent edits**: Optimistic update on quantity; rollback with toast on conflict
- **Touch device**: 44px minimum row touch target; swipe to adjust qty quickly
