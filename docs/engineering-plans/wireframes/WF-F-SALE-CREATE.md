## Wireframe: WF-F-SALE-CREATE — Create Sale Flow

### Flow Overview
Operator creates a sale from the Sales grid. Flow: select customer via context header → inventory finder slideover → add lines to draft → set prices → confirm sale with pre-post checks → success.

### Step 1: Grid — Select Customer via Context Header
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales  │ Customer: [Select a customer...       ▾] │ [Help]  │ ← context header
├──────────────────────────────────────────────────────────────┤
│  Please select a customer to begin a new sale.               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Recent Customers                                     │   │
│  │  ─────────────────────────────────────────────────── │   │
│  │  🏪 Whole Foods Market     Last sale: Jun 10         │   │
│  │  🏪 Trader Joe's           Last sale: Jun 08         │   │
│  │  🏪 Sprouts Farmers Mkt    Last sale: Jun 01         │   │
│  │  ─────────────────────────────────────────────────── │   │
│  │  [+ Add New Customer]                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Draft Lines (0)                                             │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Sales view loaded. Context header shows customer selector empty. Prompt text visible.
#### User Action
- Click customer dropdown → search or select from recent list.
#### After State
- Customer selected. Context header updates with customer info and balance data.
#### Interactive Elements, ARIA, Edge Cases
- Customer selector: combobox with async typeahead, `aria-label="Select customer"`.
- Recent list: last 5 customers. Keyboard: Arrow keys navigate, Enter selects.
- Edge case: Customer on credit hold → warning badge "Credit Hold" in header.

### Step 2: Context Header Populates
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales  │ 🏪 Whole Foods Market           │ [Change Customer] │
│         │ Balance: $2,450.00  Credit: OK ✅│ Credit: $10,000  │
├──────────────────────────────────────────────────────────────┤
│  Draft Lines (0)                                  [+ Add Line]│
│  ┌──────────────────────────────────────────────────────┐   │
│  │ No lines yet. Click "+ Add Line" to search inventory.│   │
│  └──────────────────────────────────────────────────────┘   │
│──────────────────────────────────────────────────────────────│
│  Subtotal:     $0.00                                        │
│  Total:        $0.00                                        │
│                                                              │
│  [Save Draft]                  [Confirm Sale →] (disabled)   │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Customer selector empty.
#### User Action
- (Automatic — header updates after Step 1.)
#### After State
- Header shows: customer name, balance, credit status (green check), credit limit. `[Change Customer]` available.
#### Interactive Elements, ARIA, Edge Cases
- Credit status: `aria-label="Credit OK"` with green indicator. If near limit → amber "Credit: $500 remaining".

### Step 3: InventoryFinder Slideover Opens
#### Layout (ASCII)
```
┌─────────────────────────────┬──────────────────────────────────┐
│  Sales (dimmed)             │  Add Inventory               [✕] │ ← InventoryFinder
│  Customer: Whole Foods      │──────────────────────────────────│
│                             │  🔍 [Search products...________] │
│                             │──────────────────────────────────│
│                             │  Category: [All           ▾]     │
│                             │──────────────────────────────────│
│                             │  ┌──────────────────────────────┐│
│                             │  │ 🍅 Roma Tomatoes              ││
│                             │  │    Qty avail: 240 lb          ││
│                             │  │    Price: $2.40/lb    [Add +] ││
│                             │  │──────────────────────────────││
│                             │  │ 🥬 Iceberg Lettuce            ││
│                             │  │    Qty avail: 85 cs           ││
│                             │  │    Price: $18.50/cs   [Add +] ││
│                             │  │──────────────────────────────││
│                             │  │ 🫐 Blueberries                ││
│                             │  │    Qty avail: 120 cs          ││
│                             │  │    Price: $32.00/cs   [Add +] ││
│                             │  └──────────────────────────────┘│
└─────────────────────────────┴──────────────────────────────────┘
```
#### Before State
- Draft lines empty. `[+ Add Line]` clicked.
#### User Action
- Search inventory via typeahead. Filter by category. Click `[Add +]` on desired items.
#### After State
- Items added to Draft Lines grid in background. Slideover remains open for multi-add.
#### Interactive Elements, ARIA, Edge Cases
- Slideover: 420px width. Search: debounced 300ms, min 2 chars.
- `[Add +]`: immediate; feedback: brief green flash on button "Added".
- Edge case: Qty = 0 → "Out of stock" badge, `[Add +]` disabled. Low stock → "Only X remaining" warning.

