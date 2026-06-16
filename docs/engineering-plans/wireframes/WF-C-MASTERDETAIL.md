## Wireframe: WF-C-MASTERDETAIL — MasterDetailView Template

A hybrid view for entity relationships (Purchase Orders with line items, Sales Orders with
fulfillment batches). Master rows expand inline to reveal nested detail grids.

---

### Full Page Layout

```
┌─ View Header: "Purchase Orders"                          [+ New PO ▾] [⚙]───┐
├─ FilterToolbar ──────────────────────────────────────────────────────────────┤
│  [▾ Data views] │ [▾ Date ▾] [▾ Vendor ▾] [▾ Amount ▾] [▾ Group ▾]          │
│  [▾ Sort ▾] [⬇ Export]                                                      │
│  [✕ status:confirmed] [✕ vendor:acme]                                        │
├─ GridSummaryStrip ───────────────────────────────────────────────────────────┤
│  [Total: 28 PO's] [$342,000] [8 Pending] [15 Confirmed] [5 Received]         │
├─ ViewTabBar ─────────────────────────────────────────────────────────────────┤
│  [All (28)] [Draft (5)] [Confirmed (12)] [Posted (8)] [Received (3)]         │
├─ Master Grid (AG Grid, collapsible rows) ─────────────────────────────────────┤
│  ┌────┬──────────┬──────────┬───────────┬──────────┬──────────┬─────┐        │
│  │ ▶  │ PO-1042  │ Acme Co  │ Confirmed │ $12,400  │ 6/15/26  │ ⋮  │        │
│  ├────┼──────────┼──────────┼───────────┼──────────┼──────────┼─────┤        │
│  │ ▼  │ PO-1041  │ Beta Inc │ Confirmed │ $18,500  │ 6/14/26  │ ⋮  │        │
│  │    ├──────────┴──────────┴───────────┴──────────┴──────────┴─────┤        │
│  │    │  ┌─ Expanded Detail Grid (inline) ──────────────────────────┐│        │
│  │    │  │ Product         Qty      Unit Price    Total     Status  ││        │
│  │    │  │ ───────         ───      ──────────    ─────     ──────  ││        │
│  │    │  │ Apples          200      $0.25         $50.00    Pending▾││        │
│  │    │  │ Oranges         150      $0.30         $45.00    Rcvd   ▾││        │
│  │    │  │ Bananas         300      $0.20         $60.00    Pendin▾││        │
│  │    │  │ Grapes          100      $0.50         $50.00    Rcvd   ▾││        │
│  │    │  ├──────────────────────────────────────────────────────────┤│        │
│  │    │  │                           Subtotal:   $205.00            ││        │
│  │    │  │                           Tax:         $17.43            ││        │
│  │    │  │                           Total:      $222.43            ││        │
│  │    │  └──────────────────────────────────────────────────────────┘│        │
│  │    └──────────────────────────────────────────────────────────────┘        │
│  ├────┬──────────┬──────────┬───────────┬──────────┬──────────┬─────┤        │
│  │ ▶  │ PO-1040  │ Gamma    │ Draft     │ $6,900   │ 6/13/26  │ ⋮  │        │
│  ├────┼──────────┼──────────┼───────────┼──────────┼──────────┼─────┤        │
│  │ ▶  │ PO-1039  │ Delta    │ Posted    │ $22,800  │ 6/12/26  │ ⋮  │        │
│  └────┴──────────┴──────────┴───────────┴──────────┴──────────┴─────┘        │
├─ BulkActionBar (hidden until >0 selected) ─────────────────────────────────────┤
│  [3 PO's selected · $38,700] [✓ Confirm] [📄 Print] [▾ More]                  │
├─ DetailSlideover (on row action/edit) ─────────────────────────────────────────┤
└────────────────────────────────────────────────────────────────────────────────┘
```

---

### Expand/Collapse Mechanics

#### Master Row (Collapsed)
```
┌────┬──────────┬──────────┬───────────┬──────────┬──────────┬─────┐
│ ▶  │ PO-1042  │ Acme Co  │ Confirmed │ $12,400  │ 6/15/26  │ ⋮  │
└────┴──────────┴──────────┴───────────┴──────────┴──────────┴─────┘
  36px tall    ▶ = collapsed indicator      ⋮ = row menu
```

#### Master Row (Expanded)
```
┌────┬──────────┬──────────┬───────────┬──────────┬──────────┬─────┐
│ ▼  │ PO-1041  │ Beta Inc │ Confirmed │ $18,500  │ 6/14/26  │ ⋮  │  ← master row: bg-green-50
│    ├──────────┴──────────┴───────────┴──────────┴──────────┴─────┤
│    │                                                               │
│    │  ┌─ Detail Section ─────────────────────────────────────────┐│
│    │  │                                                          ││
│    │  │  [detail grid content, see above]                        ││
│    │  │                                                          ││
│    │  └──────────────────────────────────────────────────────────┘│
│    │                                                               │
│    └───────────────────────────────────────────────────────────────┘
  ▼ = expanded indicator        expanded row bg: bg-green-50 (master row highlight)
```

