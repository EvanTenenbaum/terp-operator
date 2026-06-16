## Wireframe: WF-V-INTAKE — IntakeView (MasterDetailView)

### UX Posture

Intake is already close to Mercury's philosophy in current TERP — master/detail with inline actions at the data, not in a sidebar. The retrofit preserves that and lightens the chrome: KPI line replaces the multi-card summary; the totals strip now appears only on selection; the receipt preview moves to a slide-over (not a permanent panel). Master/detail is genuinely justified here because the domain is hierarchical (PO → batches).

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FilterToolbar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [+ Scan]  │ Status ▾ │ Data views ▾ │ Date ▾ │ PO ▾ │ Export ▾          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [Status: Ready ×]                                              [Clear]  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              KPI Line                                         │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  8 POs pending · 142 batches · $67,400  ·  Ready 42 · In Progress 68 ·   │ │
│ │  Verified 32                                       [Show breakdown ▾]    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                         Master Grid (POs, expandable)                         │
│ ┌──────┬─────────────┬──────────┬──────────┬───────────┬──────────┬───────┐ │
│ │ ▾/▸  │ PO #        │ Vendor   │ Received │ Batches   │ Total    │Actions│ │
│ ├──────┼─────────────┼──────────┼──────────┼───────────┼──────────┼───────┤ │
│ │  ▾   │ PO #1012    │ Acme Corp│ 06/14/26 │ 18/18     │ $18,200  │ [···] │ │
│ │      │ ┌──────────────────────────────────────────────────────────────┐ │ │
│ │      │ │ Batch rows (inline, PO expanded)                              │ │ │
│ │      │ │ B-042 │ Roma Tom   │50 cs │ $28.00 │ Ready  │ [Verify] [···]  │ │ │
│ │      │ │ B-043 │ Iceberg L. │80 cs │ $22.50 │Verified│ ✓               │ │ │
│ │      │ │ B-044 │ Green Pep. │60 cs │ $18.00 │In Prog │ [Verify] [···]  │ │ │
│ │      │ └──────────────────────────────────────────────────────────────┘ │ │
│ ├──────┼─────────────┼──────────┼──────────┼───────────┼──────────┼───────┤ │
│ │  ▸   │ PO #1011    │GlobalFood│ 06/13/26 │ 12/32     │ $42,500  │ [···] │ │
│ │  ▸   │ PO #1010    │MetroFresh│ 06/11/26 │ 6/6       │ $9,800   │ [···] │ │
│ │  ▾   │ PO #1009    │ Acme Corp│ 06/09/26 │ 22/22     │ $31,200  │ [···] │ │
│ │      │ │ B-038 │ Beefsteak  │40 cs │ $35.00 │ Ready  │ [Verify] [···]  │ │ │
│ │      │ │ B-039 │ Celery     │55 cs │ $22.50 │ Ready  │ [Verify] [···]  │ │ │
│ │  ▸   │ PO #1008    │PrimeProd │ 06/05/26 │ 0/4      │ $5,400   │ [···] │ │
│ └──────┴─────────────┴──────────┴──────────┴───────────┴──────────┴───────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│              BulkActionBar (appears only on batch selection)                  │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  5 batches selected · $3,870   [Verify All]  [Reject All] [More ▾]      │ │
│ │  (Verify All / Reject All apply only to selected batches in valid state) │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Batch Detail Slide-over (opens on batch row click — not pre-staged):
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Slide-over (right, 420px standard)                      │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ← Back to intake          Batch B-042 — Roma Tomatoes              [×] │ │
│ │  ─────────────────────────────────────────────────────────────────────── │ │
│ │  PO:        PO #1012 — Acme Corp                                         │ │
│ │  Product:   Roma Tomatoes                                                │ │
│ │  Qty:       50 cs                                                        │ │
│ │  Status:    [Ready ▾]                                                    │ │
│ │  Notes:     "Slight bruising on outer leaves — otherwise good quality."  │ │
│ │  ─────────────────────────────────────────────────────────────────────── │ │
│ │  ┌───────────┐ ┌────────┐ ┌─────────┐                                    │ │
│ │  │ Movement  │ │ Sales  │ │ Photos  │                                    │ │
│ │  └───────────┘ └────────┘ └─────────┘                                    │ │
│ │  ─────────────────────────────────────────────────────────────────────── │ │
│ │  ▼ Movement tab                                                          │ │
│ │  Date       │ Action    │ Location  │ User      │ Notes                  │ │
│ │  06/14 08:15│ Received  │ Dock A    │ Maria G.  │ BOL #42891             │ │
│ │  06/14 08:30│ Inspected │ Cooler 3  │ Maria G.  │ Temp 38°F OK           │ │
│ │  06/14 09:00│ Staged    │ Rack 12B  │ Carlos R. │ Ready for intake       │ │
│ │  ─────────────────────────────────────────────────────────────────────── │ │
│ │  Footer actions (state-gated):                                           │ │
│ │  Ready      → [Verify] [Reject]                                          │ │
│ │  In Progress→ [Verify] [Reject] [Mark Note]                              │ │
│ │  Verified   → [Re-open]                                                  │ │
│ │  Rejected   → [Re-open]                                                  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### State-Gated Action Surface

