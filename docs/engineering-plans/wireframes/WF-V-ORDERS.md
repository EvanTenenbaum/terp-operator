## Wireframe: WF-V-ORDERS — OrdersView

### UX Posture

The orders table is the only primary surface. Status filter is a pill in the FilterToolbar, not a tab bar that implies a mode change. The detail slide-over opens on demand — not pre-staged. Footer actions are state-gated by order status. The KPI line summarizes counts and totals in a single sentence with optional expanded breakdown.

### Layout (ASCII)

```
┌─FilterToolbar──────────────────────────────────────────────────────────┐
│  [+ New Order ▾] │ Status ▾ │ Data views ▾ │ Date ▾ │ Keyword ▾ │     │
│                  │ Amount ▾ │ Group ▾      │ Sort ▾ │ Export ▾         │
│  [✕ status:confirmed] [✕ amount:gte:5000] [✕ date:last-30-days]        │
├─KPI Line───────────────────────────────────────────────────────────────┤
│  42 orders · $128,400 · Draft 5 · Confirmed 12 · Posted 18 · Ful. 7   │
│                                                  [Show breakdown ▾]    │
├─AG Grid Table──────────────────────────────────────────────────────────┤
│  ┌──────┬────────────────┬────────────┬──────────┬──────────┬──────┐   │
│  │  ☐   │  ID            │ Customer   │ Status   │ Date     │Amount│ ⋮ │
│  ├──────┼────────────────┼────────────┼──────────┼──────────┼──────┤   │
│  │  ☐   │ SO-1042        │ Acme Co    │ Confirmed│ 6/15/26  │$12,40│ ⋮ │
│  │  ☑   │ SO-1041        │ Beta Inc   │ Posted  ▾│ 6/14/26  │$8,200│ ⋮ │
│  │  ☐   │ SO-1040        │ Gamma LLC  │ Draft   ▾│ 6/13/26  │$3,150│ ⋮ │
│  │  ☑   │ SO-1039        │ Delta Corp │ Posted  ▾│ 6/12/26  │$22,80│ ⋮ │
│  │  ☐   │ SO-1038        │ Epsilon Inc│ Confirmed│ 6/11/26  │$6,900│ ⋮ │
│  │  ☑   │ SO-1037        │ Zeta LLC   │ Shipped ▾│ 6/10/26  │$15,30│ ⋮ │
│  │  ☐   │ SO-1036        │ Eta Corp   │ Draft   ▾│ 6/09/26  │$4,500│ ⋮ │
│  └──────┴────────────────┴────────────┴──────────┴──────────┴──────┘   │
│                       (row height: 32px Mercury standard)               │
├─BulkActionBar (appears only when rows selected)────────────────────────┤
│  3 selected · $46,300   [Confirm] [More ▾: Edit Status | Print | Export]│
└────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click — not pre-staged):
┌──────────────────────┐
│ SO-1041 · Beta Inc   │
│ [Lines][Pricing]     │
│ [Fulfillment][History]│
│ Line Items (4)       │
│ ...                  │
│ Subtotal:  $7,200    │
│ Total:     $8,200    │
│                      │
│ Footer (state-gated):│
│  Draft     → [Save] [Confirm]                  │
│  Confirmed → [Post] [Edit lines] [Cancel]      │
│  Posted    → [Fulfill] [View invoice] [Reverse]│
│  Shipped   → [Mark Delivered] [View docs]      │
│  Fulfilled → [View documents] [Export]         │
└──────────────────────┘
```

### State-Gated Action Surface

| Order State | Visible Actions                                  |
|-------------|--------------------------------------------------|
| Draft       | `Save`, `Confirm`, `Discard`                     |
| Confirmed   | `Post`, `Edit lines`, `Cancel`                   |
| Posted      | `Fulfill`, `View invoice`, `Reverse`             |
| Shipped     | `Mark Delivered`, `View documents`               |
| Fulfilled   | `View documents`, `Export`                       |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| FilterToolbar          | 100%            | 44px + 32px  | Menubar row + active-chip row  |
| KPI line               | 100%            | 32px / ~96px expanded | Inter 13px |
| AG Grid Table          | 100%            | fills remain | Row height 32px, header 40px   |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom         |
| Slide-over             | 420px standard  | 100% vh      | Right panel, 280px peek mode   |
| Checkbox column        | 36px            | —            | Centered                       |
| Status combo cell      | —               | 28px popover | ComboboxCellEditor on dblclick |
| Actions column (⋮)     | 44px            | —            | Opens context menu             |

