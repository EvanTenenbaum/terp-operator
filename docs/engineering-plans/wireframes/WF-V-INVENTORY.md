## Wireframe: WF-V-INVENTORY — InventoryView

### UX Posture

The inventory table is the only primary surface. Status filter is a pill in the FilterToolbar (no ViewTabBar). Low-stock and out-of-stock states are conveyed at the row level via cell styling and status state — no permanent "low stock" panel. The detail slide-over opens on demand for movement, sales, photos.

### Layout (ASCII)

```
┌─FilterToolbar───────────────────────────────────────────────────────────────┐
│  [+ Receive Stock ▾] │ Status ▾ │ Data views │ Keyword │ Location │ Category│
│                      │ Sort ▾ │ Export ▾                                    │
│  [✕ location:warehouse-a] [✕ status:available] [✕ category:produce]         │
├─KPI Line────────────────────────────────────────────────────────────────────┤
│  847 items · $312,400 value · 12 low stock · 3 out of stock                 │
│                                                       [Show breakdown ▾]    │
├─AG Grid Table───────────────────────────────────────────────────────────────┤
│  ┌──────┬─────────┬──────────────┬──────────┬─────┬──────────┬────────┬───┐│
│  │  ☐   │ ID      │ Batch        │ Product  │ Qty │ Location │ Status │ ⋮ │
│  ├──────┼─────────┼──────────────┼──────────┼─────┼──────────┼────────┼───┤│
│  │  ☐   │ INV-5502│ BTH-FJ-0615  │ Apples   │ 200 │ WH-A     │Avail ▾ │ ⋮ │
│  │  ☑   │ INV-5501│ BTH-GA-0614  │ Oranges  │ 150 │ WH-B     │Resvd ▾ │ ⋮ │
│  │  ☑   │ INV-5500│ BTH-HC-0613  │ Bananas  │  85 │ WH-A     │Avail ▾ │ ⋮ │
│  │  ☐   │ INV-5499│ BTH-ID-0612  │ Grapes   │   5 │ WH-C     │Low ▾   │ ⋮ │
│  │  ☑   │ INV-5498│ BTH-JE-0611  │ Tomatoes │ 300 │ WH-B     │Avail ▾ │ ⋮ │
│  │  ☐   │ INV-5497│ BTH-KF-0610  │ Lettuce  │   0 │ WH-A     │Out ▾   │ ⋮ │
│  │  ☐   │ INV-5496│ BTH-LA-0609  │ Potatoes │ 500 │ WH-C     │Avail ▾ │ ⋮ │
│  └──────┴─────────┴──────────────┴──────────┴─────┴──────────┴────────┴───┘│
│                       (row height: 32px Mercury standard)                   │
├─BulkActionBar (appears only when rows selected)─────────────────────────────┤
│  3 selected · 535 units   [Transfer] [Tag] [More ▾]                         │
└─────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Details | Movement | Sales | Photos
  Footer actions (state-gated):
    Available → [Adjust] [Transfer] [Mark Damaged]
    Reserved  → [Release] [Adjust] [Transfer]
    Sold      → [View Sale] [View Documents]
    On Hold   → [Release] [Mark Damaged]
    Damaged   → [Re-evaluate] [Discard]
```

### State-Gated Action Surface

| Inventory State | Visible Actions                              |
|-----------------|----------------------------------------------|
| Available       | `Adjust`, `Transfer`, `Mark Damaged`, `Reserve` |
| Reserved        | `Release`, `Adjust`, `Transfer`              |
| Sold            | `View Sale`, `View Documents`                |
| On Hold         | `Release`, `Mark Damaged`                    |
| Damaged         | `Re-evaluate`, `Discard`                     |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| FilterToolbar          | 100%            | 44px + 32px  | Menubar + active-chip row       |
| KPI line               | 100%            | 32px / ~96px expanded | Inter 13px |
| AG Grid Table          | 100%            | fills remain | Row height 32px                |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom         |
| Slide-over             | 420px standard  | 100% vh      | 280px peek mode                |
| Checkbox column        | 36px            | —            | Centered                       |
| Qty column             | 64px            | —            | Right-aligned, tabular nums    |
| Status combo cell      | —               | 28px popover | ComboboxCellEditor on dblclick |

### Interactive Elements

