## Wireframe: WF-C-MASTERDETAIL — MasterDetailView Template

A hybrid view for entity relationships (Purchase Orders with line items, Sales Orders with
fulfillment batches). Master rows expand inline to reveal nested detail grids.

> **UX-first principles for this template:**
> - **One primary surface:** the master grid. Detail grid is progressive disclosure — only the currently expanded master shows lines (UX-2, UX-3).
> - **Accordion expansion** (one master expanded at a time) prevents the operator from being confronted with a wall of nested grids.
> - **Status filtering** lives in the FilterToolbar Status pill, not in a TabBar above the grid (see WF-C-FILTER).
> - **GridSummaryStrip collapsed by default** to one inline KPI line (see WF-C-SUMMARY).
> - **BulkActionBar** is context-aware: applies to master rows when master is focused, detail rows when a detail row is focused. Bar appears on selection only (UX-4).
> - **Expanded state and selected detail rows encode into the URL** (UX-11), so reload reproduces the view.

---

### Full Page Layout

```
┌─ View Header: "Purchase Orders"                          [+ New PO ▾] [⚙]───┐
├─ FilterToolbar ──────────────────────────────────────────────────────────────┤
│  [▾ Data views] [▾ Date] [▾ Vendor] [▾ Amount] [▾ Status (2)]   [⬇ Export]   │
│  [✕ status: Confirmed, Posted]  [✕ vendor: Acme]                              │
├─ GridSummaryStrip (collapsed) ───────────────────────────────────────────────┤
│  28 POs · $342,000 total · 8 pending · 15 confirmed   [Show breakdown ▾]     │
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
2. FilterToolbar      (44-84px, includes Status pill)
3. GridSummaryStrip   (36px collapsed, 116px expanded)
4. MasterDetailGrid   (flex-grow: fills remaining space)
5. BulkActionBar      (56px, fixed bottom, on selection only)
6. DetailSlideover    (right side, on Edit / "Open full view" action)
```

ViewTabBar is removed from this template (status filtering moved into FilterToolbar).

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

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Master row "⋮" menu and detail row actions show only state-valid actions; "Receive" is absent for Draft POs |
| UX-2 Supporting info one click away | ✅ | Detail grid is one click (expand) away; collapsed master keeps the view scannable |
| UX-3 One primary surface per view | ✅ | Master grid is primary; detail grid is progressive disclosure (one expanded master at a time) |
| UX-4 Bulk actions on selection only | ✅ | BulkActionBar appears when ≥1 master or detail row is selected; context-aware target |
| UX-5 Validation at point of impact | ✅ | Inline cell editor errors live in the cell that failed; no permanent validation strip |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | "Edit PO" opens slide-over form; destructive operations confirm via modal |
| UX-7 Mode is always visible | ✅ | Expanded master is highlighted (bg-green-50); selection count + filter pills continuously visible |
| UX-8 State changes resolve in place | ✅ | Inline detail edits, expand/collapse, bulk actions resolve without navigation |
| UX-9 Filtering fluid; navigation durable | ✅ | Status is filter pill; "Confirmed POs with vendor=Acme" is a URL state, not a destination |
| UX-10 Cell saves immediate; forms explicit | ✅ | Detail row cells inline-save (qty, price, status); slide-over forms have explicit Save |
| UX-11 URL is session memory | ✅ | Expanded master id, focused detail row, filters, slide-over all encode to URL |
| UX-12 Empty states give next step | ✅ | Master with zero detail rows shows "+ Add line item…" inline; empty master list shows clear-filters CTA |

---
*Font: Inter 13px body. Master row highlight: bg-green-50. Detail grid max-height: 400px with overflow scroll.*
