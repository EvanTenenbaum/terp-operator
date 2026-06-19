## Wireframe: WF-V-FULFILLMENT — FulfillmentView

### UX Posture

The fulfillment table is the only primary surface. Status filter is a pill in the FilterToolbar. Footer actions are state-gated by fulfillment status. Tracking and delivery details live in the slide-over.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌─ FilterToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [+ New Shipment] │ Status ▾ │ Data views ▾ │ Date range ▾ │ Keyword │  │ │
│ │ Amount ▾ │ Group ▾ │ Sort ▾ │ Export ▾                                   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ActiveFilterPills ──────────────────────────────────────────────────────┐ │
│ │ [Status: Pending ✕] [Carrier: UPS ✕] [+ Add filter]                      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ KPI Line ───────────────────────────────────────────────────────────────┐ │
│ │ 2,277 shipments · $13.7M  ·  Pending 142 · In Transit 89 · Delivered    │ │
│ │ 2,034 · Delayed 12                              [Show breakdown ▾]       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ AG Grid ────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Order     │ Customer       │ Ship Date │ Carrier │ Status  │
│ │───┼──────────┼───────────┼────────────────┼───────────┼─────────┼─────────│
│ │ ☐ │ FUL-1042 │ SO-8841   │ Fresh Harvest  │ 06/12/26  │ UPS     │ Pending │
│ │ ☐ │ FUL-1041 │ SO-8839   │ Green Valley   │ 06/11/26  │ FedEx   │InTransit│
│ │ ☐ │ FUL-1040 │ SO-8835   │ Pacific Grocers│ 06/10/26  │ DHL     │Delivered│
│ │ ☐ │ FUL-1039 │ SO-8832   │ Farm To Table  │ 06/09/26  │ UPS     │Delivered│
│ │ ☐ │ FUL-1038 │ SO-8827   │ Urban Fields   │ 06/09/26  │ FedEx   │ Delayed │
│ │ ☐ │ FUL-1037 │ SO-8824   │ Midwest Co-op  │ 06/08/26  │ USPS    │Delivered│
│ │ ☐ │ FUL-1036 │ SO-8821   │ Coastal Fresh  │ 06/07/26  │ UPS     │Delivered│
│ │ ☐ │ FUL-1035 │ SO-8818   │ Harvest Moon   │ 06/07/26  │ DHL     │ Pending │
│ │                      Page 1 of 285   [◀ ◀ 1 2 3 … 285 ▶ ▶]                 │
│ │                       (row height: 32px Mercury standard)                  │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ BulkActionBar (appears only when ≥1 row selected) ──────────────────────┐ │
│ │ 3 selected • $124.7k  [Mark Shipped] [Print Labels] [More ▾]             │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px standard, opens on row click):
  Tabs: Details | Items | Tracking | History
  Footer actions (state-gated):
    Pending     → [Mark Shipped] [Assign Carrier] [Cancel]
    In Transit  → [Mark Delivered] [Update Tracking]
    Delivered   → [View POD] [Re-deliver]
    Delayed     → [Update ETA] [Mark Shipped] [Cancel]
    Cancelled   → [View History] (read-only)
