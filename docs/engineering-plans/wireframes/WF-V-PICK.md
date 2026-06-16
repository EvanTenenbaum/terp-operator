# Wireframe: WF-V-PICK — PickView

**Template:** WizardView (with step indicator)
**Entity:** PickRecord
**Wireframe ID:** WF-V-PICK

---

## Full View — Default State (Tab: All, Step 1 Active)

```
┌─View Header──────────────────────────────────────────────────────────────┐
│ Pick Queue                                                      [Scan]   │
└───────────────────────────────────────────────────────────────────────────┘
┌─Step Indicator───────────────────────────────────────────────────────────┐
│                                                                           │
│   ● ────── ○ ────── ○ ────── ○                                          │
│  Step 1  Step 2   Step 3   Step 4                                        │
│  Pending Picking  Verify  Complete                                        │
│   (12)    (8)      (5)     (0)                                            │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [▾ Data views]  │  Date ▾  │  Keyword ▾  │ Location ▾  │ Group ▾  │ Sort ▾ │ ⬇ │
└───────────────────────────────────────────────────────────────────────────┘
┌─GridSummaryStrip─────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│ │ 25 Picks     │ │ 1,847 Items  │ │ 12 Pending   │ │ 92% Fill     │      │
│ │    Today     │ │    Total     │ │   Now        │ │   Rate       │      │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
┌─ViewTabBar───────────────────────────────────────────────────────────────┐
│  All (25) │ Pending (12) │ In Progress (8) │ Picked (5)                   │
└───────────────────────────────────────────────────────────────────────────┘
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
┌─BulkActionBar (conditional)──────────────────────────────────────────────┐
│ 1 pick selected                                                           │
│ [Start Picking] [Assign to Me] [Print Pick List] [···]                    │
└───────────────────────────────────────────────────────────────────────────┘
┌─DetailSlideover: Peek (280px)────────────────────────────────────────────┐
│ PCK-2212                                             ×                   │
│ Order: SO-7730 · FreshFields                                             │
│ Item: Romaine Hearts · 96 units                                          │
│ Location: Cooler 2-B                                                     │
│ Status: In Progress                                                      │
│ [Mark Picked] [Report Issue]                                             │
│ ◀ drag                                                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Step Indicator — Step 2 (In Progress) Active

```
┌─Step Indicator───────────────────────────────────────────────────────────┐
│                                                                           │
│   ✓ ────── ● ────── ○ ────── ○                                          │
│  Step 1  Step 2   Step 3   Step 4                                        │
│  Pending Picking  Verify  Complete                                        │
│   (12)✓   (8)●    (5)     (0)                                             │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```
- Step 1 shows checkmark (completed). Step 2 highlighted (current). Steps 3-4 greyed.
- Count badges update as picks progress through workflow.
- Clicking a completed step shows that step's records (read-only).

---

## DetailSlideover: Standard (420px) — Items Tab

```
┌─Main Content (shifts left)───────────────────┬─DetailSlideover: Standard─┐
│                                               │ PCK-2212                   │
│  [Grid is narrower, fully functional]         │ Order: SO-7730             │
│                                               │ Item: Romaine Hearts       │
│                                               │ Qty: 96 · Loc: Cooler 2-B  │
│                                               │ [Mark Picked] [Report] [✕]│
│                                               │────────────────────────────│
│                                               │ Ord Det│ Items│ Loc │ Hist │
│                                               │        │  ▾   │     │      │
│                                               │────────────────────────────│
│                                               │ Order Lines to Pick:       │
│                                               │ ┌────────────────────────┐ │
│                                               │ │ ☑ Romaine Hearts  96   │ │
│                                               │ │ ☑ Romaine Hearts  48   │ │
│                                               │ │ ☐ Romaine Hearts  24   │ │
│                                               │ │ ☐ Butter Lettuce  36   │ │
│                                               │ │ ☐ Arugula         24   │ │
│                                               │ └────────────────────────┘ │
│                                               │ Remaining: 60 / 228 units  │
│                                               │ [Open in full view →]      │
└───────────────────────────────────────────────┴────────────────────────────┘
```
- Checkboxes show progress within the pick. Checked = already picked.
- "Remaining: X / Y units" progress counter updates in real-time.

---

## Cells — In-Progress State Detail

```
│ ☑ │ PCK-2212  │ SO-7730 FreshFld │ Romaine Hearts    │ 96   │ Cooler 2-B  │ In Prog   │
│   │           │                  │                   │ 24/96│             │ 25% ██░░░░│
```

- **Qty column:** Shows "picked/total" when In Progress. Shows total only when Pending/Complete.
- **Status column:** Shows progress bar + percentage when In Progress.

---

## Dimensions

- View container: 100vw × 100vh, overflow hidden
- View Header: 56px tall. "Pick Queue" title. [Scan] button right-aligned.
- Step Indicator: 80px tall. Horizontal stepper with 4 steps. Step circles 32px diameter. Connector lines 64px long, 2px thick. Active step: filled color. Completed: checkmark. Future: grey outline.
- FilterToolbar: 44px tall. Location quick filter replaces Amount (warehouse zones).
- GridSummaryStrip: 80px tall, 4 metric cards.
- ViewTabBar: 40px tall. Tabs 140px wide.
- AG Grid: 32px row height. ID column 110px. Order column 160px. Item column 180px. Qty column 100px. Location column 130px. Status column 140px (with progress bar).
- BulkActionBar: 52px tall. Sticky bottom.
- DetailSlideover: Peek 280px → Standard 420px → Wide 60vw.
- Progress bar: 4px tall, inline in status cell. Width matches percentage. CSS transition width 300ms.
- Font: Inter 13px body, 11px secondary, 14px header.

---

## Interactive Elements

- **Step Indicator circles:** Click → filters grid to that step's records. ARIA: role="tab" within role="tablist".
- **Step connector lines:** Animated fill effect as picks progress. CSS transition on width.
- **Checkbox (AG Grid):** Row selection for bulk actions. Shift+click range select.
- **Status cell:** Double-click → ComboboxCellEditor (Pending/In Progress/Picked). Also: progress bar clickable to advance step.
- **Qty inline editor:** Double-click on Qty cell when In Progress → number input. Enter commits. Validates: cannot exceed remaining.
- **Row click:** Single-click → DetailSlideover peek. Double-click → standard.
- **BulkActionBar Start Picking:** Moves selected Pending rows to In Progress. Assigns to current user.
- **BulkActionBar Assign to Me:** Reassigns picks. Shows confirmation if already assigned.
- **BulkActionBar Print Pick List:** Opens printable view in new tab. Shows location-sorted list.
- **Detail Items tab:** Checkboxes for each line. Clicking marks individual line as picked.
- **Mark Picked button:** Transitions entire pick to Picked status. Validates all lines picked.
- **Report Issue button:** Opens dialog with issue type dropdown (Damaged, Missing, Wrong Item, Quality). Creates incident record.
- **Scan button:** Opens barcode scanner (camera or manual entry). Scans location barcode to verify.

---

## States Shown

- **Default (All tab, Step 1):** Full pick queue visible. Pending picks highlighted with amber left-border.
- **In Progress (Step 2):** Rows show progress bars. Detail panel shows per-line checkboxes.
- **Verification (Step 3):** Read-only review. Picked items shown with ✓ checkmark. "Verified by" column appears with reviewer name.
- **Complete (Step 4):** All picks for order complete. Green left-border. Cannot be modified.
- **Scanning mode:** Camera overlay above grid. Scanning animation. Beep on successful scan.
- **Empty state:** "All picks complete! 🎉" illustration. "No pending picks for today." Show yesterday's completed picks.
- **Issue reported:** Row shows ⚠ indicator. Status changes to "Issue". Issue details in History tab.
- **Error state:** Toast for failed status change. Retry button in BulkActionBar.

---

## ARIA Annotations

- View container: role="region", aria-label="Pick queue"
- Step Indicator: role="tablist", aria-label="Pick workflow steps"
- Step circles: role="tab", aria-selected, aria-controls="pick-grid-panel"
- Completed step: aria-label="Step 1: Pending — completed, 12 picks"
- Active step: aria-label="Step 2: Picking — in progress, 8 picks"
- Future step: aria-label="Step 3: Verify — not yet available, 5 queued"
- FilterToolbar: role="menubar", aria-label="Filter and data controls"
- GridSummaryStrip: role="region", aria-label="Pick summary metrics"
- AG Grid: role="grid", aria-label="Pick records"
- Progress bar: role="progressbar", aria-valuenow, aria-valuemin="0", aria-valuemax="100", aria-label="Pick progress: 25%"
- Qty cell (editing): role="spinbutton", aria-valuenow, aria-valuemin="0", aria-valuemax
- BulkActionBar: role="toolbar", aria-label="Pick actions"
- DetailSlideover: role="complementary", aria-label="Pick details"
- Items tab checkboxes: role="checkbox", aria-checked, aria-label="Pick line: Romaine Hearts, 96 units"
- Barcode scanner: aria-live="polite", aria-label="Scanner active. Point camera at location barcode."
- Scan button: role="button", aria-label="Scan location barcode"

---

## Edge Cases Handled

- **Partial pick (picked less than total):** Qty shows "72/96". Progress bar at 75%. Status stays "In Progress".
- **Over-pick attempt:** Input validation rejects qty > remaining. Tooltip: "Cannot pick more than 24 remaining units."
- **Pick order with multiple line items:** Detail Items tab lists all lines with checkboxes. Progress aggregates across all lines.
- **Location change mid-pick:** "Location Changed" warning badge. Reason captured in History tab.
- **Scan wrong location:** Red flash on scanner. Error message: "Location does not match Cooler 2-B. Expected: Cooler 2-B, Scanned: Cooler 2-C."
- **Concurrent pick assignment:** If two users start picking same order, second user sees toast: "Pick already in progress by [User]. View only."
- **Pick cancellation:** Revert from In Progress to Pending. Clear assignments. Confirmation dialog required.
- **Expired pick (not completed within shift):** Row highlighted in amber. "Aged pick — 3d 4h" badge. Can be reassigned.
- **Zero-quantity line:** Line auto-marked as N/A. Skipped in progress calculation. Info tooltip: "0 qty ordered — nothing to pick."
