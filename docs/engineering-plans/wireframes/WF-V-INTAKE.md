## Wireframe: WF-V-INTAKE — IntakeView (MasterDetailView)

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  Page Header                                  │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Intake                                                       [+ Scan]    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              FilterToolbar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Ready ▾ │ In Progress ▾ │ Verified ▾ │ Date ▾ │ PO ▾ │ Export ▾        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  [Ready ×]                                                     [Clear]   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              GridSummaryStrip                                 │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  8 POs pending · 142 batches · $67,400  │ 42 Ready │ 68 In Progress  ...│ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                         Master Grid (POs, expandable)                         │
│ ┌──────┬─────────────┬──────────┬──────────┬───────────┬──────────┬───────┐ │
│ │ ▾/▸  │ PO #        │ Vendor   │ Received │ Batches   │ Total    │Actions│ │
│ ├──────┼─────────────┼──────────┼──────────┼───────────┼──────────┼───────┤ │
│ │  ▾   │ PO #1012    │ Acme Corp│ 06/14/26 │ 18/18     │ $18,200  │ [···] │ │
│ │      │ ┌──────────────────────────────────────────────────────────────┐  │ │
│ │      │ │ Batch rows (inline, PO expanded)                            │  │ │
│ │      │ │ ┌──────┬──────────┬──────┬──────────┬──────────┬──────────┐ │  │ │
│ │      │ │ │B-042 │ Roma Tom │50 cs │ $28.00   │ Ready    │ Verify   │ │  │ │
│ │      │ │ │      │          │      │          │          │ Reject   │ │  │ │
│ │      │ │ │      │          │      │          │          │ •••      │ │  │ │
│ │      │ │ ├──────┼──────────┼──────┼──────────┼──────────┼──────────┤ │  │ │
│ │      │ │ │B-043 │ Iceberg  │80 cs │ $22.50   │ Verified │ Verified │ │  │ │
│ │      │ │ │      │ Lettuce  │      │          │          │ (check)  │ │  │ │
│ │      │ │ │      │          │      │          │          │ •••      │ │  │ │
│ │      │ │ ├──────┼──────────┼──────┼──────────┼──────────┼──────────┤ │  │ │
│ │      │ │ │B-044 │ Green    │60 cs │ $18.00   │In Progress│ Verify  │ │  │ │
│ │      │ │ │      │ Peppers  │      │          │          │ Reject   │ │  │ │
│ │      │ │ │      │          │      │          │          │ •••      │ │  │ │
│ │      │ │ └──────┴──────────┴──────┴──────────┴──────────┴──────────┘ │  │ │
│ │      │ └──────────────────────────────────────────────────────────────┘  │ │
│ ├──────┼─────────────┼──────────┼──────────┼───────────┼──────────┼───────┤ │
│ │  ▸   │ PO #1011    │GlobalFood│ 06/13/26 │ 12/32     │ $42,500  │ [···] │ │
│ ├──────┼─────────────┼──────────┼──────────┼───────────┼──────────┼───────┤ │
│ │  ▸   │ PO #1010    │MetroFresh│ 06/11/26 │ 6/6       │ $9,800   │ [···] │ │
│ ├──────┼─────────────┼──────────┼──────────┼───────────┼──────────┼───────┤ │
│ │  ▾   │ PO #1009    │ Acme Corp│ 06/09/26 │ 22/22     │ $31,200  │ [···] │ │
│ │      │ ┌──────────────────────────────────────────────────────────────┐  │ │
│ │      │ │ Batch rows (inline)                                         │  │ │
│ │      │ │ ┌──────┬──────────┬──────┬──────────┬──────────┬──────────┐ │  │ │
│ │      │ │ │B-038 │ Beefsteak│40 cs │ $35.00   │ Ready    │ Verify   │ │  │ │
│ │      │ │ │      │ Tomato   │      │          │          │ Reject   │ │  │ │
│ │      │ │ │      │          │      │          │          │ •••      │ │  │ │
│ │      │ │ ├──────┼──────────┼──────┼──────────┼──────────┼──────────┤ │  │ │
│ │      │ │ │B-039 │ Celery   │55 cs │ $22.50   │ Ready    │ Verify   │ │  │ │
│ │      │ │ │      │          │      │          │          │ Reject   │ │  │ │
│ │      │ │ │      │          │      │          │          │ •••      │ │  │ │
│ │      │ │ └──────┴──────────┴──────┴──────────┴──────────┴──────────┘ │  │ │
│ │      │ └──────────────────────────────────────────────────────────────┘  │ │
│ ├──────┼─────────────┼──────────┼──────────┼───────────┼──────────┼───────┤ │
│ │  ▸   │ PO #1008    │PrimeProd │ 06/05/26 │ 0/4       │ $5,400   │ [···] │ │
│ └──────┴─────────────┴──────────┴──────────┴───────────┴──────────┴───────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              BulkActionBar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  5 batches selected · $3,870  [Verify All]  [Reject All]  [More ▾]      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                   Detail Slideover (batch click, 420px)                       │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ← Back to intake                     Batch B-042 — Roma Tomatoes   [×] │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  PO:        PO #1012 — Acme Corp                                         │ │
│ │  Product:   Roma Tomatoes                                                │ │
│ │  Qty:       50 cs                                                        │ │
│ │  Status:    ┌──────────┐                                                 │ │
│ │             │ Ready ▾  │  (ComboboxCellEditor)                           │ │
│ │             └──────────┘                                                 │ │
│ │  Notes:     "Slight bruising on outer leaves — otherwise good quality."  │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ┌───────────┐ ┌────────┐ ┌─────────┐                                    │ │
│ │  │ Movement  │ │ Sales  │ │ Photos  │                                    │ │
│ │  └───────────┘ └────────┘ └─────────┘                                    │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ Movement tab                                                           │ │
│ │  ┌──────────────────────────────────────────────────────────────────────┐│ │
│ │  │ Date       │ Action    │ Location  │ User      │ Notes               ││ │
│ │  │ 06/14 08:15│ Received  │ Dock A    │ Maria G.  │ BOL #42891          ││ │
│ │  │ 06/14 08:30│ Inspected │ Cooler 3  │ Maria G.  │ Temp 38°F OK        ││ │
│ │  │ 06/14 09:00│ Staged    │ Rack 12B  │ Carlos R. │ Ready for intake    ││ │
│ │  └──────────────────────────────────────────────────────────────────────┘│ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ Sales tab                                                              │ │
│ │  Linked Sales Orders: 2                                                   │ │
│ │  ┌──────────┬──────────┬──────────┬────────────────────────────────────┐ │ │
│ │  │ SO-2048  │Acme Corp │Confirmed │ Roma Tomatoes × 30cs — $960.00     │ │ │
│ │  │ SO-2043  │Acme Corp │ Draft    │ Roma Tomatoes × 15cs — $480.00     │ │ │
│ │  └──────────┴──────────┴──────────┴────────────────────────────────────┘ │ │
│ │  Remaining: 5 cs unallocated                                              │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ Photos tab                                                             │ │
│ │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐            │ │
│ │  │ [photo]    │ │ [photo]    │ │ [photo]    │ │ [+ Add]    │            │ │
│ │  │ Dock A     │ │ Outer leaf │ │ Temp check │ │            │            │ │
│ │  └────────────┘ └────────────┘ └────────────┘ └────────────┘            │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  [View Full Batch →]  (/intake/batches/:id)                               │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Batch Action Overflow Menu (•••):
┌──────────────────────┐
│  Add Note            │
│  Delete Batch        │
│  View History        │
│  Print Label         │
│  Move to PO          │
└──────────────────────┘
```

### Dimensions

| Element | Measurement |
|---------|-------------|
| Page max-width | 1440px centered |
| FilterToolbar height | 44px + 32px (active filter pills) |
| GridSummaryStrip height | 36px |
| Master PO row height | 48px (collapsed), variable (expanded) |
| Inline batch row height | 56px |
| Batch actions column width | 160px |
| Expand/collapse column width | 36px |
| Slideover standard width | 420px |
| Slideover transition | 300ms cubic-bezier(0.2, 0.8, 0.4, 1) |
| Overflow menu width | 180px |
| Photo thumbnails | 120px × 90px |
| BulkActionBar height | 52px, animates up from bottom |
| Font | Inter 13px, line-height 1.4 |

### Interactive Elements

- **[+ Scan] CTA button**: Opens barcode/QR scan modal or quick-add form for creating a new intake batch. Supports manual entry, barcode scan, or PO lookup.
- **FilterToolbar**: Preset filters for intake status (Ready, In Progress, Verified). Additional filters for Date range, specific PO number, and Export.
- **GridSummaryStrip**: Shows count of pending POs, total batch count, dollar value, and status breakdown. Updates reactively with filters.
- **Master Grid (POs)**: 
  - Each PO row is expandable via ▾/▸ toggle in first column.
  - Expanded PO shows inline batch rows indented underneath.
  - PO row shows: PO number, vendor, received date, batch completion (e.g., "18/18"), total amount, and actions kebab.
  - Batch completion indicator shows fraction complete. Color indicates: all verified = green, some ready = amber, some rejected = red.
  - Clicking a batch row opens DetailSlideover.
- **Inline Batch Rows**: 
  - Each batch row shows: batch ID (B-XXX), product name, quantity, unit price, status, and action buttons.
  - Action buttons per batch: [Verify] (primary), [Reject] (secondary), and [•••] overflow menu.
  - Verified batches show a checkmark instead of action buttons and status changes to "Verified."
  - Rejected batches show status "Rejected" with reason tooltip on hover.
  - [•••] overflow menu opens dropdown with: Add Note, Delete Batch, View History, Print Label, Move to PO.
- **BulkActionBar**: 
  - Slides up from bottom when batch rows are selected (checkboxes on batch rows).
  - Shows count + total value.
  - "Verify All" button bulk-verifies selected Ready batches.
  - "Reject All" opens confirmation with optional reason input.
  - "More ▾" overflow: Export, Print Labels, Assign to User.
- **DetailSlideover (batch click)**: 
  - Shows batch summary: PO reference, product, quantity, editable status, and notes.
  - Three tabs: Movement (timeline of batch movements), Sales (linked sales orders), Photos (photo gallery).
  - Status is editable via ComboboxCellEditor.
  - Notes field is editable inline.
- **Movement tab**: Chronological timeline of batch location/status changes. Timestamp, action, location, user, and notes per entry.
- **Sales tab**: Lists sales orders linked to this batch. Shows remaining unallocated quantity. Links to sales orders.
- **Photos tab**: Thumbnail gallery of batch photos. [+ Add] button to upload new photo. Click thumbnail to view full-size in lightbox.
- **Slideover resize**: Drag handle on left edge resizes between 280px, 420px, 60%.

### States Shown

- **Default (no expansions)**: All PO rows collapsed. Grid shows summary-level data. No slideover.
- **Single PO expanded**: One set of inline batch rows visible. Other POs remain collapsed. Auto-scrolls expanded section into view.
- **Multiple POs expanded**: Independent expand/collapse per PO. Scroll position preserved when toggling.
- **Batch row selected (single click)**: Row highlighted. DetailSlideover opens at 420px.
- **Batch row selected (checkbox)**: Row checkbox checked. If 2+ selected, BulkActionBar appears.
- **PO with zero batches**: Expand shows empty state: "No intake batches for this PO. [+ Create First Batch]."
- **All batches verified**: PO row shows "22/22" with green indicator. All batch action buttons replaced with checkmarks.
- **Batch rejected**: Status shows "Rejected." Rejection reason shown in tooltip. Batch actions replaced with "[Re-open]" button.
- **Loading state**: Skeleton rows in master grid. FilterToolbar disabled.
- **Empty state (no POs pending)**: "No POs pending intake. All caught up!" with link to POs view.
- **Empty state (filtered)**: "No intake batches match your filters. [Clear filters]."
- **Error state**: Inline error banner with retry.

### ARIA Annotations

- **Page header**: `role="banner"`, `aria-label="Intake"`
- **[+ Scan] button**: `role="button"`, `aria-label="Scan new intake batch"`
- **FilterToolbar**: `role="menubar"`, `aria-label="Intake filter toolbar"`
- **GridSummaryStrip**: `role="status"`, `aria-live="polite"`, `aria-label="Summary: 8 purchase orders pending, 142 batches, 67,400 dollars"`
- **Master Grid**: `role="treegrid"`, `aria-label="Intake batches by purchase order"`
- **PO expand/collapse toggle**: `role="button"`, `aria-label="Expand purchase order 1012"`, `aria-expanded="true|false"`
- **PO row**: `role="row"`, `aria-level="1"`, `aria-expanded="true|false"`, `aria-setsize="8"`, `aria-posinset="1"`
- **Batch row**: `role="row"`, `aria-level="2"`, `aria-setsize="18"`, `aria-posinset="1"`
- **Batch status indicators**: `aria-label="Batch status: Ready|Verified|Rejected|In Progress"`
- **Batch completion indicator**: `aria-label="18 of 18 batches complete"`
- **[Verify] button**: `role="button"`, `aria-label="Verify batch B-042 — Roma Tomatoes"`
- **[Reject] button**: `role="button"`, `aria-label="Reject batch B-042 — Roma Tomatoes"`
- **[•••] overflow button**: `role="button"`, `aria-label="More actions for batch B-042"`, `aria-haspopup="menu"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions for 5 selected batches"`
- **DetailSlideover**: `role="complementary"`, `aria-label="Batch B-042 details"`, `aria-modal="true"`
- **Slideover status combobox**: `role="combobox"`, `aria-label="Batch B-042 status"`
- **Slideover tabs**: `role="tablist"`, `aria-label="Batch detail sections"`
- **Movement timeline**: `role="list"`, `aria-label="Movement history for batch B-042"`
- **Photo thumbnails**: `role="list"`, `aria-label="Batch photos"`. Each photo: `role="listitem"`, `aria-label="Photo: [description]"`
- **Photo [+ Add]**: `role="button"`, `aria-label="Add photo to batch B-042"`
- **"View Full Batch"**: `role="link"`, `aria-label="View full batch details for B-042"`