```

### State-Gated Action Surface

| Fulfillment State | Visible Actions                              |
|-------------------|----------------------------------------------|
| Pending           | `Mark Shipped`, `Assign Carrier`, `Cancel`   |
| In Transit        | `Mark Delivered`, `Update Tracking`          |
| Delivered         | `View POD`, `Re-deliver`                     |
| Delayed           | `Update ETA`, `Mark Shipped`, `Cancel`       |
| Cancelled         | `View History` (read-only)                   |

### Dimensions

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| View container | 100% viewport | 100vh | flex column |
| FilterToolbar | 100% | 40px | horizontal menubar |
| ActiveFilterPills | 100% | 36px | flex-wrap |
| KPI line | 100% | 32px / ~96px expanded | px-4 |
| AG Grid | 100% | flex-1 | virtual scrolling |
| Grid row | 100% | 32px | Mercury standard |
| Checkbox column | 48px | 32px | center aligned |
| BulkActionBar | 100% | 48px | sticky bottom, slide-up |
| Slide-over peek | 280px | 100% parent | default peek width |
| Slide-over standard | 420px | 100% parent | on expand click |
| Slide-over wide | 60% viewport | 100% parent | on drag |

### Interactive Elements

- **[+ New Shipment] button**: Opens shipment creation in slide-over.
- **Status ▾ pill**: Multi-select popover with `Pending (142)`, `In Transit (89)`, `Delivered (2,034)`, `Delayed (12)`, `Cancelled`. Replaces prior ViewTabBar.
- **Status cell (ComboboxCellEditor)**: Double-click for valid transitions.
- **Carrier cell**: ComboboxCellEditor (UPS, FedEx, DHL, USPS, Regional).
- **Ship Date cell**: Date picker.
- **Row click**: Slide-over peek (280px).
- **DetailTabBar tabs**: Details, Items, Tracking, History.
- **FilterToolbar**: Date range, Keyword, Amount, Group, Sort, Export.
- **Filter pills (✕)**: Click removes filter.
- **BulkActionBar buttons**: Only intersection of valid actions. Mark Shipped (batch), Print Labels.
- **Pagination**: Standard controls.

### States Shown

- **Empty state**: "No shipments found" + "Clear filters" or "Create your first shipment".
- **Loading state**: 8 skeleton rows.
- **Error state**: Banner with retry.
- **Filter active**: ActiveFilterPills visible.
- **Row selected**: Highlight + checkbox; BulkActionBar slides up.
- **Row editing**: Combobox dropdown overlays.
- **Row saving**: Spinner; non-interactive.
- **Bulk action in progress**: "Updating 3 shipments…"; buttons disabled.
- **Bulk action complete**: Toast.
- **Slide-over open**: Grid narrows; keyboard trapped.
- **Slide-over Items empty**: "No items recorded" with contextual help.
- **Delayed shipment**: Row with warning highlight.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Fulfillment filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by fulfillment status"`, `aria-multiselectable="true"`
- ActiveFilterPills: `role="list"`, `aria-label="Active filters"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="2,277 shipments, $13.7M. Pending 142, In Transit 89, Delivered 2,034, Delayed 12."`
- AG Grid: `role="grid"`, `aria-label="Fulfillment records"`, `aria-multiselectable="true"`, `aria-rowcount="2277"`
- Column header: `role="columnheader"`, `aria-sort="none|ascending|descending"`
- Status cell (editable): `role="combobox"`, `aria-label="Status for FUL-1042"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions — 3 selected"`
- Slide-over: `role="dialog"`, `aria-label="Fulfillment FUL-1042 details"`
- DetailTabBar: `role="tablist"`, `aria-label="Fulfillment detail sections"`
- Toast: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **No fulfillments at all**: Full-page empty.
- **All fulfillments delivered**: Normal view; Delivered pre-selected.
- **Single fulfillment**: Pagination hidden.
- **Very long customer name**: Truncated with ellipsis; tooltip.
- **Missing carrier**: Grid shows "—"; Carrier filter includes "(No carrier)".
- **Missing ship date**: Grid shows "—"; sort treats null as epoch.
- **Duplicate tracking number**: Warning icon ⚠ with tooltip; advisory only.
- **Very large dataset (>10k rows)**: Virtual scrolling.
- **Rapid filter changes**: 300ms debounce.
- **Browser back from detail**: Closes slide-over; restores scroll/filter state.
- **Concurrent edit conflict**: Toast "Updated by [user]. [Refresh] [Keep changes]"
- **Offline**: Cached data; queued edits.
- **Print labels (bulk)**: Confirm dialog for >50 labels.
- **Keyboard navigation**: Full grid keyboard support.
- **Screen reader grid navigation**: Announce row count, selection, sort.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Mark Delivered only In Transit; Update ETA only Delayed. |
| UX-2: Supporting info one click away, never zero | ✓ | Items, Tracking, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Fulfillment table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Delayed status at the row. No permanent panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Shipment creation in slide-over. Cancel modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header. |
| UX-8: State changes resolve in place | ✓ | Status transitions inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save. Shipment form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → CTA. Empty filtered → Clear filters. |
