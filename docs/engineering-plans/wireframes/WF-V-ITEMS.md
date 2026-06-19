## Wireframe: WF-V-ITEMS — ItemsView (GridView)

### UX Posture

The items table is the only primary surface. Status filter (Active / Inactive / Low Stock) is a pill in the FilterToolbar — no ViewTabBar. Low-stock state is conveyed at the row level via inline stock bar and status state. Pricing, inventory, sales history, and photos live in the slide-over.

### Layout (ASCII)

```
┌─FilterToolbar───────────────────────────────────────────────────────────────┐
│  [+ New Item] │ Status ▾ │ Data views │ Keyword │ Category │ Price Range │ │
│               │ Sort ▾ │ Export ▾                                          │
│  [✕ category:produce] [✕ price:5-100] [✕ stock:low]                        │
├─KPI Line────────────────────────────────────────────────────────────────────┤
│  847 items · 23 low stock · 8 out of stock · Avg price $14.30               │
│                                                       [Show breakdown ▾]    │
├─AG Grid Table───────────────────────────────────────────────────────────────┤
│  ┌──────┬──────────┬──────────────────┬────────────┬────────┬───────┬──────┐│
│  │  ☐   │ ID       │ Name             │ SKU        │Category│ Price │Stock │
│  ├──────┼──────────┼──────────────────┼────────────┼────────┼───────┼──────┤│
│  │  ☐   │ ITM-001  │ Roma Tomatoes    │ TOM-ROM-25 │Produce │ $28.00│████░░│
│  │  ☑   │ ITM-002  │ Iceberg Lettuce  │ LET-ICE-24 │Produce │ $22.50│██████│
│  │  ☐   │ ITM-003  │ Green Peppers    │ PEP-GRN-24 │Produce │ $18.00│██░░░░│
│  │  ☐   │ ITM-004  │ Navel Oranges    │ ORG-NAV-40 │Citrus  │ $32.00│████░░│
│  │  ☑   │ ITM-005  │ Hass Avocados    │ AVO-HAS-48 │Produce │ $45.00│███░░░│
│  │  ☐   │ ITM-006  │ Red Potatoes     │ POT-RED-50 │Root Veg│ $15.50│██████│
│  │  ☐   │ ITM-007  │ Sweet Corn       │ COR-SWT-48 │Grain   │ $12.00│░░░░░░│
│  └──────┴──────────┴──────────────────┴────────────┴────────┴───────┴──────┘│
│                       (row height: 32px Mercury standard)                    │
├─BulkActionBar (appears only when rows selected)─────────────────────────────┤
│  2 selected · Avg Price $33.75   [Edit Category] [More ▾: Tag | Deactivate] │
└─────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Details | Pricing | Inventory | Sales History | Photos
  Footer actions (state-gated):
    Active   → [Edit Item] [Adjust Stock] [Deactivate]
    Inactive → [Reactivate]
    Low Stock→ [Order More] [Adjust Stock] [Edit Item]
```

### State-Gated Action Surface

| Item State    | Visible Actions                              |
|---------------|----------------------------------------------|
| Active        | `Edit Item`, `Adjust Stock`, `Deactivate`    |
| Inactive      | `Reactivate`                                 |
| Low Stock     | `Order More`, `Adjust Stock`, `Edit Item`    |
| Out of Stock  | `Order More`, `Adjust Stock`, `Edit Item`    |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| FilterToolbar          | 100%            | 44px + 32px  | Menubar + active-chip row      |
| KPI line               | 100%            | 32px / ~96px expanded | Inter 13px |
| AG Grid Table          | 100%            | fills remain | Row height 32px                |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom         |
| Slide-over             | 420px standard  | 100% vh      | 280px peek mode                |
| Stock indicator        | —               | 6px bar      | Color encodes state            |

### Interactive Elements

- **[+ New Item]**: Opens item creation slide-over.
- **Status ▾ pill**: Multi-select with `Active (802)`, `Inactive (45)`, `Low Stock (23)`, `Out of Stock (8)`. Replaces prior ViewTabBar.
- **FilterToolbar**: Keyword, Category, Price Range, Sort, Export.
- **Stock bar cell**: Inline horizontal bar (6px tall). Color encodes state — success ≥ 70%, warning 30-69%, error < 30%. Hover tooltip with exact counts.
- **⋮ Actions**: State-gated context menu.
- **Slide-over tabs**: Details, Pricing, Inventory, Sales History, Photos.

### States Shown

- **Default**: Items table only. Status ▾ defaults to Active.
- **Filtering**: Active chips appear.
- **Bulk selected**: BulkActionBar slides up.
- **Stock bar (success)**: ≥ 70% of max.
- **Stock bar (warning)**: 30-69% of max; tooltip shows reorder point gap.
- **Stock bar (error)**: < 30% or below reorder; row warning left-border accent.
- **Out of stock**: Stock bar empty; row error left-border; appears in Low Stock filter.
- **Inactive item**: Row dimmed (50% opacity).
- **Slide-over peek (280px)**: Name, SKU, category, price, stock bar.
- **Slide-over standard (420px)**: Full detail with tabs.
- **Price tier editing**: Inline table rows with editable qty/price; [+ Add Tier].
- **Photo upload drag**: Drop zone highlights.
- **Error**: Toast.
- **Deactivate confirmation**: Modal warning.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Items filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by item status"`, `aria-multiselectable="true"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="847 items, 23 low stock, 8 out of stock, average price 14 dollars 30 cents"`
- AG Grid: `role="grid"`, `aria-label="Items table"`, `aria-rowcount="847"`, `aria-multiselectable="true"`
- Stock bar cell: `role="gridcell"`, `aria-label="Stock: 205 of 250, 82 percent. Reorder at 50."`
- Stock bar: `role="progressbar"`, `aria-valuenow="82"`, `aria-valuemax="100"`
- ⋮ Actions: `role="button"`, `aria-label="More actions for Roma Tomatoes ITM-001"`, `aria-haspopup="menu"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions for 2 selected items"`
- Slide-over: `role="dialog"`, `aria-label="Item Roma Tomatoes details"`
- Slide-over tabs: `role="tablist"`, `aria-label="Item detail sections"`
- Category combobox: `role="combobox"`, `aria-label="Category"`
- Photo upload zone: `role="button"`, `aria-label="Upload item photo"`

### Edge Cases Handled

- **Zero items**: Empty state with CTA.
- **Zero filtered results**: "Clear filters" link.
- **Very long item names**: Truncated with tooltip.
- **Very many items (5000+)**: Virtualized.
- **Stock at exactly reorder point**: Warning bar; "At reorder point" tooltip.
- **Item with zero max stock**: Stock bar "—"; tooltip "no max."
- **Null/empty SKU**: Cell shows "—"; still searchable by name.
- **Photo upload size limit**: Inline error.
- **Unsaved slide-over changes**: Confirmation dialog.
- **Bulk deactivate with active orders**: Modal warning.
- **Concurrent edit conflict**: Optimistic update; rollback with toast.
- **Keyboard navigation**: Standard.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Order More only on Low/Out; Reactivate only on Inactive. |
| UX-2: Supporting info one click away, never zero | ✓ | Pricing, Inventory, Sales History, Photos as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Items table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Low stock state at the row. No permanent panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Item creation in slide-over. Deactivate modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, status badges. |
| UX-8: State changes resolve in place | ✓ | Adjustments update row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save. Item form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → New Item CTA. Empty filtered → Clear filters. |
