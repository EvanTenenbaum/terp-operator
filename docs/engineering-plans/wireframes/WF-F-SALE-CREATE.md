## Wireframe: WF-F-SALE-CREATE — Create Sale Flow

### Flow Overview
Operator creates a sale from the Sales view. Flow: **select customer → context header appears → add lines from Inventory Finder slide-over → confirm**. No pre-staged panels — the Sales view is the orders grid until the operator starts a sale.

> **UX-first changes from prior draft:**
> - The Sales view shows the orders grid as the primary surface (UX-3). It does **not** pre-stage a Sale Builder workspace, Customer Purchase History panel, Photography Queue, Suggestions grid, or Draft Lines grid. Those exist only when relevant to the active sale.
> - **Customer Purchase History** lives one click away in a tab inside the customer slide-over (UX-2).
> - **Suggestions and Photography Queue** are progressive disclosure — surfaced inside the active sale slide-over when the operator opts in, never as permanent panels.
> - **Pre-post validation** is rendered at the point of impact (UX-5) — inline above the lines grid only when issues exist, never as an "All checks passed" permanent panel.

### Step 1: Sales View — Click "+ New Sale"
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales                              [🔍 Search]   [+ New Sale]│
├──────────────────────────────────────────────────────────────┤
│  ⚙ Filter:  [Status (2)] [Date] [Customer]                   │
├──────────────────────────────────────────────────────────────┤
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2312 │ 2026-06-10 │ Trader Joe's   │ Confirmed  │ $2,100  │
│  S-2313 │ 2026-06-12 │ Whole Foods    │ Posted     │ $1,566  │
│  S-2314 │ 2026-06-13 │ Sprouts        │ Draft      │ $890    │
└──────────────────────────────────────────────────────────────┘
   No pre-staged Sale Builder, Suggestions, Photography, or Drafts panels.
   The orders grid IS the view.
```
#### Before State
- Sales view loaded showing the orders grid as the primary surface. **No pre-staged authoring workspace or peripheral panels.**
#### User Action
- Click `[+ New Sale]` button. The **sale slide-over** (form mode) opens on the right.
- The first field is the customer selector — search or select from recent.
#### After State
- Slide-over opens with the customer selector focused. Recent customers shown as a dropdown list.
#### Interactive Elements, ARIA, Edge Cases
- Slide-over URL: `/sales?action=new`. Reload restores the open form.
- Customer selector: combobox with async typeahead, `aria-label="Select customer"`.
- Recent list: last 5 customers. Keyboard: Arrow keys navigate, Enter selects.
- Edge case: Customer on credit hold → warning badge "Credit Hold" appears in the slide-over header after selection.

### Step 2: Customer Context Header Appears (inside slide-over)
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
- **Six panels do NOT fire on customer selection.** Only the slide-over context header updates (UX-2 — supporting info one click away). Purchase history, photography queue, suggestions are tabs inside the slide-over or the customer profile slide-over, not concurrent firings.

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

### Step 6: Confirm Sale — Inline Pre-Post Strip (only if issues) → Confirm Modal → Success
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
- **Note:** there is no permanent "pre-post" panel on the Sales view. The strip appears inline above the lines grid only when an issue exists, and only inside the active sale slide-over (UX-5).

---

### UX Check

| Question | Answer |
|----------|--------|
| Does the flow require mode-switching? | No. Authoring runs in the slide-over while the orders grid stays in the background. |
| Is the operator ever shown irrelevant actions? | No. Draft sales expose `Save Draft` and `Confirm Sale`. `Post`, `Cancel`, `Refund` are not present at this stage. |
| Is context preserved if the operator leaves mid-flow? | Yes. Slide-over state encodes to URL (`/sales?action=new&customer=…&draft=…`). Reload restores the draft. Closing prompts to save draft on dirty state. |
| Mercury comparison | Mercury's "Send a transfer" mirrors this exactly: pick the from-account, the form populates with that account's balance + one applicable action. No peripheral panels fire; the transactions table stays visible behind the panel. |

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Draft sale shows only `Save Draft` + `Confirm Sale`; other lifecycle actions absent |
| UX-2 Supporting info one click away | ✅ | Purchase history, photography queue, suggestions live in customer-profile slide-over tabs — one click |
| UX-3 One primary surface per view | ✅ | Orders grid is the primary surface; slide-over carries the authoring |
| UX-4 Bulk actions on selection only | ✅ | New sale is single-target; bulk on the orders grid is separate (WF-C-BULK on selection) |
| UX-5 Validation at point of impact | ✅ | Pre-post strip appears inline above lines grid only when issues exist; no permanent validation panel |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Inventory Finder is slide-over; Confirm Sale uses a confirmation modal (irreversible inventory write) |
| UX-7 Mode is always visible | ✅ | Slide-over header carries customer + balance throughout authoring |
| UX-8 State changes resolve in place | ✅ | Save Draft and Confirm Sale resolve in the slide-over; success returns to the grid with the new row flashing |
| UX-9 Filtering fluid; navigation durable | N/A | Authoring flow |
| UX-10 Cell saves immediate; forms explicit | ✅ | Multi-field form — explicit Save Draft / Confirm Sale; inline price/qty cells inside the draft lines save immediately |
| UX-11 URL is session memory | ✅ | `?action=new&customer=…&draft=…` reproduces the draft on reload |
| UX-12 Empty states give next step | ✅ | "No lines yet — [+ Add line]" inside the slide-over; zero customers → "Search by name or [+ Add customer]" |