### Edge Cases Handled

- **PO with 50+ batches**: Inline batch rows use virtual scrolling within the expanded section (AG Grid handles). Expand/collapse still performant.
- **Expand multiple large POs simultaneously**: Each expanded section independently virtualized. Scroll position preserved per section. Browser memory usage monitored.
- **Very long product names**: Batch row product column truncates with ellipsis at 150px. Full name in tooltip.
- **Batch rejection with required reason**: Reject button opens inline confirmation with text input: "Reason for rejection (required)." Submit enables only when reason entered.
- **Bulk reject without reasons**: "Reject 5 batches? You'll be prompted for individual rejection reasons." Opens sequential reason entry modal for each batch.
- **Verify already-verified batch**: Button disabled. Tooltip: "This batch is already verified."
- **Reject verified batch**: Button hidden. Only "[Re-open]" shown.
- **Re-open rejected batch**: Re-opens to Ready status. Previous rejection reason preserved in history.
- **Photos tab with many photos (50+)**: Paginated or scrollable gallery. Lightbox supports arrow navigation.
- **Photo upload failure**: Error toast: "Failed to upload photo. [Retry]." Photo card shows error state.
- **Movement timeline with no entries**: "No movement recorded yet. Movements will appear when the batch is received and processed."
- **Batch moved to different PO**: "Move to PO" action opens PO picker. Confirmation required: "Move B-042 from PO #1012 to selected PO? Sales order links will be updated."
- **Delete batch with linked sales orders**: Warning: "Batch B-042 is linked to 2 sales orders. Deleting will unlink these orders. Continue?"
- **Keyboard navigation in tree grid**: Arrow Left collapses PO, Arrow Right expands PO. Arrow Up/Down navigates rows including batch rows. Enter opens detail slideover on batch row.
- **Filter to "Ready" then expand PO**: Only Ready batches shown inline. Verified batches hidden (but PO completion indicator still reflects total).
- **Browser back button with slideover open**: Slideover closes. Expanded PO states preserved.
- **Concurrent verification conflict**: If another user verifies a batch while current user has it selected, optimistic update fails. Toast: "B-042 was already verified by [user]. Refreshing." Grid updates.
