## Wireframe: WF-V-ITEMS — ItemsView (GridView)

### Layout (ASCII)

```
┌─View Header: "Product Items"              [+ New Item] [⚙ Settings]─────────┐
├─FilterToolbar───────────────────────────────────────────────────────────────┤
│  [▾ Data views] [▾ Keyword ▾] [▾ Category ▾] [▾ Price Range ▾] [▾ Sort ▾]  │
│  [✕ category:produce] [✕ price:5-100] [✕ stock:low]                         │
├─GridSummaryStrip────────────────────────────────────────────────────────────┤
│  [📦 847 items · 23 low stock · 8 out of stock · Avg Price $14.30]          │
├─ViewTabBar──────────────────────────────────────────────────────────────────┤
│  [All (847)] [Active (802)] [Inactive (45)] [Low Stock (23)]                 │
├─AG Grid Table───────────────────────────────────────────────────────────────┤
│  ┌──────┬──────────┬──────────────────┬────────────┬────────┬───────┬──────┐│
│  │  ☐   │ ID       │ Name             │ SKU        │Category│ Price │Stock │ •│
│  ├──────┼──────────┼──────────────────┼────────────┼────────┼───────┼──────┤│
│  │  ☐   │ ITM-001  │ Roma Tomatoes    │ TOM-ROM-25 │Produce │ $28.00│████░░│ ⋮│
│  │  ☑   │ ITM-002  │ Iceberg Lettuce  │ LET-ICE-24 │Produce │ $22.50│██████│ ⋮│
│  │  ☐   │ ITM-003  │ Green Peppers    │ PEP-GRN-24 │Produce │ $18.00│██░░░░│ ⋮│
│  │  ☐   │ ITM-004  │ Navel Oranges    │ ORG-NAV-40 │Citrus  │ $32.00│████░░│ ⋮│
│  │  ☑   │ ITM-005  │ Hass Avocados    │ AVO-HAS-48 │Produce │ $45.00│███░░░│ ⋮│
│  │  ☐   │ ITM-006  │ Red Potatoes     │ POT-RED-50 │Root Veg│ $15.50│██████│ ⋮│
│  │  ☐   │ ITM-007  │ Sweet Corn       │ COR-SWT-48 │Grain   │ $12.00│░░░░░░│ ⋮│
│  └──────┴──────────┴──────────────────┴────────────┴────────┴───────┴──────┘│
├─BulkActionBar (hidden until selection)───────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │  2 selected · Avg Price $33.75   [✏ Edit Category] [🏷 Add Tag] [More▾]│  │
│  └───────────────────────────────────────────────────────────────────────┘   │
├─DetailSlideover (right side, 420px, when row clicked)────────────────────────┤
│  ┌──────────────────────────┐                                               │
│  │ ITM-001 · Roma Tomatoes  │  ◀ Collapse                                  │
│  ├──────────────────────────┤                                               │
│  │ [Details][Pricing]       │                                               │
│  │ [Inventory][Sales Hist]  │                                               │
│  │ [Photos]                 │                                               │
│  ├──────────────────────────┤                                               │
│  │ ▼ Details tab            │                                               │
│  │ ┌──────────────────────┐ │                                               │
│  │ │ Name: Roma Tomatoes  │ │                                               │
│  │ │ SKU:  TOM-ROM-25     │ │                                               │
│  │ │ Category: Produce ▾   │ │  ← ComboboxCellEditor                        │
│  │ │ Unit:  25 lb case    │ │                                               │
│  │ │ UPC:   0-12345-67890 │ │                                               │
│  │ │ ──────────────────── │ │                                               │
│  │ │ Stock Level          │ │                                               │
│  │ │ ████████░░ 82% (205) │ │  ← Inline stock bar                          │
│  │ │ Reorder at: 50       │ │                                               │
│  │ │ Restock qty: 150     │ │                                               │
│  │ └──────────────────────┘ │                                               │
│  │                          │                                               │
│  │ [Edit Item] [Deactivate] │                                               │
│  └──────────────────────────┘                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| View Header            | 100%            | 56px         | Inter 20px bold, flex row      |
| FilterToolbar          | 100%            | 44px + 32px  | Menubar row + active-chip row  |
| GridSummaryStrip       | 100%            | 36px         | Inter 13px, muted background   |
| ViewTabBar             | 100%            | 40px         | Tab height 36px, Inter 13px    |
| AG Grid Table          | 100%            | fills remain | Row height 40px, header 40px   |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom overlay |
| DetailSlideover        | 420px standard  | 100% vh      | Right panel, 280px peek mode   |
| Checkbox column        | 36px            | —            | Centered, 16px checkbox        |
| Stock indicator        | —               | 6px bar      | Green █ ≥ 70%, Yellow 30-69%, Red < 30% |
| Actions column (⋮)     | 44px            | —            | Opens context menu             |

### Interactive Elements

- **[+ New Item]**: Opens create-item modal with fields: Name, SKU, Category (combobox), Unit, Unit Price, Reorder Point, Restock Quantity. Save creates item with Active status.
- **[⚙ Settings]**: Opens GridSettingsPanel slideover (column visibility, sort defaults, density control)
- **[▾ Data views]**: Dropdown of saved filter/column presets — "Default", "All Produce", "Low Stock Items", "Recently Added", plus "Save Current View…"
- **[▾ Keyword ▾]**: Filter popover with text input, searches across Name, SKU, Description
- **[▾ Category ▾]**: Filter popover with multi-select checkboxes — Produce, Citrus, Root Vegetables, Grains, Dairy, Dry Goods, Packaged, Frozen
- **[▾ Price Range ▾]**: Filter popover with min/max currency inputs and presets (≤$10, $10–$25, $25–$50, ≥$50)
- **[▾ Sort ▾]**: Sort popover — "Name A–Z", "Name Z–A", "Price Low–High", "Price High–Low", "Stock Low–High", "Recently Added"
- **[✕ chip]**: Removes that filter; updates grid immediately
- **[Tab: All, Active, Inactive, Low Stock]**: Sets status/stock filter; badge shows count. All = everything; Active = status:active; Inactive = status:inactive; Low Stock = stock level below reorder point
- **[☐ header checkbox]**: Selects all visible rows; indeterminate when partial selection
- **[☐ row checkbox]**: Toggles row selection; updates BulkActionBar
- **[Stock bar cell]**: Inline horizontal bar (6px tall, full cell width). Green foreground bar proportional to stock percentage, grey background. Hover tooltip: "205 in stock / 250 max (82%). Reorder at 50."
- **[⋮ Actions button]**: Opens ContextMenuTrigger — "Edit", "Duplicate", "Deactivate", "View Sales History", "Delete"
- **[DetailSlideover tabs]**: Click switches between Details, Pricing, Inventory, Sales History, Photos panels
- **[◀ Collapse]**: Collapses slideover to 280px peek mode
- **[Details tab]**: Inline-editable fields (Name, SKU, Category ▾, Unit, UPC). Stock level indicator bar. Stock count and reorder point displayed. Edit/Deactivate buttons at bottom.
- **[Pricing tab]**: Base price (editable), price tiers table (qty break → price per unit), margin calculator, last cost field
- **[Inventory tab]**: Current stock, allocated stock, available stock, on-order qty, warehouse location(s) table, stock movement timeline
- **[Sales History tab]**: Mini AG Grid of recent sales orders containing this item, date range filter, quantity sold chart (sparkline)
- **[Photos tab]**: Image gallery grid, upload button, drag-and-drop zone
- **[BulkActionBar: ✏ Edit Category]**: Opens inline dropdown to bulk-set category on selected items
- **[BulkActionBar: 🏷 Add Tag]**: Opens tag picker; adds tag(s) to all selected items
- **[BulkActionBar: More ▾]**: Dropdown with "Deactivate", "Update Reorder Point", "Export Selected", "Delete"

### States Shown

- **Empty**: "No items match your filters. [Clear filters]" — centered illustration + link
- **Loading**: AG Grid skeleton rows (7 shimmer rows, 40px each), tab badges show "—", summary strip shows "Loading…"
- **Filtering**: Active chips appear below menubar; grid re-queries with 300ms debounce
- **Partial selection**: Header checkbox in indeterminate state (dash icon)
- **Bulk selected**: BulkActionBar slides up; shows count + avg price; contextual actions
- **Stock bar (green)**: Stock ≥ 70% of max; green bar (#16a34a equivalent via semantic class)
- **Stock bar (yellow)**: Stock 30–69% of max; amber bar, tooltip shows reorder point gap
- **Stock bar (red)**: Stock < 30% of max or below reorder point; red bar, row gets subtle red left-border accent
- **Out of stock**: Stock bar empty (0%), red left-border accent, item appears in "Low Stock" tab
- **Inactive item**: Row shows dimmed text (50% opacity), status badge "Inactive"
- **Slideover peek (280px)**: Shows item name, SKU, category, price, stock bar
- **Slideover standard (420px)**: Full detail panel with tabs
- **Price tier editing**: Inline table rows with editable qty/price fields; [+ Add Tier] button
- **Photo upload drag**: Drop zone highlights with dashed border on drag-over
- **Error**: Toast notification: "Failed to save item. [Retry]" at top-right
- **Deactivate confirmation**: Dialog: "Deactivate Roma Tomatoes? This item will not appear in new POs or Sales. Existing orders are unaffected."

### ARIA Annotations

- **View Header**: `role="banner"`, `aria-label="Product items view header"`
- **[+ New Item]**: `role="button"`, `aria-label="Create new product item"`, `aria-haspopup="dialog"`
- **[⚙ Settings]**: `role="button"`, `aria-label="Grid settings"`, `aria-haspopup="dialog"`
- **FilterToolbar**: `role="toolbar"`, `aria-label="Filter and sort toolbar"`
- **[▾ Data views]**: `role="combobox"`, `aria-label="Saved data views"`, `aria-expanded="false"`
- **Active chip [✕]**: `role="button"`, `aria-label="Remove filter: category is produce"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="847 items, 23 low stock, 8 out of stock, average price 14 dollars 30 cents"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Item status filters"`
- **Tab [All (847)]**: `role="tab"`, `aria-selected="true"`, `aria-label="All items, 847 total"`
- **Tab [Low Stock (23)]**: `role="tab"`, `aria-selected="false"`, `aria-label="Low stock items, 23 items"`
- **AG Grid Table**: `role="grid"`, `aria-label="Product items table"`, `aria-rowcount="847"`, `aria-multiselectable="true"`
- **Stock bar cell**: `role="gridcell"`, `aria-label="Stock: 205 of 250, 82 percent. Reorder at 50."`
- **⋮ Actions button**: `role="button"`, `aria-label="More actions for Roma Tomatoes ITM-001"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 2 selected items"`, `aria-live="polite"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Item Roma Tomatoes details"`, `aria-modal="false"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Item detail sections"`
- **Slideover tab panel [Details]**: `role="tabpanel"`, `aria-label="Item details"`
- **Category ▾ in slideover**: `role="combobox"`, `aria-label="Category for Roma Tomatoes"`, `aria-expanded="false"`
- **[Edit Item]**: `role="button"`, `aria-label="Edit Roma Tomatoes"`
- **[Deactivate]**: `role="button"`, `aria-label="Deactivate Roma Tomatoes"`
- **Photo upload zone**: `role="button"`, `aria-label="Upload item photo"`, `aria-describedby="photo-upload-hint"`
- **Stock bar**: `role="progressbar"`, `aria-valuenow="82"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Stock level: 82 percent"`