- **[+ Receive Stock ▾]**: Split button — opens receive-stock slide-over; arrow opens "Receive Stock", "Bulk Receive", "Adjustment".
- **Status ▾ pill**: Multi-select popover with `Available (690)`, `Reserved (112)`, `Sold (45)`, `On Hold`, `Damaged`, `Low Stock`, `Out of Stock`. Replaces prior ViewTabBar.
- **FilterToolbar**: Data views, Keyword, Location (hierarchical tree), Category (multi-select).
- **Status cell**: ComboboxCellEditor on dblclick. Valid transitions only.
- **Location cell**: Shows pin icon; hover tooltip with full location path.
- **Qty cell**: Low stock (≤10) shown in warning state; out of stock (0) shown in error state with "Out" status.
- **⋮ Actions**: Context menu — state-gated entries only.
- **Slide-over tabs**: Details, Movement, Sales, Photos.
- **BulkActionBar**: Transfer disabled (or absent) if items are in different warehouses — only intersection of valid actions.

### States Shown

- **Default**: Inventory table only. No slide-over. Status ▾ defaults to all available + reserved.
- **Filtering**: Active chips appear.
- **Bulk selected**: BulkActionBar slides up.
- **Low stock row**: Warning-state highlight on qty cell; status "Low."
- **Out of stock row**: Error-state highlight; qty 0; status "Out"; row slightly dimmed.
- **Slide-over peek (280px)**: ID, product, qty, location, status badge.
- **Slide-over open (420px)**: Full detail with tabs.
- **Expiring item**: Warning badge next to expiration date when < 7 days.
- **Status cell editing**: ComboboxCellEditor open.
- **Export in progress**: Button shows spinner.
- **Error**: Toast at top-right.
- **Stock adjustment confirmation**: Modal with before/after qty preview and reason required.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Inventory filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by inventory status"`, `aria-multiselectable="true"`
- Active chip [✕]: `role="button"`, `aria-label="Remove filter: location is warehouse-a"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="847 items, 312,400 dollars value, 12 low stock, 3 out of stock"`
- AG Grid Table: `role="grid"`, `aria-label="Inventory table"`, `aria-rowcount="847"`, `aria-multiselectable="true"`
- Low stock qty cell: `role="gridcell"`, `aria-label="5 units, low stock warning"`
- Out of stock qty cell: `role="gridcell"`, `aria-label="0 units, out of stock"`
- Status ▾: `role="gridcell"`, `aria-label="Status, Available. Double-click to edit."`
- ⋮ Actions: `role="button"`, `aria-label="More actions for INV-5501"`, `aria-haspopup="menu"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions for 3 selected items"`
- Slide-over: `role="dialog"`, `aria-label="Inventory item INV-5501 details"`, `aria-modal="false"`
- Slide-over tabs: `role="tablist"`, `aria-label="Inventory detail sections"`
- Expiration warning: `role="alert"`, `aria-label="Item expires in 5 days"`

### Edge Cases Handled

- **Zero results**: Empty state with "Clear filters"; KPI line "0 items · $0".
- **All rows selected**: Header checkbox fully checked.
- **Low stock threshold**: Configurable per category; default ≤10 units.
- **Out of stock**: Qty = 0; row dimmed; status forced to "Out."
- **Bulk transfer across locations**: `Transfer` absent if items in different warehouses (state gating).
- **Slide-over + bulk selection**: Both work independently.
- **Photos tab empty**: "No photos uploaded. [+ Upload Photos]" with drag-and-drop zone.
- **Movement history empty**: "No movement recorded yet."
- **Expiration date proximity**: < 7 days warning; < 2 days error with "EXPIRING" label.
- **Adjustment to zero**: Modal warning: "Setting quantity to zero will mark this item as Out of Stock."
- **Keyboard navigation**: Tab through toolbar → grid → slide-over.
- **Concurrent edits**: Optimistic update; rollback with toast.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Actions per inventory state. |
| UX-2: Supporting info one click away, never zero | ✓ | Movement, sales, photos as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Inventory table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Low/out at the cell. No permanent low-stock panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Receive stock, transfer in slide-overs. Adjust-to-zero modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, status state encoded in row styling. |
| UX-8: State changes resolve in place | ✓ | Adjust/Transfer updates row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save. Adjustment form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over item ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty inventory → CTA. Empty filtered → Clear filters. |
