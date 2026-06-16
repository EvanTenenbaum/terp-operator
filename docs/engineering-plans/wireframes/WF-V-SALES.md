## Wireframe: WF-V-SALES — SalesView (GridView + inline sections)

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  Page Header                                  │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Sales Orders                                                             │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              FilterToolbar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  All Open ▾ │ Confirmed ▾ │ Posted ▾ │ Date ▾ │ Customer ▾ │ Export ▾    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [Confirmed ×]  [Acme Corp ×]                           [Clear all]      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              GridSummaryStrip                                 │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  48 orders · Total $342,000  │ 12 Draft  │ 18 Confirmed  │ 8 Posted  ... │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                ViewTabBar                                     │
│ ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌──────────┐ ┌───────────┐       │
│ │ All 48   │ │ Draft 12  │ │ Confirmed 18│ │ Posted 8 │ │Fulfilled 10│      │
│ └──────────┘ └───────────┘ └────────────┘ └──────────┘ └───────────┘       │
├──────────────────────────────────────────────────────────────────────────────┤
│                           Context Header (when customer selected)             │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Customer: Acme Corp  ·  Balance: $12,050.00  ·  Credit: ✓ Good Standing│ │
│ │  Pre-post enabled  [Edit Customer →]                                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                         Sales Orders Table (AG Grid)                          │
│ ┌────┬──────────┬─────────────┬──────────┬───────────┬──────────┬────────┐ │
│ │ ID │ Customer │ Date        │ Status   │ Total     │ Items    │Actions │ │
│ ├────┼──────────┼─────────────┼──────────┼───────────┼──────────┼────────┤ │
│ │2048│ Acme Corp│ 06/14/2026  │Confirmed │ $12,050   │ 18 items │ [···]  │ │
│ ├────┼──────────┼─────────────┼──────────┼───────────┼──────────┼────────┤ │
│ │2047│ MetroMart│ 06/13/2026  │ Draft    │ $8,920    │ 11 items │ [···]  │ │
│ ├────┼──────────┼─────────────┼──────────┼───────────┼──────────┼────────┤ │
│ │2046│ Acme Corp│ 06/12/2026  │ Posted   │ $15,300   │ 24 items │ [···]  │ │
│ ├────┼──────────┼─────────────┼──────────┼───────────┼──────────┼────────┤ │
│ │2045│ FreshFood│ 06/11/2026  │Confirmed │ $6,450    │ 7 items  │ [···]  │ │
│ ├────┼──────────┼─────────────┼──────────┼───────────┼──────────┼────────┤ │
│ │2044│ GlobalMkt│ 06/10/2026  │Fulfilled │ $22,100   │ 31 items │ [···]  │ │
│ ├────┼──────────┼─────────────┼──────────┼───────────┼──────────┼────────┤ │
│ │2043│ Acme Corp│ 06/09/2026  │ Draft    │ $4,800    │ 5 items  │ [···]  │ │
│ └────┴──────────┴─────────────┴──────────┴───────────┴──────────┴────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                     Draft Lines Grid (collapsible, when customer selected)    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ▶ Draft Lines (Acme Corp) — 3 draft orders · 14 items        [collapse]│ │
│ │  ┌─────────────┬──────────┬──────┬────────┬─────────┬──────────────────┐ │ │
│ │  │ Product     │ Order #  │ Qty  │ Price  │ Total   │ Actions          │ │ │
│ │  ├─────────────┼──────────┼──────┼────────┼─────────┼──────────────────┤ │ │
│ │  │ Roma Tomato │ SO-2048  │ 30cs │ $32.00 │ $960.00 │ [Edit] [Remove]  │ │ │
│ │  ├─────────────┼──────────┼──────┼────────┼─────────┼──────────────────┤ │ │
│ │  │ Iceberg Lett│ SO-2048  │ 45cs │ $28.00 │ $1,260  │ [Edit] [Remove]  │ │ │
│ │  ├─────────────┼──────────┼──────┼────────┼─────────┼──────────────────┤ │ │
│ │  │ Green Pepper│ SO-2043  │ 20cs │ $24.00 │ $480.00 │ [Edit] [Remove]  │ │ │
│ │  └─────────────┴──────────┴──────┴────────┴─────────┴──────────────────┘ │ │
│ │  [+ Add Line] → opens InventoryFinder slide-over                          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                   Suggestions Grid (collapsible section)                      │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ▶ Suggestions for Acme Corp — based on purchase history     [collapse]  │ │
│ │  ┌─────────────┬──────────┬──────┬───────┬────────┬───────────────────┐ │ │
│ │  │ Product     │ Freq     │Last  │ Price │ Margin │ Actions           │ │ │
│ │  ├─────────────┼──────────┼──────┼───────┼────────┼───────────────────┤ │ │
│ │  │ Red Onions  │ Biweekly │ 6/10 │ $18.00│ 22%    │ [+ Add to Draft]  │ │ │
│ │  ├─────────────┼──────────┼──────┼───────┼────────┼───────────────────┤ │ │
│ │  │ Celery      │ Weekly   │ 6/13 │ $22.50│ 18%    │ [+ Add to Draft]  │ │ │
│ │  ├─────────────┼──────────┼──────┼───────┼────────┼───────────────────┤ │ │
│ │  │ Baby Carrots│ Monthly  │ 5/28 │ $16.00│ 25%    │ [+ Add to Draft]  │ │ │
│ │  └─────────────┴──────────┴──────┴───────┴────────┴───────────────────┘ │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                Customer Purchase History (inline, collapsible)                │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ▶ Purchase History — Acme Corp · 48 orders since Jan 2026  [collapse]   │ │
│ │  ┌──────┬──────────┬──────────┬───────────┬────────┬──────────────────┐ │ │
│ │  │Date  │ Order #  │ Status   │ Total     │ Items  │ Actions          │ │ │
│ │  ├──────┼──────────┼──────────┼───────────┼────────┼──────────────────┤ │ │
│ │  │6/14  │ SO-2048  │Confirmed │ $12,050   │ 18     │ [View] [Reorder] │ │ │
│ │  ├──────┼──────────┼──────────┼───────────┼────────┼──────────────────┤ │ │
│ │  │6/12  │ SO-2046  │ Posted   │ $15,300   │ 24     │ [View] [Reorder] │ │ │
│ │  ├──────┼──────────┼──────────┼───────────┼────────┼──────────────────┤ │ │
│ │  │6/09  │ SO-2043  │ Draft    │ $4,800    │ 5      │ [View] [Reorder] │ │ │
│ │  ├──────┼──────────┼──────────┼───────────┼────────┼──────────────────┤ │ │
│ │  │6/02  │ SO-2031  │Fulfilled │ $9,200    │ 12     │ [View] [Reorder] │ │ │
│ │  ├──────┼──────────┼──────────┼───────────┼────────┼──────────────────┤ │ │
│ │  │5/28  │ SO-2025  │Fulfilled │ $11,400   │ 16     │ [View] [Reorder] │ │ │
│ │  └──────┴──────────┴──────────┴───────────┴────────┴──────────────────┘ │ │
│ │  [Load more history... (43 remaining)]                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              BulkActionBar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  3 orders selected · $37,250  [Confirm]  [Post]  [More ▾: Delete|Export]│ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                     Detail Slideover (right panel, 420px)                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ← Back to list                        SO-2048 — Acme Corp          [×] │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  Date:       06/14/2026                                                  │ │
│ │  Status:     ┌───────────┐                                               │ │
│ │              │ Confirmed▾│  (ComboboxCellEditor)                         │ │
│ │              └───────────┘                                               │ │
│ │  Total:      $12,050.00                                                  │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ┌─────────┐ ┌───────────┐ ┌─────────────┐ ┌──────────┐                 │ │
│ │  │ Lines   │ │ Pricing   │ │ Fulfillment │ │ History  │                 │ │
│ │  └─────────┘ └───────────┘ └─────────────┘ └──────────┘                 │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ Lines tab                                                             │ │
│ │  ┌──────────────────────────────────────────────────────────────────────┐│ │
│ │  │ Product         │ Qty   │ Price  │ Total      │ Status              ││ │
│ │  │ Roma Tomatoes   │ 30 cs │ $32.00 │ $960.00    │ Confirmed           ││ │
│ │  │ Iceberg Lettuce │ 45 cs │ $28.00 │ $1,260.00  │ Confirmed           ││ │
│ │  │ Green Peppers   │ 20 cs │ $24.00 │ $480.00    │ Backordered         ││ │
│ │  │ Red Onions      │ 15 cs │ $18.00 │ $270.00    │ Confirmed           ││ │
│ │  │ Celery          │ 25 cs │ $22.50 │ $562.50    │ Shipped             ││ │
│ │  │ ...             │ ...   │ ...    │ ...        │ ...                 ││ │
│ │  └──────────────────────────────────────────────────────────────────────┘│ │
│ │  [+ Add Line]                                                            │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ Pricing tab                                                           │ │
│ │  Subtotal:   $10,890.00                                                  │ │
│ │  Discount:   -$540.00 (5% volume)                                        │ │
│ │  Tax:        $870.00                                                     │ │
│ │  Delivery:   $830.00                                                     │ │
│ │  Total:      $12,050.00                                                  │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ Fulfillment tab                                                       │ │
│ │  Fulfillment Status: Partially Shipped (12/18 items)                     │ │
│ │  Ship Date: 06/16/2026                                                   │ │
│ │  Carrier:  FreshFreight                                                   │ │
│ │  Tracking: FRT-982341 [Copy]                                             │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  [View Full Order →]  (/sales/orders/:id)                                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