| Batch State  | Visible Actions                          |
|--------------|------------------------------------------|
| Ready        | `Verify`, `Reject`, `Add Note`           |
| In Progress  | `Verify`, `Reject`, `Add Note`           |
| Verified     | `Re-open`                                |
| Rejected     | `Re-open`                                |

Bulk actions show only the intersection. A selection mixing Ready and Verified batches offers only `Add Note` and `Export`.

### Dimensions

| Element | Measurement |
|---------|-------------|
| Page max-width | 1440px centered |
| FilterToolbar height | 44px + 32px (active filter pills) |
| KPI line height | 32px (collapsed) · ~96px (expanded breakdown) |
| Master PO row height | 48px (collapsed), variable (expanded) |
| Inline batch row height | 56px |
| Batch actions column width | 160px |
| Expand/collapse column width | 36px |
| Slide-over standard width | 420px |
| Slide-over transition | 300ms cubic-bezier(0.2, 0.8, 0.4, 1) |
| Photo thumbnails | 120px × 90px |
| BulkActionBar height | 52px, animates up from bottom |
| Font | Inter 13px, line-height 1.4 |

### Interactive Elements

- **[+ Scan] CTA button (in FilterToolbar)**: Opens barcode/QR scan modal or quick-add form. Supports manual entry, barcode scan, or PO lookup.
- **Status ▾ pill**: Multi-select popover with `Ready (42)`, `In Progress (68)`, `Verified (32)`, `Rejected (0)`. Counts adapt to other filters. Encodes into URL.
- **FilterToolbar**: Preset filters for date range, specific PO number, and Export.
- **KPI line**: "8 POs pending · 142 batches · $67,400 · Ready 42 · In Progress 68 · Verified 32." Click "Show breakdown ▾" for metric cards.
- **Master Grid (POs)**: 
  - Each PO row is expandable via ▾/▸ toggle.
  - Expanded PO shows inline batch rows. This is intentional master/detail — the domain genuinely is hierarchical. UX-3 allows it.
  - PO row shows: PO number, vendor, received date, batch completion (e.g., "18/18"), total amount, actions kebab.
  - Batch completion indicator color-coded: all verified = success, some ready = warning, some rejected = error.
  - Clicking a batch row (the inline child row) opens the batch slide-over.
- **Inline Batch Rows**: 
  - Each batch shows: batch ID, product, quantity, unit price, status, and inline action buttons.
  - Action buttons follow state gating — verified batches show only ✓; ready/in-progress show `Verify` and `Reject`.
  - `[···]` overflow opens: Add Note, Print Label, Move to PO, View History.
- **BulkActionBar**: 
  - Slides up only when batch rows are selected (checkboxes on batch rows). The strip is *not* always-visible — UX-4 applies.
  - Shows count + total value.
  - `Verify All` only acts on Ready/In Progress batches in the selection. `Reject All` opens confirmation with reason input.
- **Batch detail slide-over**: 
  - Header shows batch identity. Footer actions state-gated.
  - Three tabs: Movement (timeline), Sales (linked sales orders), Photos.
  - Status editable via ComboboxCellEditor. Notes editable inline.
  - URL encodes the batch ID: `?batch=B-042`. Browser back closes the slide-over.

### States Shown

- **Default arrival**: All PO rows collapsed. KPI line above the master grid. No slide-over. No bulk bar.
- **Single PO expanded**: Inline batch rows visible. Other POs remain collapsed. Auto-scrolls expanded section into view.
- **Multiple POs expanded**: Independent expand/collapse per PO. Scroll position preserved when toggling.
- **Batch row clicked**: Slide-over opens at 420px. Row remains highlighted in master grid.
- **Batch row checkbox checked**: Row checkbox checked. If ≥1 selected, BulkActionBar appears.
- **PO with zero batches**: Expansion shows empty state: "No intake batches for this PO. [+ Create First Batch]."
- **All batches verified**: PO row shows "22/22" with success indicator. All batch action buttons replaced with ✓ checkmarks (state-gated absence of `Verify`).
- **Batch rejected**: Status shows "Rejected." Rejection reason shown in tooltip. Action surface = `Re-open` only.
- **Loading state**: Skeleton rows in master grid. FilterToolbar disabled.
- **Empty state (no POs pending)**: "No POs pending intake. All caught up!" with link to POs view.
- **Empty state (filtered)**: "No intake batches match your filters. [Clear filters]."
- **Error state**: Inline error banner with retry.

### ARIA Annotations

