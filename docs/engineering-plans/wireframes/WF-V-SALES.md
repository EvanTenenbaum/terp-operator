## Wireframe: WF-V-SALES — SalesView (GridView + sequenced sections + slide-overs)

### UX Posture

This is the hardest view in TERP. The retrofit takes it from eight simultaneous panels to **one primary surface**. The sales orders table is the only thing visible by default. Selecting a customer reveals a context header and switches the table into a draft-lines mode. Suggestions become a tab, not a co-equal grid. Purchase history and photography queue live in the customer slide-over (one click away). Inventory finding lives in a slide-over (zero clicks until the operator clicks "Add line"). Pre-post validation appears as an inline strip above the lines grid only when issues exist.

Mercury's principle applies: prepare for everything the operator might want, but show only what they're using now.

### Layout (ASCII)

#### State 1 — Default arrival (no customer selected): one surface

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FilterToolbar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [+ New Sale]  │ Status ▾ │ Data views ▾ │ Date ▾ │ Customer ▾ │ ...    │ │
│ │                │ Group ▾  │ Sort ▾       │ Export ▾                      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [Status: Confirmed ×]  [Acme Corp ×]                  [Clear all]       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              KPI Line                                         │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  48 orders · $342,000  ·  Draft 12 · Confirmed 18 · Posted 8 · Ful. 10  │ │
│ │                                                       [Show breakdown ▾] │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                         Sales Orders Table (AG Grid)                          │
│ ┌────┬──────────┬─────────────┬──────────┬───────────┬──────────┬────────┐ │
│ │ ID │ Customer │ Date        │ Status   │ Total     │ Items    │Actions │ │
│ ├────┼──────────┼─────────────┼──────────┼───────────┼──────────┼────────┤ │
│ │2048│ Acme Corp│ 06/14/2026  │Confirmed │ $12,050   │ 18 items │ [···]  │ │
│ │2047│ MetroMart│ 06/13/2026  │ Draft    │ $8,920    │ 11 items │ [···]  │ │
│ │2046│ Acme Corp│ 06/12/2026  │ Posted   │ $15,300   │ 24 items │ [···]  │ │
│ │2045│ FreshFood│ 06/11/2026  │Confirmed │ $6,450    │ 7 items  │ [···]  │ │
│ │2044│ GlobalMkt│ 06/10/2026  │Fulfilled │ $22,100   │ 31 items │ [···]  │ │
│ │2043│ Acme Corp│ 06/09/2026  │ Draft    │ $4,800    │ 5 items  │ [···]  │ │
│ └────┴──────────┴─────────────┴──────────┴───────────┴──────────┴────────┘ │
│                         (row height: 44px Mercury-parity)                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### State 2 — Customer selected: context header + draft-lines view

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   FilterToolbar (unchanged) · KPI Line (unchanged)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                       Context Header (sticky, single line)                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Customer: Acme Corp  ·  Balance: $12,050  ·  Credit: ✓ Good            │ │
│ │  [Clear customer]   [Edit customer →]   [Switch view: Orders | Lines]    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                  Inline warning strip (only when issues exist)                │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ⚠ Iceberg Lettuce price ($28.00) is below floor ($28.50). [Fix in line]│ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                  Tab strip (replaces the prior 6-panel layout)                │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ┌──────────────┐ ┌──────────────────┐                                   │ │
│ │  │ Lines (3)    │ │ Suggestions (12) │     [Back to orders ←]            │ │
│ │  └──────────────┘ └──────────────────┘                                   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                Lines tab — Draft Lines Grid (full width, 44px rows)           │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Product       │ Order # │ Qty  │ Price  │ Total   │ Actions             │ │
│ │  Roma Tomato   │ SO-2048 │ 30cs │ $32.00 │ $960    │ [Edit] [Remove]    │ │
│ │  Iceberg Lett. │ SO-2048 │ 45cs │ $28.00 │ $1,260  │ [Edit] [Remove] ⚠  │ │
│ │  Green Pepper  │ SO-2043 │ 20cs │ $24.00 │ $480    │ [Edit] [Remove]    │ │
│ │                                                                          │ │
│ │  [+ Add line]   → opens Inventory Finder slide-over                      │ │
│ │  [+ Quick add from history]   → opens history-filtered Finder            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                  BulkActionBar (appears only when rows selected)              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  3 lines selected · $2,700        [Confirm] [More ▾: Remove | Reprice]  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### State 3 — Suggestions tab (one click away from Lines)

