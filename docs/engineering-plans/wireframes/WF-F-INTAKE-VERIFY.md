## Wireframe: WF-F-INTAKE-VERIFY — Verify Intake Flow

### Flow Overview
Operator verifies received batches against purchase orders in the Intake view. Flow: expand PO row (master/detail) → batch rows with Verify/Reject actions → select batches via checkboxes → BulkActionBar → Verify All → spinner → success with green status + PO summary update.

### Step 1: Grid — Expand PO Row (Master/Detail)
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Intake — Ready to Verify (8)                                │
├──────────────────────────────────────────────────────────────┤
│  ▶ #1042 │ Sunny Farms    │ Jun 15 │ Received │ 12 items     │ ← collapsed
│  ▼ #1043 │ GreenLeaf Co   │ Jun 14 │ Received │ 20 items     │ ← expanded
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Batch ID │ Product         │ Qty │ Condition │ Actions   ││
│  │──────────┼─────────────────┼─────┼───────────┼───────────││
│  │ ☐ BAT-51 │ Roma Tomatoes   │ 50  │ Good      │[Verify][✕]││ ← batch rows
│  │ ☐ BAT-52 │ Iceberg Lettuce │ 20  │ Good      │[Verify][✕]││
│  │ ☐ BAT-53 │ Blueberries     │ 30  │ Damaged-2 │[Verify][✕]││
│  └──────────────────────────────────────────────────────────┘│
│  ▶ #1045 │ Harvest Inc     │ Jun 15 │ Received │ 8 items     │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Intake grid shows all POs collapsed (▶ expand icon).
#### User Action
- Click ▶ expand icon on PO #1043 row, or press Space/Enter on the row.
#### After State
- Master/detail expands inline: 3 batch rows visible with checkboxes, product, qty, condition, and per-row actions `[Verify]` and `[✕ Reject]`.
#### Interactive Elements, ARIA, Edge Cases
- Expand/collapse: `aria-expanded="true"`. `role="row"` with `aria-level` for nesting.
- Condition badges: "Damaged-2" shows amber badge. "Good" shows green.
- Edge case: 50+ batches → virtual scroll within expanded section, same as grid.

### Step 2: Batch Rows with Verify/Reject Actions
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ▼ #1043 │ GreenLeaf Co │ Jun 14 │ Received │ 20 items      │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ ☐│BAT-51│🍅 Roma Tomatoes    │ 50lb  │🟢 Good   │[✓][✕] ││
│  │ ☐│BAT-52│🥬 Iceberg Lettuce  │ 20cs  │🟢 Good   │[✓][✕] ││
│  │ ☐│BAT-53│🫐 Blueberries      │ 30cs  │🟠 Dam-2  │[✓][✕] ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- PO row expanded showing batch detail rows.
#### User Action
- Hover over batch row to see action buttons. Click `[✓ Verify]` for single-batch verify, or `[✕ Reject]` to flag.
#### After State
- Single verify: spinner on row, then green flash. Batch moves to "Verified" state (removed from list or grayed out).
#### Interactive Elements, ARIA, Edge Cases
- Per-row actions: `[✓ Verify]` and `[✕ Reject]`. 32px tall rows, actions right-aligned.
- Keyboard: Tab to action buttons within row.
- Edge case: Damaged batch → Reject opens notes dialog "Rejection reason: [____]" before confirming.

### Step 3: Select Batches via Checkboxes
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ▼ #1043 │ GreenLeaf Co │ Jun 14 │ Received │ 20 items      │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ ☑│BAT-51│🍅 Roma Tomatoes    │ 50lb  │🟢 Good   │[✓][✕] ││ ← checked
│  │ ☑│BAT-52│🥬 Iceberg Lettuce  │ 20cs  │🟢 Good   │[✓][✕] ││ ← checked
│  │ ☑│BAT-53│🫐 Blueberries      │ 30cs  │🟠 Dam-2  │[✓][✕] ││ ← checked
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Batches unchecked. No BulkActionBar for batches.
#### User Action
- Click checkboxes for BAT-51, BAT-52, BAT-53. Or click "select all" in header of detail section.
#### After State
- All 3 checked. Rows highlighted. BulkActionBar animates up for batch-level actions.
#### Interactive Elements, ARIA, Edge Cases
- Checkbox: `aria-label="Select batch BAT-51"`. Select all: `aria-label="Select all batches in PO #1043"`.
- Edge case: Mixed conditions selected (Good + Damaged) → verify still allowed; damaged batch processed with damage flag.