- **FilterToolbar**: `role="menubar"`, `aria-label="Intake filter toolbar"`
- **[+ Scan] button**: `role="button"`, `aria-label="Scan new intake batch"`
- **Status ▾ pill**: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by batch status"`, `aria-multiselectable="true"`
- **KPI line**: `role="status"`, `aria-live="polite"`, `aria-label="Summary: 8 purchase orders pending, 142 batches, 67,400 dollars"`
- **Master Grid**: `role="treegrid"`, `aria-label="Intake batches by purchase order"`
- **PO expand/collapse toggle**: `role="button"`, `aria-label="Expand purchase order 1012"`, `aria-expanded="true|false"`
- **PO row**: `role="row"`, `aria-level="1"`, `aria-expanded="true|false"`, `aria-setsize="8"`, `aria-posinset="1"`
- **Batch row**: `role="row"`, `aria-level="2"`, `aria-setsize="18"`, `aria-posinset="1"`
- **Batch status indicators**: `aria-label="Batch status: Ready|Verified|Rejected|In Progress"`
- **Batch completion indicator**: `aria-label="18 of 18 batches complete"`
- **[Verify] button**: `role="button"`, `aria-label="Verify batch B-042 — Roma Tomatoes"`
- **[Reject] button**: `role="button"`, `aria-label="Reject batch B-042 — Roma Tomatoes"`
- **[···] overflow button**: `role="button"`, `aria-label="More actions for batch B-042"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 5 selected batches"`
- **Slide-over**: `role="dialog"`, `aria-label="Batch B-042 details"`, `aria-modal="false"`
- **Slide-over status combobox**: `role="combobox"`, `aria-label="Batch B-042 status"`
- **Slide-over tabs**: `role="tablist"`, `aria-label="Batch detail sections"`
- **Movement timeline**: `role="list"`, `aria-label="Movement history for batch B-042"`

### Edge Cases Handled

- **PO with 50+ batches**: Inline batch rows use virtual scrolling within the expanded section.
- **Expand multiple large POs simultaneously**: Each expanded section independently virtualized. Scroll position preserved per section.
- **Very long product names**: Batch row product column truncates with ellipsis at 150px. Full name in tooltip.
- **Batch rejection with required reason**: Reject opens inline confirmation popover (not a modal — popover for sentence-length text) with `Reason for rejection (required)` text input. Submit enables only when reason entered.
- **Bulk reject without reasons**: Modal confirmation: "Reject 5 batches? You'll be prompted for individual rejection reasons." Opens sequential reason entry (modal because this is a destructive multi-step confirmation, per UX-6).
- **Verify already-verified batch**: Button absent (state gating). Operator never sees a disabled button to interpret.
- **Reject verified batch**: Button absent. Only `Re-open` available.
- **Re-open rejected batch**: Re-opens to Ready status. Previous rejection reason preserved in history tab.
- **Photos tab with many photos (50+)**: Paginated or scrollable gallery. Lightbox supports arrow navigation.
- **Photo upload failure**: Error toast with retry. Photo card shows error state.
- **Movement timeline with no entries**: "No movement recorded yet. Movements will appear when the batch is received and processed."
- **Batch moved to different PO**: "Move to PO" opens PO picker. Modal confirmation: "Move B-042 from PO #1012 to selected PO? Sales order links will be updated."
- **Delete batch with linked sales orders**: Modal warning: "Batch B-042 is linked to 2 sales orders. Deleting will unlink these orders. Continue?"
- **Keyboard navigation in tree grid**: Arrow Left collapses PO, Arrow Right expands PO. Arrow Up/Down navigates rows including batch rows. Enter opens detail slide-over on batch row.
- **Filter to "Ready" then expand PO**: Only Ready batches shown inline. Verified batches hidden (but PO completion indicator still reflects total).
- **Browser back button with slide-over open**: Slide-over closes. Expanded PO states preserved.
- **Concurrent verification conflict**: If another user verifies a batch while current user has it selected, optimistic update fails. Toast: "B-042 was already verified by [user]. Refreshing." Grid updates.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Verify/Reject absent for Verified/Rejected batches. Re-open absent for Ready/In Progress. |
| UX-2: Supporting info one click away, never zero | ✓ | Movement, sales, photos as tabs in slide-over. Receipt preview is a slide-over, not permanent. |
| UX-3: One primary surface per view | ✓ | The master grid (POs with inline batch rows) is the primary surface. Master/detail is justified by hierarchical domain. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only when batches are selected. Totals strip absorbed into BulkActionBar. |
| UX-5: Validation errors at point of impact | ✓ | Rejection reason captured at the point of rejection. No permanent validation panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Batch detail in slide-over. Modal reserved for destructive multi-batch operations. Popover for inline notes. |
| UX-7: System never hides what mode the operator is in | ✓ | Active filter pills. Slide-over header shows batch identity. Expansion state visible. |
| UX-8: State changes resolve in place | ✓ | Verify updates the batch row inline. No navigation. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill filters fluidly. Switching views via sidebar is navigation. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Cell edits save immediately. Multi-field reasons use popover with explicit submit. |
| UX-11: URL is the session memory | ✓ | Expansion state, slide-over batch ID, and filters encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty intake → "All caught up!" Empty PO → "+ Create First Batch." Empty filtered → "Clear filters." |