```
│                Suggestions tab — recommendations based on history             │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Product     │ Freq     │ Last │ Price  │ Margin │ Action                │ │
│ │  Red Onions  │ Biweekly │ 6/10 │ $18.00 │ 22%    │ [+ Add to draft]     │ │
│ │  Celery      │ Weekly   │ 6/13 │ $22.50 │ 18%    │ [+ Add to draft]     │ │
│ │  Baby Carrots│ Monthly  │ 5/28 │ $16.00 │ 25%    │ [+ Add to draft]     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
```

#### Slide-overs (open on demand only — never pre-staged)

```
Inventory Finder Slide-over (triggered by [+ Add line] only):
┌──────────────────────────────────────────────────────────┐
│  Find Product — Inventory Browser                   [×]  │
│  ─────────────────────────────────────────────────────── │
│  Search: [________]   Category ▾   Vendor ▾              │
│  ─────────────────────────────────────────────────────── │
│  Product          │Avail│ Price │ Vendor   │ + Add        │
│  Roma Tomatoes    │ 120 │ $32.00│ Acme     │ [+]          │
│  Beefsteak Tomato │  80 │ $35.00│ Acme     │ [+]          │
│  Cherry Tomatoes  │ 200 │ $18.00│ SunState │ [+]          │
│  ─────────────────────────────────────────────────────── │
│  Selected: Roma Tomatoes (Acme) × 30cs — $960            │
│  Qty: [__] cs           [Add to Order]                   │
└──────────────────────────────────────────────────────────┘

Customer Slide-over (triggered by clicking customer name in context header):
┌──────────────────────────────────────────────────────────┐
│  Acme Corp — Customer Detail                        [×]  │
│  ─────────────────────────────────────────────────────── │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ Purchase Hx  │ │ Profile      │ │ Photography  │     │
│  │  (default)   │ │              │ │ Queue (5)    │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│  ─────────────────────────────────────────────────────── │
│  ▼ Purchase History tab (default — most-wanted view)     │
│  Date  │ Order #  │ Status   │ Total    │ Items  │ Act. │
│  6/14  │ SO-2048  │Confirmed │ $12,050  │ 18     │[View]│
│  6/12  │ SO-2046  │ Posted   │ $15,300  │ 24     │[View]│
│  6/09  │ SO-2043  │ Draft    │ $4,800   │ 5      │[View]│
│  6/02  │ SO-2031  │Fulfilled │ $9,200   │ 12     │[View]│
│  [Load more history... (43 remaining)]                   │
└──────────────────────────────────────────────────────────┘

Order Detail Slide-over (triggered by row click in orders table):
┌──────────────────────────────────────────────────────────┐
│  SO-2048 — Acme Corp                                [×]  │
│  Date: 06/14/2026  Status: [Confirmed ▾]  Total: $12,050│
│  ─────────────────────────────────────────────────────── │
│  ┌─────────┐ ┌───────────┐ ┌─────────────┐ ┌──────────┐ │
│  │ Lines   │ │ Pricing   │ │ Fulfillment │ │ History  │ │
│  └─────────┘ └───────────┘ └─────────────┘ └──────────┘ │
│  ─────────────────────────────────────────────────────── │
│  ▼ Lines tab                                             │
│  (line items table — see prior detail layout)            │
│  ─────────────────────────────────────────────────────── │
│  Footer actions (state-gated):                           │
│  Draft     → [Save] [Confirm]                            │
│  Confirmed → [Post] [Edit lines] [Cancel]                │
│  Posted    → [Fulfill] [View invoice] [Reverse]          │
│  Fulfilled → [View documents] [Export]                   │
└──────────────────────────────────────────────────────────┘
```

### State-Gated Action Surface

| Order State | Visible Actions                                  |
|-------------|--------------------------------------------------|
| Draft       | `Save`, `Confirm`, `Discard`                     |
| Confirmed   | `Post`, `Edit lines`, `Cancel`                   |
| Posted      | `Fulfill`, `View invoice`, `Reverse`             |
| Fulfilled   | `View documents`, `Export`                       |

Bulk actions follow the same intersection rule.

### Dimensions

| Element | Measurement |
|---------|-------------|
| Page max-width | 1440px centered |
| FilterToolbar height | 44px + 32px (active filter pills) |
| KPI line height | 32px (collapsed) · ~96px (expanded breakdown) |
| Context header height | 48px (sticky on scroll) |
| Inline warning strip | 36px when present; absent when no issues |
| Tab strip height | 40px (Lines / Suggestions) |
| AG Grid row height | **44px** (Mercury-parity dense view) |
| Customer column width | 180px |
| Inventory Finder slide-over | 480px |
| Customer slide-over | 420px standard, 60% wide |
| Order detail slide-over | 420px standard, 60% wide |
| BulkActionBar height | 52px, animates up from bottom |
| Font | Inter 13px, line-height 1.4 |