### Edge Cases Handled

- **Zero items in system**: Empty state with "Create your first item" CTA button; tabs all show 0
- **Zero results after filter**: "No items match your filters" with illustration and "Clear filters" link
- **Very long item names**: Truncated with ellipsis at 220px; full name in tooltip on hover
- **Very many items (5000+)**: AG Grid virtualizes; FilterToolbar search debounced 300ms; summary strip stays accurate
- **Stock at exactly reorder point**: Shown as yellow bar at 0% visible but not red; "At reorder point" tooltip
- **Item with zero max stock**: Stock bar shows "—" (no max defined); inline text "205 in stock (no max)"
- **Null/empty SKU**: Cell shows "—" in muted text; still searchable by name
- **Photo upload exceeds size limit**: Inline error "File must be under 5MB. Current: 7.2MB."
- **Unsaved slideover changes**: If fields edited and user clicks away, confirmation dialog: "You have unsaved changes. Discard?"
- **Bulk deactivate with active orders**: Warning dialog: "4 of 5 selected items appear in open purchase orders. Deactivating will not remove them from existing orders."
- **Concurrent edit conflict**: Optimistic update on slideover save; rollback with toast on conflict
- **Keyboard navigation**: Tab through toolbar → grid → slideover. Space toggles checkbox. Ctrl+A selects all visible. Arrow keys navigate cells.
- **Touch device**: 44px minimum touch targets; swipe actions for quick deactivate
- **Export with no rows**: Export button hidden (not disabled)
