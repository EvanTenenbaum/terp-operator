## Wireframe: WF-F-SALE-EDIT — Inline Edit Cell Flow

### Flow Overview
Operator edits a sale status cell via inline ComboboxCellEditor. Flow: double-click cell → dropdown opens (280px, 32px options) → type to filter → Enter to commit → spinner → green flash 200ms / error with red border + tooltip.

### Step 1: Grid — Double-Click Status Cell
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales  │ 🏪 Whole Foods Market                              │
├──────────────────────────────────────────────────────────────┤
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2312 │ 2026-06-10 │ Trader Joe's   │ Confirmed  │ $2,100  │
│  S-2313 │ 2026-06-12 │ Whole Foods    │ Draft ▾    │ $1,566  │ ← cursor: double-click
│  S-2314 │ 2026-06-13 │ Sprouts        │ Draft      │ $890    │
│  S-2315 │ 2026-06-15 │ Whole Foods    │ Pending    │ $3,200  │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Grid showing sales rows. Status cell for S-2313 displays "Draft ▾" (indicating editable dropdown).
#### User Action
- Double-click the status cell, or single-click + Enter/F2.
#### After State
- ComboboxCellEditor activates: dropdown overlay opens below the cell, 280px wide. Cell text becomes editable input.
#### Interactive Elements, ARIA, Edge Cases
- Cell: `role="gridcell"`, `aria-readonly="false"`. `tabindex="0"`.
- Activation: double-click, Enter, or F2. Edge case: read-only rows → cell not editable, no ▾ indicator.

### Step 2: ComboboxCellEditor Opens
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ Draft│    │ $1,566  │
│                                       ┌──────┴─────┐         │
│  S-2314 │ 2026-06-13 │ Sprouts        │ Draft ▾    │         │
│                                       │            │         │ ← dropdown 280px
│                                       │  Draft     │         │
│                                       │  Confirmed │ ← hover │
│                                       │  Pending   │         │
│                                       │  Cancelled │         │
│                                       │  On Hold   │         │
│                                       │  Complete  │         │
│                                       └────────────┘         │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Cell showing "Draft ▾" in display mode.
#### User Action
- (Automatic — dropdown appears on activation. Current value "Draft" is pre-highlighted.)
#### After State
- Dropdown visible with 6 options, each 32px tall. "Draft" has checkmark (selected). "Confirmed" under hover highlight.
#### Interactive Elements, ARIA, Edge Cases
- Combobox: `role="combobox"`, `aria-expanded="true"`, `aria-haspopup="listbox"`. Dropdown: `role="listbox"`.
- Options: `role="option"`, `aria-selected="true/false"`. 32px height, Inter 13px, padding 8px 12px.
- Keyboard: Arrow keys navigate, Enter selects, Escape closes without change.
- Edge case: Only 1 option available → still show dropdown; single option is pre-selected.

### Step 3: Type to Filter
#### Layout (ASCII)
```
┌─────────────┐
│ Status│     │
├───────┴─────┤
│ con│        │ ← typed "con" in input
└─────────────┘
┌─────────────┐
│ Confirmed   │ ← filtered to 1 result, highlighted
└─────────────┘
```
#### Before State
- Full dropdown visible (6 options).
#### User Action
- Type "con" into the combobox input.
#### After State
- Dropdown filters to matching options: "Confirmed" only. Highlighted for selection.
#### Interactive Elements, ARIA, Edge Cases
- Filter: case-insensitive contains match, instant (no debounce). `aria-activedescendant` updates to highlighted option.
- Keyboard: Arrow Down moves focus into filtered list. Escape clears filter, restores full list.
- Edge case: No matches → dropdown shows "No results" message (non-selectable).
```
┌─────────────┐
│ xyz│        │
└─────────────┘
┌─────────────┐
│ No results  │ ← grayed out, not interactive
└─────────────┘
```

### Step 4: Press Enter — Spinner (Saving State)
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ ◌          │ $1,566  │ ← spinner in cell
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- "Confirmed" highlighted in dropdown. User pressed Enter.
#### User Action
- Press Enter or click the highlighted option.
#### After State
- Dropdown closes. Cell shows spinner (◌) indicating save in progress. Button/row interactions disabled during save.
#### Interactive Elements, ARIA, Edge Cases
- Spinner: `aria-busy="true"`, `aria-label="Saving..."`. Cell: `role="gridcell"`, `aria-live="polite"`.
- During save: row editing locked (other cells not editable). Escape does nothing during save.
- Edge case: Save takes >3s → show "Still saving..." text next to spinner.

### Step 5: Green Checkmark Flash — Success
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │ ✓ Confirmed│ $1,566  │ ← green flash 200ms
│  S-2314 │ 2026-06-13 │ Sprouts        │ Draft      │ $890    │
└──────────────────────────────────────────────────────────────┘
Summary strip:  ▸ 4 sales │ 3 Confirmed │ $7,756 total  ← updates reactively
```
#### Before State
- Cell showing spinner.
#### User Action
- (Automatic — save completes successfully.)
#### After State
- Green checkmark overlay flashes on cell for 200ms: "✓ Confirmed". Fades out. Cell now shows "Confirmed" (non-editable display mode until next activation). Summary strip at bottom updates counts/totals reactively.
#### Interactive Elements, ARIA, Edge Cases
- Flash animation: CSS class `cell-success-flash`, opacity 1→0 over 200ms, then removed.
- `aria-live="polite"` announcement: "Status updated to Confirmed".
- Edge case: Rapid consecutive edits → queue saves; don't overlap spinners.

### Step 6: Error Scenario — Save Fails
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  #      │ Date       │ Customer       │ Status     │ Total   │
├─────────┼────────────┼────────────────┼────────────┼─────────┤
│  S-2313 │ 2026-06-12 │ Whole Foods    │╔═══╗       │ $1,566  │ ← red border
│         │            │                │║⚠ Confirmed║       │
│         │            │                │╚═══╝       │         │
│                        ┌──────────────────────────┐         │
│                        │ ⚠ Network error          │         │ ← tooltip on hover
│                        │ Click to retry.          │         │
│                        │ [Retry]  [✕ Discard]     │         │
│                        └──────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Spinner shown during save.
#### User Action
- (Automatic — API save fails.)
#### After State
- Cell shows red border (2px, `#E53E3E`), ⚠ warning icon, and text remains "Confirmed" (optimistically set). Hover over ⚠ shows tooltip with error message and actions.
#### Interactive Elements, ARIA, Edge Cases
- Error cell: `aria-invalid="true"`, `aria-describedby="error-tooltip-2313"`.
- Tooltip: `role="tooltip"`, appears on hover/focus. Actions: `[Retry]` re-attempts save, `[✕ Discard]` reverts to original "Draft".
- Edge case: Multiple cells fail → each shows independent error state. Bulk retry via "Retry all failed" banner.
- Edge case: Conflict (another user changed same cell) → tooltip "Modified by another user. Refresh to see changes." with `[Refresh]` action.