### Step 4: BulkActionBar Appears for Batch Selection
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ... Intake grid (above) ...                                 │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  3 batches selected  │  [✓ Verify All]  │  [✕ Reject All]║│
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- BulkActionBar hidden or showing PO-level actions.
#### User Action
- (Automatic — appears when ≥1 batch checkbox is checked.)
#### After State
- Bar shows count "3 batches selected". Primary action: `[✓ Verify All]`. Secondary: `[✕ Reject All]`.
#### Interactive Elements, ARIA, Edge Cases
- Bar: `role="toolbar"`. Animation: translateY(0) over 200ms.
- Escape: clears batch selection, hides bar.
- Edge case: Mixed PO batches selected (batches from different POs) → verify grouped by PO; progress shows "PO #1043: 3 of 3" per PO group.

### Step 5: Click "Verify All" — Spinner → Success
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ▼ #1043 │ GreenLeaf Co │ Jun 14 │ Received │ 20 items      │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  │BAT-51│🍅 Roma Tomatoes    │ 50lb  │ 🟢 Verified ✓    ││ ← green status
│  │  │BAT-52│🥬 Iceberg Lettuce  │ 20cs  │ 🟢 Verified ✓    ││
│  │  │BAT-53│🫐 Blueberries      │ 30cs  │ 🟠 Verif'd w/dmg ││ ← amber: damage noted
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- 3 batches selected. `[✓ Verify All]` clicked.
#### User Action
- Click `[✓ Verify All]` on BulkActionBar.
#### After State
- Spinner on bar: "Verifying 3 of 3... ◌". On success: green flash on each batch row sequentially (200ms staggered). Bar shows "✓ 3 verified" then hides after 2s.
#### Interactive Elements, ARIA, Edge Cases
- Progress: `aria-live="polite"` announces "Verifying batch 1 of 3... Verified." sequentially.
- Edge case: Partial failure → "✓ 2 verified · ✕ 1 failed [View failure]" on bar.

### Step 6: PO Summary Updates After Verification
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Intake — Verified (Today)                                   │
├──────────────────────────────────────────────────────────────┤
│  ▶ #1043 │ GreenLeaf Co │ Jun 14 │ Verified │ 20 of 20 ✓    │ ← status updated
│         │              │        │         │ 3 batches      │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  Dashboard updated: Intake Ready: 8 → 7                  ║│ ← summary strip
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- PO #1043 showing "Received" status with batches pending verification.
#### User Action
- (Automatic after all batches verified.)
#### After State
- PO row collapses (optional). Status updates to "Verified" with green check. "3 batches" sub-label shown.
- Dashboard/Intake summary strip updates reactively: "Intake Ready: 8 → 7".
#### Interactive Elements, ARIA, Edge Cases
- Status transition: CSS transition on status badge color (amber → green). `aria-live="polite"` for count update.
- Edge case: PO fully received AND fully verified → auto-move to "Complete" status.
- Edge case: Rejected batches block full verification → PO stays "Partially Verified" until resolved.

---

### UX Check

| Question | Answer |
|----------|--------|
| Does the flow require mode-switching? | No. Verification happens inline in the master-detail grid; the only modal is rejection-reason capture (a confirmation, not a tool). |
| Is the operator ever shown irrelevant actions? | No. Already-verified batches don't expose Verify; rejected batches expose Resolve/Reject-again only. State-gated per UX-1. |
| Is context preserved if the operator leaves mid-flow? | Yes. Expanded master row id and any selected detail rows encode to URL (UX-11). Reload restores the expansion. |
| Mercury comparison | Mercury reconciles uncategorized transactions inline via a dropdown — the table is the surface, not a separate reconciliation page. This flow mirrors that pattern for batches. |

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Verify/Reject visible only when batch is "Received" and unverified |
| UX-2 Supporting info one click away | ✅ | Batch detail (photos, weight, condition notes) one click away in detail slide-over |
| UX-3 One primary surface per view | ✅ | Intake list is primary; one master row expanded at a time |
| UX-4 Bulk actions on selection only | ✅ | BulkActionBar appears on batch checkbox selection |
| UX-5 Validation at point of impact | ✅ | Damaged-condition warning appears inline on the batch row; rejection-reason dialog explains why batch was rejected |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Rejection reason is a confirmation dialog; batch detail is a slide-over |
| UX-7 Mode is always visible | ✅ | Expanded master row highlighted (bg-green-50); BulkActionBar shows count |
| UX-8 State changes resolve in place | ✅ | Verify resolves inline (green flash on row); no navigation |
| UX-9 Filtering fluid; navigation durable | ✅ | "Ready to Verify" is a Status pill filter, durable as a URL |
| UX-10 Cell saves immediate; forms explicit | ✅ | Single-batch Verify is immediate; bulk Verify is explicit submit |
| UX-11 URL is session memory | ✅ | `?status=ready&expanded=1043&selected=BAT-51,BAT-52` encodes state |
| UX-12 Empty states give next step | ✅ | "All intake verified ✓" empty state when zero Ready batches |