InventoryFinder (slide-over, triggered by [+ Add Line]):
┌────────────────────────────────────────────────────────────┐
│  Find Product — Inventory Browser                     [×]  │
│  ──────────────────────────────────────────────────────────│
│  Search: [____________________]  Category ▾  Vendor ▾     │
│  ──────────────────────────────────────────────────────────│
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Product          │Avail│ Price │ Vendor   │ + Add     │ │
│  │ Roma Tomatoes    │ 120 │ $32.00│ Acme     │ [+ Add]   │ │
│  │ Roma Tomatoes    │  45 │ $31.50│ FreshFood│ [+ Add]   │ │
│  │ Beefsteak Tomato │  80 │ $35.00│ Acme     │ [+ Add]   │ │
│  │ Cherry Tomatoes  │ 200 │ $18.00│ SunState │ [+ Add]   │ │
│  └───────────────────────────────────────────────────────┘ │
│  ──────────────────────────────────────────────────────────│
│  Selected: Roma Tomatoes (Acme) × 30cs — $960.00           │
│  Qty: [__] cs  [Add to Order]                              │
└────────────────────────────────────────────────────────────┘
```

### Dimensions

| Element | Measurement |
|---------|-------------|
| Page max-width | 1440px centered |
| FilterToolbar height | 44px + 32px (active filter pills) |
| GridSummaryStrip height | 36px |
| ViewTabBar height | 40px |
| Context header height | 48px |
| AG Grid row height | 280px |
| Customer column width | 180px |
| Draft Lines section | collapsed height 40px (header), expanded ~300px |
| Suggestions section | collapsed height 40px (header), expanded ~250px |
| Purchase History section | collapsed height 40px, expanded ~350px |
| Slideover standard width | 420px |
| Slideover transition | 300ms cubic-bezier(0.2, 0.8, 0.4, 1) |
| InventoryFinder slide-over | 480px |
| BulkActionBar height | 52px, animates up from bottom |
| Font | Inter 13px, line-height 1.4 |

### Interactive Elements

- **FilterToolbar**: Horizontal menubar with preset views (All Open, Confirmed, Posted) plus Date, Customer, and Export filters. Active filters shown as dismissible pills below.
- **GridSummaryStrip**: Shows total count, dollar amount, and status breakdown counts. Updates reactively with filters.
- **ViewTabBar**: Tabs filter the AG Grid by status. Each tab badge shows count.
- **Context Header (customer selected)**: Appears when a customer row is selected. Shows customer name, balance, credit standing indicator, and pre-post capability flag. "Edit Customer →" link navigates to customer detail.
- **AG Grid table**: Row click selects customer and reveals inline sections below. Sortable columns. Multi-select with checkboxes.
- **Draft Lines Grid (collapsible)**: Shows all draft line items for the selected customer. Click section header to expand/collapse. "[+ Add Line]" button opens InventoryFinder slide-over. Each line has Edit and Remove actions.
- **InventoryFinder slide-over**: Product search with filters. Results grid with availability, price, vendor. Click [+ Add] to select product. Bottom quantity input with "Add to Order" button.
- **Suggestions Grid (collapsible)**: AI/pattern-based product suggestions based on customer purchase history. Shows frequency, last purchase date, price, and margin. "[+ Add to Draft]" adds to the most recent draft order.
- **Customer Purchase History (inline, collapsible)**: Scrollable list of past orders. "Load more..." pagination at bottom. Each row has View and Reorder actions.
- **BulkActionBar**: Slides up when 2+ orders selected. Shows count, total. Context-aware buttons: Draft → Confirm, Confirmed → Post. "More ▾" overflow.
- **DetailSlideover**: Tabs for Lines, Pricing, Fulfillment, History. Line-level status shown. Pricing tab shows subtotal/discount/tax breakdown. Fulfillment tab shows shipping details.
- **Full page scroll with all sections expanded**: Total page height can exceed 2000px. Virtual scrolling in main grid keeps performance acceptable.

### States Shown

- **No customer selected**: Context header hidden. Draft Lines, Suggestions, and Purchase History sections hidden. Only main orders grid visible.
- **Customer selected (single row click)**: Context header appears. Inline sections appear below grid. Draft Lines section auto-expands if draft orders exist.
- **Customer selected but no draft orders**: Draft Lines section shows empty state: "No draft orders for Acme Corp. Select items from Suggestions or Purchase History to create one."
- **Draft Lines collapsed**: Section header visible with count summary. Grid hidden.
- **Draft Lines expanded**: Full grid visible with line items and [+ Add Line] button.
- **Suggestions expanded**: Product suggestions visible. Collapsed by default.
- **Purchase History expanded**: History table visible. Collapsed by default.
- **InventoryFinder open**: Slide-over overlay. Main page dimmed. Product search active.
- **All sections collapsed**: Compact view — only context header + orders grid visible. ~60% vertical space saved.
- **Loading state**: Skeleton rows in orders grid. Context header skeleton. Inline sections show skeleton placeholders.
- **Empty state (no orders)**: "No sales orders found" with create CTA.
- **Error state**: Inline error banner with retry.

### ARIA Annotations

- **Page header**: `role="banner"`, `aria-label="Sales Orders"`
- **FilterToolbar**: `role="menubar"`, `aria-label="Sales filter toolbar"`
- **Active filter pills**: `role="list"`, `aria-label="Active filters"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`
- **ViewTabBar**: `role="tablist"`, `aria-label="Sales order status filters"`
- **ViewTabBar tabs**: `role="tab"`, `aria-selected="true|false"`
- **Context header**: `role="region"`, `aria-label="Customer context for Acme Corp"`
- **Credit indicator**: `aria-label="Credit standing: Good"`
- **AG Grid**: `role="grid"`, `aria-label="Sales orders table"`, `aria-multiselectable="true"`
- **Draft Lines section**: `role="region"`, `aria-label="Draft lines for Acme Corp"`, `aria-expanded="true|false"`
- **Draft Lines collapse toggle**: `role="button"`, `aria-label="Toggle draft lines section"`
- **Suggestions section**: `role="region"`, `aria-label="Product suggestions for Acme Corp"`, `aria-expanded="true|false"`
- **Purchase History section**: `role="region"`, `aria-label="Purchase history for Acme Corp"`, `aria-expanded="true|false"`
- **InventoryFinder**: `role="dialog"`, `aria-label="Find inventory product"`, `aria-modal="true"`
- **InventoryFinder search**: `role="searchbox"`, `aria-label="Search inventory products"`
- **"Add to Draft" buttons**: `role="button"`, `aria-label="Add [product name] to draft order"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 3 selected orders"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Sales order details"`, `aria-modal="true"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Order detail sections"`
- **Pricing breakdown**: `role="list"`, `aria-label="Pricing breakdown"`
- **"Load more history"**: `role="button"`, `aria-label="Load more purchase history, 43 items remaining"`