### Step 4: Draft Lines Grid Populated
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales  │ 🏪 Whole Foods Market  │ Bal: $2,450  Credit: OK ✅│
├──────────────────────────────────────────────────────────────┤
│  Draft Lines (3)                                 [+ Add Line]│
│  ┌──────────────────────────────────────────────────────┐   │
│  │ # │ Product          │ Qty │ Unit│ Price  │ Total    │   │
│  │───┼──────────────────┼─────┼─────┼────────┼──────────│   │
│  │ 1 │ Roma Tomatoes    │ 50  │ lb  │ $2.40  │ $120.00  │   │
│  │ 2 │ Iceberg Lettuce  │ 20  │ cs  │ $18.50 │ $370.00  │   │
│  │ 3 │ Blueberries      │ 30  │ cs  │ $32.00 │ $960.00  │   │
│  │   │                  │     │     │        │          │   │
│  │   │ [🗑] [🗑] [🗑] delete individual lines             │   │
│  └──────────────────────────────────────────────────────┘   │
│──────────────────────────────────────────────────────────────│
│  Subtotal:   $1,450.00                                      │
│  Tax (est):   $116.00                                       │
│  Total:      $1,566.00                                      │
│                                                              │
│  [Save Draft]                  [✓ Confirm Sale →]            │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Draft Lines empty.
#### User Action
- (Automatic after adding from InventoryFinder.)
#### After State
- 3 lines shown with product, qty, unit, price, line total. Totals auto-calc. `[Confirm Sale →]` now enabled.
#### Interactive Elements, ARIA, Edge Cases
- Delete: per-line `[🗑]` with confirm. Qty edit: inline cell edit with validation.
- Edge case: Price override → click price cell to edit. Audit trail records override.

### Step 5: Set Prices Per Line
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Draft Lines (3)                                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ # │ Product          │ Qty │ Unit│ Price    │ Total  │   │
│  │───┼──────────────────┼─────┼─────┼──────────┼────────│   │
│  │ 1 │ Roma Tomatoes    │ 50  │ lb  │[$2.40  ▴│ $120.00 │   │ ← inline price edit
│  │ 2 │ Iceberg Lettuce  │ 20  │ cs  │ $18.50   │ $370.00 │   │
│  │ 3 │ Blueberries      │ 30  │ cs  │ $32.00   │ $960.00 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌─ Price Override ──────────────────────────────────────┐  │
│  │  Default: $2.40   Override: $2.80                     │  │ ← tooltip
│  │  Reason: [Market adjustment___________________]       │  │
│  │  [Apply]  [Cancel]                                    │  │
│  └───────────────────────────────────────────────────────┘  │
│  Subtotal:   $1,470.00                                      │
│  Total:      $1,587.60                                      │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Lines showing default prices from inventory.
#### User Action
- Click price cell → inline editor opens. Enter new price, optionally add reason.
#### After State
- Price updated. Total recalculates. Override indicator (▴) shown on modified price. Reason logged in audit.
#### Interactive Elements, ARIA, Edge Cases
- Price cell: `role="gridcell"`, double-click or Enter to edit. `aria-label="Edit unit price for Roma Tomatoes"`.
- Edge case: Price below cost → amber warning "Below cost ($2.10 cost)".

### Step 6: Confirm Sale — Pre-Post Checks → Success
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ⚠ Confirm Sale — Whole Foods Market                 │   │
│  │──────────────────────────────────────────────────────│   │
│  │  ✓ Credit OK ($7,434 remaining of $10,000)           │   │
│  │  ✓ Inventory available (all lines in stock)           │   │
│  │  ⚠ 1 line below cost (Roma Tomatoes)                 │   │ ← pre-post check
│  │──────────────────────────────────────────────────────│   │
│  │  3 lines  │  Total: $1,587.60                        │   │
│  │                                                      │   │
│  │  [Cancel]              [✓ Confirm Sale $1,587.60]    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  ✓ Sale #S-2315 confirmed — $1,587.60                  ║│ ← success toast
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Lines added, prices set. `[Confirm Sale →]` clicked.
#### User Action
- Review pre-post checks. Click `[✓ Confirm Sale]` to proceed despite below-cost warning.
#### After State
- Dialog closes. Spinner on button. Success toast: "✓ Sale #S-2315 confirmed". Grid refreshes. Inventory decremented.
#### Interactive Elements, ARIA, Edge Cases
- Pre-post dialog: `role="alertdialog"`. Checks run before dialog opens (credit, stock, pricing).
- Edge case: Credit exceeded → block with error "Credit limit exceeded by $X. Reduce or request override."
- Edge case: Inventory insufficient after confirm (race) → error "Inventory changed. Refresh and retry."