### Interactive Elements

- **[+ New Sale] button (in FilterToolbar)**: Opens order authoring slide-over. URL: `/sales?compose=new`.
- **Status ▾ pill**: Multi-select popover lists `Draft (12)`, `Confirmed (18)`, `Posted (8)`, `Fulfilled (10)`. Counts adapt to other filters. Encodes into URL.
- **KPI line**: Single text summary. "Show breakdown ▾" expands to 4–5 metric cards (Total, AR Outstanding, Avg Order Size, Top Customer by Volume, This Week's Throughput).
- **Customer column**: Click a customer cell to *select the customer for this view* (not to navigate). This triggers State 2: context header appears, table switches to lines mode.
- **Context header — Customer name**: Click opens the customer slide-over with Purchase History as the default tab (per UX analysis tie-breaker: most-wanted view of a customer IS their purchase history).
- **Context header — [Clear customer]**: Returns to State 1 (orders table).
- **Context header — [Switch view: Orders | Lines]**: Operator can stay in the customer's context but switch between viewing their orders list or their consolidated draft lines.
- **Inline warning strip**: Appears only when validation issues exist. Renders the issue and a `[Fix in line]` link that jumps focus to the offending cell. When all checks pass, no strip is rendered (no "All checks passed" wallpaper).
- **Tab strip (Lines / Suggestions)**: In customer-selected mode. Tabs filter the surface, not the mode. Counts on tab labels update reactively.
- **Lines grid [+ Add line]**: Opens Inventory Finder as a slide-over. The Finder is *not* permanently visible. Operators add multiple lines while the Finder is open and close it when done.
- **Lines grid [+ Quick add from history]**: Surfaces the most-frequently-purchased products for this customer at the row level — no trip through tabs required.
- **Suggestions tab [+ Add to draft]**: Adds product to the most recent draft order for the selected customer. Creates a new draft if none exists.
- **Order detail slide-over**: Row click in the orders table opens at peek (280px). Tabs: Lines, Pricing, Fulfillment, History. Footer actions are state-gated.
- **Customer slide-over**: Tabs: `Purchase History` (default), `Profile`, `Photography Queue`. The Photography Queue count badge appears on the tab so the operator sees there's work without the queue itself eating real estate.
- **BulkActionBar**: Appears only when lines or orders are selected. Shows count + total + intersection of valid actions.

### States Shown

- **State 1 — Default arrival (no customer)**: Orders table only. Context header hidden. Inline sections hidden. Operator's eye lands on the table.
- **State 2 — Customer selected**: Context header appears (sticky). Tab strip shows `Lines | Suggestions`. Lines grid uses full width. Inventory Finder is closed unless operator clicks `+ Add line`.
- **State 2 + adding line**: Inventory Finder slide-over open from the right. Lines grid remains visible underneath at narrowed width but readable. Finder closes on operator's signal, not after every add.
- **State 2 + customer slide-over open**: Customer slide-over from the right, defaults to Purchase History tab. Operator can reference history while building the sale.
- **State 2 + validation issue**: Inline warning strip appears above the Lines grid. When operator resolves the issue, strip disappears.
- **State 3 — Suggestions tab active**: Suggestions list visible. Lines grid replaced by suggestions list (tab-switched, not co-displayed).
- **Customer with credit hold**: Context header shows `Credit: ⛔ On Hold` with warning state. Confirm action is hidden for Draft orders (state gating respects business rules).
- **Confirmed sale → return to State 1**: After `Confirm` action, the lines grid transitions back to the orders table. The new confirmed order is highlighted at top (UX-8: state changes resolve in place). Customer context dismisses unless operator is still in customer-selected mode for additional orders.
- **Loading state**: Skeleton rows in orders grid. Context header skeleton when transitioning.
- **Empty state (no orders)**: "No sales orders found" with `+ New Sale` CTA.
- **Empty state (no draft lines for customer)**: Lines tab shows "No draft lines for Acme Corp yet. [+ Add line] or pick from Suggestions."
- **Error state**: Inline error banner with retry.

### ARIA Annotations

- **FilterToolbar**: `role="menubar"`, `aria-label="Sales filter toolbar"`
- **Status ▾ pill**: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by status"`, `aria-multiselectable="true"`
- **Active filter pills**: `role="list"`, `aria-label="Active filters"`
- **KPI line**: `role="status"`, `aria-live="polite"`, `aria-label="48 orders, 342,000 dollars, 12 draft, 18 confirmed, 8 posted, 10 fulfilled"`
- **Context header**: `role="region"`, `aria-label="Customer context: Acme Corp"`. `aria-live="polite"` announces customer selection without firing six separate updates.
- **Credit indicator**: `aria-label="Credit standing: Good"` (or `"On Hold"` with warning)
- **Tab strip (Lines / Suggestions)**: `role="tablist"`, `aria-label="Customer working surface"`. Tabs: `role="tab"`, `aria-selected`.
- **Lines grid**: `role="grid"`, `aria-label="Draft lines for Acme Corp"`
- **Inline warning strip**: `role="alert"`, `aria-live="polite"`. `[Fix in line]` link: `aria-label="Jump to Iceberg Lettuce line"`.
- **Inventory Finder slide-over**: `role="dialog"`, `aria-label="Find inventory product"`, `aria-modal="false"`
- **Customer slide-over**: `role="dialog"`, `aria-label="Customer detail: Acme Corp"`
- **Order detail slide-over**: `role="dialog"`, `aria-label="Order SO-2048 detail"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 3 selected lines"`

### Edge Cases Handled

- **Customer with zero purchase history**: Customer slide-over Purchase History tab shows "No prior orders. Start building this customer's first sale."
- **Customer with credit hold mid-sale**: Inline warning strip explains the credit deficit. `Confirm` action absent (state-gated) until override is granted by an authorized user (separate command, opens modal confirmation).
- **Very long customer name**: Context header truncates with ellipsis at 300px. Full name in tooltip.
- **Switching customers mid-flow**: If draft lines exist for current customer, modal confirmation: "You have 3 unsaved draft lines for Acme Corp. Keep customer selected, switch and keep drafts, or discard?" (Modal because it's a destructive context switch, per UX-6.)
- **Switching to a different view mid-sale**: URL preserves customer-selected state. Returning via browser back restores the context header, draft lines, and any open slide-over.
- **Inventory Finder open when customer switched**: Finder updates to the new customer's vendor relationships. If items were partially selected, confirmation: "Switch customer? Selected items will be cleared."
- **Mid-flow phone call lookup (the workflow #6 test)**: Operator can open a different PO in a second slide-over (or replace the current one based on setting), reference it, close, and return via browser back. Their draft lines and customer context are preserved at all times.
- **Pre-post validation finds an issue across multiple lines**: Inline warning strip lists the first issue and offers `[View all 3 issues]` link expanding to a small dropdown.
- **"Add to Draft" when no draft order exists**: Auto-creates a new Draft order for the customer, then adds the line item.
- **Reorder from history on fulfilled order**: Opens a duplicated draft pre-filled with the same line items. Original order unaffected.
- **All grids virtualized**: Orders table, Lines grid, and Customer Purchase History scroll independently with virtualization.
- **Viewport <768px**: Context header stacks vertically. Tab strip becomes horizontal scroll. Slide-overs become full-width.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Order actions appear by state. Draft never shows `Post` or `Fulfill`. |
| UX-2: Supporting info one click away, never zero | ✓ | Customer history, profile, photography queue live in slide-over tabs. Inventory Finder in slide-over. |
| UX-3: One primary surface per view | ✓ | Default = orders table. Customer-selected = lines grid (tab-switched, not co-displayed with suggestions). |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only when lines or orders are selected. |
| UX-5: Validation errors at point of impact | ✓ | Inline warning strip appears only when issues exist. Cell-level errors at the cell. No permanent "All checks passed" panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Inventory Finder, customer detail, order detail are all slide-overs. Modal reserved for destructive context switches and overrides. |
| UX-7: System never hides what mode the operator is in | ✓ | Sticky context header carries customer identity. Status badges on rows. Active filter pills. |
| UX-8: State changes resolve in place | ✓ | Confirm/Post transitions the table inline. No confirmation page. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill is a filter (no mode change). Tab strip in customer mode is a tab-switch within a single mode. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save on commit. Slide-over forms have explicit `Save Draft` and `Confirm`. |
| UX-11: URL is the session memory | ✓ | Customer selection, active tab, open slide-over entity, filters all encode into the URL. Browser back is safe. |
| UX-12: Empty states give the operator a next step | ✓ | Empty orders → `+ New Sale`. Empty draft lines → `+ Add line` or pick from Suggestions. Empty history → "Start building this customer's first sale." |