### Edge Cases Handled

- **Customer with zero purchase history**: Context header shows "No prior orders." Suggestions and Purchase History sections hidden or show empty state.
- **Customer with credit hold**: Credit indicator shows "⛔ On Hold" with red color. Context header displays warning. Order confirmation disabled for Draft orders.
- **Very long customer name**: Context header truncates with ellipsis at 300px. Full name in tooltip.
- **No customer selected, Draft Lines visible (bug prevention)**: Draft Lines section never renders without selected customer context. State guard prevents orphaned section.
- **Switch customer while InventoryFinder open**: InventoryFinder updates product context to new customer's vendor relationships. If products already selected, confirmation: "Switch customer? Selected items will be cleared."
- **All sections expanded simultaneously**: Page height grows significantly (~3000px+). Grid virtualizes. Browser handles scroll. Collapse-all shortcut available.
- **Zero search results in InventoryFinder**: "No products matching 'xyz'. Try adjusting filters or [Browse All Products]."
- **Rapid section expand/collapse**: Animations debounced. No layout thrashing.
- **"Add to Draft" when no draft order exists**: Auto-creates a new Draft order for the customer, then adds the line item.
- **Reorder from history on fulfilled order**: Opens a duplicated draft pre-filled with the same line items. Original order unaffected.
- **Keyboard navigation through collapsible sections**: Tab order follows visual order. Collapsed sections: focusable header only. Expanded: all interactive elements reachable.
- **Viewport <768px**: Context header stacks vertically. Inline sections take full width. Slideover becomes full-width. InventoryFinder becomes full-width modal.
- **Large purchase history (500+ orders)**: Shows most recent 5 by default. "Load more..." paginates 20 at a time. Virtual scrolling within the section.