### Interactive Elements

- **[+ New Order ▾]**: Split button — click opens authoring slide-over; arrow opens "Blank Order", "From Template", "Duplicate Selected".
- **Status ▾ pill**: Multi-select popover with `Draft (5)`, `Confirmed (12)`, `Posted (18)`, `Shipped`, `Fulfilled (7)`. Replaces the prior ViewTabBar. Counts adapt to other filters.
- **FilterToolbar dropdowns**: Data views, Date range, Keyword, Amount, Group, Sort, Export.
- **[✕ chip]**: Removes filter; updates grid immediately.
- **AG Grid table**: 
  - Row click opens slide-over peek (280px).
  - Status cell is ComboboxCellEditor — double-click for valid transitions.
  - Actions kebab opens state-gated context menu.
  - Multi-row selection with checkboxes.
- **BulkActionBar**: Slides up only when 2+ rows selected. Shows intersection of valid actions across selected rows. `Edit Status` disabled (or absent) if selected rows have incompatible statuses.
- **Slide-over tabs**: Lines, Pricing, Fulfillment, History.
- **Slide-over footer**: State-gated actions (see table above).

### States Shown

- **Default**: Orders table only. No slide-over. No bulk bar. Status ▾ defaults to all open orders.
- **Filtering**: Active chips appear; grid re-queries with 300ms debounce.
- **Partial selection**: Header checkbox indeterminate.
- **Bulk selected**: BulkActionBar slides up; intersection of actions.
- **Slide-over peek (280px)**: Shows ID, customer, status, total.
- **Slide-over open (420px)**: Full detail with tabs.
- **Status cell editing**: ComboboxCellEditor open.
- **Export in progress**: Button shows spinner.
- **Error**: Toast at top-right.
- **Empty**: "No orders match your filters. [Clear filters]"
- **Loading**: Skeleton rows.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Orders filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by order status"`, `aria-multiselectable="true"`
- Active chip [✕]: `role="button"`, `aria-label="Remove filter: status is confirmed"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="42 orders, 128,400 dollars total, 5 draft, 12 confirmed, 18 posted, 7 fulfilled"`
- AG Grid Table: `role="grid"`, `aria-label="Orders table"`, `aria-rowcount="42"`, `aria-multiselectable="true"`
- Header checkbox: `role="columnheader"`, `aria-label="Select all rows"`
- Row checkbox: `role="gridcell"`, `aria-selected="true"` when checked
- Status ▾: `role="gridcell"`, `aria-label="Status, Posted. Double-click to edit."`
- ⋮ Actions button: `role="button"`, `aria-label="More actions for SO-1041"`, `aria-haspopup="menu"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions for 3 selected orders"`
- Slide-over: `role="dialog"`, `aria-label="Order SO-1041 details"`, `aria-modal="false"`
- Slide-over tabs: `role="tablist"`, `aria-label="Order detail sections"`

### Edge Cases Handled

- **Zero results after filter**: Empty state with "Clear filters" action; KPI line shows "0 orders · $0".
- **All rows selected**: Header checkbox fully checked; BulkActionBar shows total.
- **Deselect all**: BulkActionBar slides down.
- **Status cell edited on selected row**: Row stays selected; grid refreshes; counts update.
- **Bulk edit across mixed statuses**: `Edit Status` absent (state-gated, not disabled).
- **Slide-over open + bulk selection**: Slide-over stays open; bulk selection independent.
- **Keyboard navigation**: Tab through toolbar → grid → slide-over. Enter on row opens slide-over.
- **Export with no rows**: Export button absent (not disabled).
- **Long customer names**: Truncated with ellipsis; tooltip on hover.
- **Slide-over close via Escape**: Focus returns to triggering row.
- **Concurrent edits**: Optimistic update; rollback with toast.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Footer actions per order state. |
| UX-2: Supporting info one click away, never zero | ✓ | Pricing, Fulfillment, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Orders table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Cell-level errors at cell. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Authoring in slide-over. Modals for destructive cancels. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, status badges. |
| UX-8: State changes resolve in place | ✓ | Status transitions inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | ComboboxCellEditor saves on commit. |
| UX-11: URL is the session memory | ✓ | Filters and slide-over order ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | "No orders match" with Clear filters CTA. |