#### Details
- **Expand toggle:** Click ▶/▼ icon (24×24 hit area) or double-click anywhere on master row
- **Master row highlight:** When expanded: `bg-green-50` background on the master row. When collapsed: default white
- **Single expand:** Only one row expanded at a time (accordion behavior). Expanding a new row collapses the previous
- **Detail grid:** Rendered inline below the master row. Full-width (spans all columns). AG Grid within a custom `detailCellRenderer`
- **Detail data:** Lazy-loaded when row expands (tRPC query: `entity.details(parentId)`). Shows skeleton while loading
- **Detail actions:** BulkActionBar applies to detail rows when selected. Detail rows have their own checkbox column
- **Keyboard:** Space/Enter on master row toggles expand. Arrow keys navigate within detail grid when focused
- **ARIA:** `aria-expanded="true|false"` on master row. Detail grid: nested `role="grid"`. Expand toggle: `aria-label="Expand purchase order PO-1041"`

---

### Detail Grid Features

#### Layout
```
┌─ Detail Grid ────────────────────────────────────────────────────────────────────┐
│  ┌──────┬──────────┬──────┬────────────┬────────┬───────────┬─────────┐          │
│  │  ☐   │ Product  │ Qty  │ Unit Price │ Total  │ Status    │  ⋮      │          │
│  ├──────┼──────────┼──────┼────────────┼────────┼───────────┼─────────┤          │
│  │  ☐   │ Apples   │ 200  │ $0.25      │ $50.00 │ Pending ▾ │  ⋮      │          │
│  │  ☑   │ Oranges  │ 150  │ $0.30      │ $45.00 │ Received▾ │  ⋮      │          │
│  │  ☐   │ Bananas  │ 300  │ $0.20      │ $60.00 │ Pending ▾ │  ⋮      │          │
│  │  ☑   │ Grapes   │ 100  │ $0.50      │ $50.00 │ Received▾ │  ⋮      │          │
│  │  ☐   │ + Add line item…                                          │          │
│  └──────┴──────────┴──────┴────────────┴────────┴───────────┴─────────┘          │
│                                                                                   │
│  ┌─ Summary Row ──────────────────────────────────────────────────────────────┐  │
│  │  4 items    Subtotal: $205.00    Tax: $17.43    Total: $222.43             │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘
   Detail grid height: auto (fits content, max 400px with scroll)
```

#### Details
- **Add row:** "+ Add line item…" row at bottom of detail grid. Click opens inline editor for new row
- **Inline editing:** Status cells use ComboboxCellEditor. Qty/Price cells use inline text editor. Changes saved immediately (auto-save) with saving spinner
- **Summary row:** Sticky bottom of detail section. Updates reactively as detail rows change
- **Recalculate:** Editing unit price or qty recalculates Total immediately (client-side). Server recalculates on save
- **ARIA:** Detail summary: `aria-live="polite"` updates when values change

---

### Section Ordering (Same as GridView)

```
1. ViewHeader         (52px)
2. FilterToolbar      (44-84px)
3. GridSummaryStrip   (80px)
4. ViewTabBar         (40px)
5. MasterDetailGrid   (flex-grow: fills remaining space)
6. BulkActionBar      (56px, fixed bottom)
7. DetailSlideover    (right side, on edit/open action)
```

### Differences from GridView

| Aspect | GridView | MasterDetailView |
|--------|----------|------------------|
| Row expansion | None | Inline detail grid |
| Row click | Opens slideover | Toggles expand |
| Slideover trigger | Row click | "Edit" action button or "⋮ Open full view" |
| Detail editing | In slideover tab | Inline in detail grid |
| Bulk actions | On master rows | On master rows OR detail rows (context-aware) |
| Data loading | Single grid query | Master query + lazy detail queries |

### Data Flow

```
MasterDetailView
    │
    ├──▶ Master Grid       ← tRPC grid query (parent entities, paginated)
    │       │
    │       └──▶ onExpand  ← tRPC entity.details(parentId)
    │               │
    │               └──▶ Detail Grid  ← inline AG Grid with child entity schema
    │                       │
    │                       └──▶ onEdit  ← useCommandRunner (per-detail-row)
    │
    ├──▶ BulkActionBar
    │       └──▶ Context: master rows or detail rows (detected from focus)
    │
    └──▶ DetailSlideover
            └──▶ Trigger: "Edit" on master row, "Open in full view"
```

### Keyboard Shortcuts (Additional)

| Shortcut | Action |
|----------|--------|
| `Space` on master row | Toggle expand/collapse |
| `Enter` on master row | Open slideover (when collapsed) |
| `Shift+Space` | Expand all (not implemented — accordion only) |
| `Tab` | Navigate from master grid → detail grid (when expanded) |
| `Escape` in detail grid | Collapse master row, focus master row |

---
*Font: Inter 13px body. Master row highlight: bg-green-50. Detail grid max-height: 400px with overflow scroll.*
