## Wireframe: WF-F-ERROR-RECOVER — Error Recovery Flow

### Flow Overview
Operator encounters and recovers from a failed inline cell edit. Flow: edit cell → ComboboxCellEditor → Enter → error (red border + ⚠ icon) → hover for tooltip → click to retry (pre-selected value) → success green flash. Alternative: discard to revert.

### Step 1: Cell Edit — ComboboxCellEditor Opens
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales  │ 🏪 Whole Foods Market                              │
├──────────────────────────────────────────────────────────────┤
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ Draft│    │ $1,566  │
│                                       ┌──────┴─────┐         │
│                                       │  Draft     │ ✓       │
│                                       │  Confirmed │ ← hover │
│                                       │  Pending   │         │
│                                       │  Cancelled │         │
│                                       │  On Hold   │         │
│                                       │  Complete  │         │
│                                       └────────────┘         │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Cell showing "Draft ▾". User double-clicked.
#### User Action
- (Automatic from double-click.) Hover "Confirmed" in dropdown.
#### After State
- ComboboxCellEditor open, 280px dropdown. 6 options, "Confirmed" highlighted.
#### Interactive Elements, ARIA, Edge Cases
- See WF-F-SALE-EDIT for full ComboboxCellEditor specs.
- Edge case: Network disconnected before opening → editor opens with cached options; save will fail.

### Step 2: Select Value, Press Enter — Backend Error
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ ◌          │ $1,566  │ ← spinner
└──────────────────────────────────────────────────────────────┘

                    ─── 2 seconds later ───

┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │┌──────────┐│ $1,566  │ ← red border
│         │            │                ││⚠ Confirmed││         │ ← error icon + text
│         │            │                │└──────────┘│         │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- "Confirmed" selected in dropdown. User pressed Enter.
#### User Action
- (Automatic — dropdown closed, spinner shown, API call fails.)
#### After State
- Spinner removed. Cell shows red border (2px, `#E53E3E` solid), ⚠ warning icon, and text "Confirmed" (optimistically set). Row stays otherwise interactive.
#### Interactive Elements, ARIA, Edge Cases
- Error cell: `aria-invalid="true"`, `aria-describedby="tooltip-s2313"`. Red border: `box-shadow: 0 0 0 2px #E53E3E`.
- Error timing: Spinner shows for API timeout (10s default) or until error response.
- Edge case: Multiple cells in error → each independently styled, no cross-contamination.

### Step 3: Hover ⚠ — Tooltip with Error Details
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │┌──────────┐│ $1,566  │
│         │            │                ││⚠ Confirmed││         │
│         │            │                │└─────┬─────┘│         │
│         │            │                      │               │
│         │            │       ┌──────────────┴──────────┐    │
│         │            │       │ ⚠ Network error         │    │ ← tooltip
│         │            │       │                          │    │
│         │            │       │ The server could not be  │    │
│         │            │       │ reached. Your change has │    │
│         │            │       │ not been saved.          │    │
│         │            │       │                          │    │
│         │            │       │ Click to retry.          │    │
│         │            │       │ [Retry]  [✕ Discard]    │    │
│         │            │       └─────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Cell in error state (red border + ⚠ icon). User has not yet hovered.
#### User Action
- Hover mouse over ⚠ icon (or focus via Tab/Shift+Tab).
#### After State
- Tooltip appears (200ms delay). Shows: error icon, human-readable message, and two actions: `[Retry]` and `[✕ Discard]`.
#### Interactive Elements, ARIA, Edge Cases
- Tooltip: `role="tooltip"`, `id="tooltip-s2313"`. Trigger: hover or focus on ⚠. Dismiss: mouse out, Escape, or click action.
- Actions in tooltip: `[Retry]` re-attempts save. `[✕ Discard]` reverts cell to original "Draft" and clears error.
- Edge case: Tooltip near viewport edge → auto-position above/left/right as needed.

### Step 4: Click to Reopen — Previous Value Pre-Selected
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ Confirmed▐▐│ $1,566  │ ← click cell
│                                       ┌────────────┐         │
│                                       │  Draft     │         │
│                                       │▐Confirmed▐ │ ✓       │ ← pre-selected (bold)
│                                       │  Pending   │         │
│                                       │  Cancelled │         │
│                                       │  On Hold   │         │
│                                       │  Complete  │         │
│                                       └────────────┘         │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Cell showing error state: red border + ⚠ icon + "Confirmed" text. Tooltip closed.
#### User Action
- Click the cell (not specifically the ⚠ icon) to re-edit. Or click "Retry" in tooltip.
#### After State
- ComboboxCellEditor reopens. "Confirmed" is pre-selected (with checkmark ✓) and highlighted. Error styling removed from cell.
#### Interactive Elements, ARIA, Edge Cases
- Pre-selection: `aria-selected="true"` on "Confirmed" option. Input shows "Confirmed".
- Tooltip auto-closes when editor reopens.
- Edge case: User wants a different value → can arrow to another option; new value saved on Enter.

### Step 5: Select Again — Save Succeeds → Green Flash
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ ◌          │ $1,566  │ ← retry spinner
└──────────────────────────────────────────────────────────────┘

                    ─── save succeeds ───

┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ ✓ Confirmed│ $1,566  │ ← green flash 200ms
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Editor open with "Confirmed" pre-selected. User pressed Enter (or clicked option).
#### User Action
- Press Enter or click "Confirmed" in dropdown.
#### After State
- Retry spinner shown. On success: green checkmark overlay flashes 200ms ("✓ Confirmed"). Cell returns to display mode. Row updated. Summary strip reaction.
#### Interactive Elements, ARIA, Edge Cases
- Same success animation as WF-F-SALE-EDIT Step 5.
- `aria-live="polite"`: "Status updated to Confirmed".
- Edge case: Retry also fails → back to error state (Step 2). After 3 consecutive failures, show persistent error banner "Unable to save. Please check your connection and try again."

### Step 6: Alternative — ✕ Discard (Revert to Original)
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │┌──────────┐│ $1,566  │ ← error state
│         │            │                ││⚠ Confirmed││         │
│         │            │                │└──────────┘│         │
│         │            │                      │               │
│         │            │       ┌──────────────┴──────────┐    │
│         │            │       │  [Retry]  [✕ Discard]   │    │ ← click Discard
│         │            │       └─────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘

                    ─── discard clicked ───

┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ Draft ▾    │ $1,566  │ ← reverted
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Cell in error state (red border + ⚠ icon). Tooltip visible with `[✕ Discard]`.
#### User Action
- Click `[✕ Discard]` in tooltip. Or click the × button that appears on the error cell itself (if visible).
#### After State
- Error state cleared immediately. Cell reverts to original value "Draft". Tooltip closes. No API call needed (local revert).
#### Interactive Elements, ARIA, Edge Cases
- Discard: immediate, no confirmation (non-destructive — just reverting to known value).
- `aria-live="polite"`: "Change discarded. Value reverted to Draft."
- Edge case: Cell auto-reverts after 30s of error state (optional, configurable) → if enabled, shows "Auto-reverted" tooltip.
- Edge case: Dirty form elsewhere → discard only affects this cell; other unsaved changes preserved.
