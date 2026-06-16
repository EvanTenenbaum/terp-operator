# Wireframe: WF-V-PICK — PickView

**Template:** WizardView (with step indicator)
**Entity:** PickRecord
**Wireframe ID:** WF-V-PICK

---

### UX Posture

The pick queue is the only primary surface. The Step Indicator is a glanceable progress display — not a competing surface. Status filter is a pill in the FilterToolbar. Footer actions on the slide-over are state-gated by pick state. Inline progress at the row keeps the operator on the table for the common case.

---

## Full View — Default State (no selection)

```
┌─Step Indicator (glanceable, not a competing surface)─────────────────────┐
│   ● ────── ○ ────── ○ ────── ○                                          │
│  Pending  Picking  Verify  Complete                                       │
│   (12)     (8)      (5)     (0)                                           │
└──────────────────────────────────────────────────────────────────────────┘
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [+ Scan] │ Status ▾ │ Data views │ Date │ Keyword │ Location │ Group │   │
│          │ Sort ▾ │ Export ▾                                              │
└──────────────────────────────────────────────────────────────────────────┘
┌─KPI Line─────────────────────────────────────────────────────────────────┐
│ 25 picks today · 1,847 items total · 12 pending now · 92% fill rate      │
│                                                       [Show breakdown ▾] │
└──────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Order            │ Item              │ Qty  │ Location    │ Status    │
├───┼───────────┼──────────────────┼───────────────────┼──────┼─────────────┼───────────┤
│ ☐ │ PCK-2214  │ SO-7732 BerryBest│ Strawberries      │ 240  │ Bay C-12    │ Pending   │
│ ☐ │ PCK-2213  │ SO-7731 BerryBest│ Blueberries       │ 180  │ Bay A-04    │ Pending   │
│ ☑ │ PCK-2212  │ SO-7730 FreshFld │ Romaine Hearts    │ 96   │ Cooler 2-B  │ In Prog   │
│ ☐ │ PCK-2211  │ SO-7729 GreenBsk │ Organic Kale      │ 72   │ Cooler 1-A  │ Picked    │
│ ☐ │ PCK-2210  │ SO-7728 OrganicTr│ Heirloom Tomatoes │ 36   │ Bay B-08    │ Picked    │
│ ☐ │ PCK-2209  │ SO-7727 PacificAg│ Avocados          │ 144  │ Bay D-03    │ In Prog   │
│ ☐ │ PCK-2208  │ SO-7725 FarmDir  │ Sweet Potatoes    │ 60   │ Bin F-11    │ Pending   │
└───┴───────────┴──────────────────┴───────────────────┴──────┴─────────────┴───────────┘
┌─BulkActionBar (appears only when rows selected)──────────────────────────┐
│ 1 pick selected                                                           │
│ [Start Picking] [More ▾: Assign to Me | Print Pick List]                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### State-Gated Action Surface

| Pick State    | Visible Actions                              |
|---------------|----------------------------------------------|
| Pending       | `Start Picking`, `Assign`                    |
| In Progress   | `Mark Picked`, `Report Issue`, `Pause`       |
| Picked        | `Verify`, `Report Issue`                     |
| Verified      | `View Complete`                              |
| Complete      | `View Documents` (read-only)                 |

---

## DetailSlideover — Tabs: Order Detail | Items | Location | History

Footer actions follow state-gating.

---

## Cells — In-Progress State Detail

```
│ ☑ │ PCK-2212  │ SO-7730 FreshFld │ Romaine Hearts    │ 96   │ Cooler 2-B  │ In Prog   │
│   │           │                  │                   │ 24/96│             │ 25% ██░░░░│
```

- **Qty column**: Shows "picked/total" when In Progress.
- **Status column**: Shows progress bar + percentage when In Progress.

---

## Dimensions

- View container: 100vw × 100vh
- Step Indicator: 80px tall; step circles 32px; connector lines 64px × 2px
- FilterToolbar: 44px (plus 32px chip row)
- KPI line: 32px / ~96px expanded
- AG Grid: 32px row height; ID 110px; Order 160px; Item 180px; Qty 100px; Location 130px; Status 140px (with progress bar)
- BulkActionBar: 52px
- Slide-over: Peek 280px → Standard 420px → Wide 60vw
- Progress bar: 4px tall, inline in status cell; CSS transition width 300ms

---

## Interactive Elements

- **Step Indicator circles**: Click → filters grid to that step's records. Each is a deep-link filter. ARIA: `role="tab"`.
- **Step connector lines**: Animated fill as picks progress.
- **Status ▾ pill**: Multi-select with `Pending (12)`, `In Progress (8)`, `Picked (5)`, `Verified`, `Complete`. Replaces prior ViewTabBar.
- **Status cell**: ComboboxCellEditor (Pending/In Progress/Picked). Progress bar clickable to advance step.
- **Qty inline editor**: Double-click on Qty cell when In Progress → number input. Validates: cannot exceed remaining.
- **Row click**: Single → slide-over peek. Double → standard.
- **BulkActionBar Start Picking**: Moves selected Pending rows to In Progress. Assigns to current user.
- **BulkActionBar Assign to Me**: Reassigns; modal if already assigned.
- **BulkActionBar Print Pick List**: Opens printable view; location-sorted.
- **Detail Items tab**: Checkboxes for each line. Clicking marks individual line as picked.
- **Mark Picked button**: Validates all lines picked.
- **Report Issue button**: Opens dialog with issue type dropdown (Damaged, Missing, Wrong Item, Quality).
- **Scan button**: Opens barcode scanner.

---

## States Shown

- **Default (no filter)**: Full pick queue visible.
- **In Progress (Step 2 filter active)**: Rows show progress bars.
- **Verification (Step 3 filter active)**: Read-only review; "Verified by" column appears.
- **Complete (Step 4 filter active)**: Success-state left border; cannot be modified.
- **Scanning mode**: Camera overlay; scanning animation.
- **Empty state**: "All picks complete! 🎉" + show yesterday's completed.
- **Issue reported**: Row shows ⚠; status changes to "Issue."
- **Error state**: Toast.

---

## ARIA Annotations

- Step Indicator: `role="tablist"`, `aria-label="Pick workflow steps"`
- Step circles: `role="tab"`, `aria-selected`, `aria-controls="pick-grid-panel"`
- Completed step: `aria-label="Step 1: Pending — completed, 12 picks"`
- Active step: `aria-label="Step 2: Picking — in progress, 8 picks"`
- FilterToolbar: `role="menubar"`, `aria-label="Pick filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by pick status"`, `aria-multiselectable="true"`
- KPI line: `role="status"`, `aria-live="polite"`
- AG Grid: `role="grid"`, `aria-label="Pick records"`
- Progress bar: `role="progressbar"`, `aria-valuenow`, `aria-valuemax="100"`, `aria-label="Pick progress: 25%"`
- Qty cell (editing): `role="spinbutton"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax`
- BulkActionBar: `role="toolbar"`, `aria-label="Pick actions"`
- Slide-over: `role="dialog"`, `aria-label="Pick details"`
- Items tab checkboxes: `role="checkbox"`, `aria-label="Pick line: Romaine Hearts, 96 units"`
- Barcode scanner: `aria-live="polite"`, `aria-label="Scanner active. Point camera at location barcode."`
- Scan button: `role="button"`, `aria-label="Scan location barcode"`

---

## Edge Cases Handled

- **Partial pick**: Qty "72/96"; progress at 75%; status stays "In Progress."
- **Over-pick attempt**: Input rejects qty > remaining; tooltip.
- **Pick order with multiple line items**: Items tab lists all lines.
- **Location change mid-pick**: "Location Changed" warning badge.
- **Scan wrong location**: Error flash; "Location does not match Cooler 2-B."
- **Concurrent pick assignment**: Toast "Pick already in progress by [user]. View only."
- **Pick cancellation**: Revert from In Progress to Pending; modal confirmation.
- **Expired pick**: "Aged pick — 3d 4h" warning badge.
- **Zero-quantity line**: Auto-marked N/A; skipped in progress.

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Mark Picked only on In Progress; Verify only on Picked; View Complete only on Verified. |
| UX-2: Supporting info one click away, never zero | ✓ | Order Detail, Items, Location, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Pick queue is the only primary surface. Step Indicator is glanceable progress, not a competing surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Wrong location at the scanner. Over-pick at the cell. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Scan modal-like overlay. Cancel modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Step indicator shows operator's position in workflow. Filter pills. |
| UX-8: State changes resolve in place | ✓ | Status transitions inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. Step circles are filters. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status edits save. Issue report form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID, step filter encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → "All picks complete!" Empty filtered → Clear filters. |
