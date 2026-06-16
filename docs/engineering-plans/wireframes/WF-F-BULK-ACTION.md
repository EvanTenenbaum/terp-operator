## Wireframe: WF-F-BULK-ACTION — Bulk Action Flow

### Flow Overview
Operator performs actions on multiple rows at once. Flow: select rows via checkboxes → BulkActionBar animates up → dropdown menus for actions → execute primary action → progress indicator → success / partial failure with failure details.

### Step 1: Select Rows via Checkboxes
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales                    [🔍 Search...]          [+ New Sale]│
├──────────────────────────────────────────────────────────────┤
│  ☐ │ #      │ Customer      │ Status    │ Total              │
├────┼────────┼───────────────┼───────────┼────────────────────┤
│  ☑ │ S-2312 │ Trader Joe's  │ Confirmed │ $2,100.00  ← checked│
│  ☑ │ S-2313 │ Whole Foods   │ Draft     │ $1,566.00  ← checked│
│  ☐ │ S-2314 │ Sprouts       │ Pending   │ $890.00            │
│  ☑ │ S-2315 │ Whole Foods   │ Pending   │ $3,200.00  ← checked│
│  ☐ │ S-2316 │ Costco        │ Draft     │ $15,400.00         │
│  ☐ │ S-2317 │ US Foods      │ Confirmed │ $4,100.00          │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Grid with all checkboxes unchecked. BulkActionBar hidden.
#### User Action
- Click checkboxes on rows S-2312, S-2313, S-2315. Shift+click for range select.
#### After State
- 3 rows highlighted with selected background color. BulkActionBar animates up from bottom.
#### Interactive Elements, ARIA, Edge Cases
- Checkbox: `role="checkbox"`, `aria-label="Select sale S-2312"`. Select all: header checkbox.
- Range select: Shift+click selects contiguous rows. Ctrl/Cmd+click toggles individual.
- Edge case: Scroll offscreen → selection persists; BulkActionBar floats fixed-bottom over scroll.

### Step 2: BulkActionBar Animates Up
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ... Sales Grid (above) ...                                  │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  ☑ 3 selected · $6,866.00                               ║│ ← count + total
│  ║  [Status ▾]  [✓ Confirm]  [More ▾]           [✕ Clear]  ║│ ← action buttons
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Bar hidden (offscreen below viewport).
#### User Action
- (Automatic — bar appears after ≥1 checkbox selection.)
#### After State
- Bar slides up (translateY 200ms). Shows: selection count, total value, primary action `[✓ Confirm]`, secondary action `[Status ▾]`, overflow `[More ▾]`, and `[✕ Clear]`.
#### Interactive Elements, ARIA, Edge Cases
- Bar: `role="toolbar"`, `aria-label="Bulk actions for 3 selected sales"`.
- Animation: `transform: translateY(100%) → translateY(0)`, `transition: transform 200ms ease-out`.
- `[✕ Clear]`: deselects all, hides bar. Escape key: same behavior.
- Edge case: Mixed statuses → certain actions disabled (e.g., can't Confirm already-Confirmed).

### Step 3: Click [More ▾] — Overflow Dropdown
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ... Sales Grid ...                                          │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  3 selected · $6,866  [Status ▾]  [Confirm]  [More ▲]  ║│
│  ║                                               ┌────────┐║│
│  ║                                               │ Export  │║│ ← dropdown
│  ║                                               │ Assign  │║│
│  ║                                               │ ─────── │║│
│  ║                                               │ Delete  │║│ ← destructive (red)
│  ╚═══════════════════════════════════════════════╧════════╧╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- `[More ▾]` button closed (arrow down).
#### User Action
- Click `[More ▾]` button.
#### After State
- Dropdown opens above/over bar (not pushing content). Shows 3 options: Export, Assign, Delete (with destructive style). Arrow changes to ▲.
#### Interactive Elements, ARIA, Edge Cases
- Dropdown: `role="menu"`, `aria-label="More actions"`. Items: `role="menuitem"`.
- "Delete": red text, `aria-describedby="destructive-action-warning"`.
- Keyboard: Arrow keys navigate items, Enter selects, Escape closes.
- Edge case: Assign → opens sub-panel "Assign to: [salesperson ▾]" for assignment.

### Step 4: Execute Primary Action — Progress
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  ... Sales Grid (dimmed) ...                                 │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  ◌ Confirming 2 of 3...                                 ║│ ← progress
│  ║  ████████░░░░░░░░  66%                                  ║│ ← progress bar
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- `[✓ Confirm]` clicked. 3 sales selected.
#### User Action
- (Automatic — confirmation dialog may appear first for destructive/irreversible.)
#### After State
- Grid dimmed (non-interactive during bulk op). BulkActionBar shows progress: "Confirming 2 of 3...", progress bar at 66%. Row-by-row processing with live update.
#### Interactive Elements, ARIA, Edge Cases
- Progress bar: `role="progressbar"`, `aria-valuenow="66"`, `aria-valuemin="0"`, `aria-valuemax="100"`. `aria-label="Bulk confirm progress"`.
- Row-by-row: each row flashes green on success, red on failure (staggered 150ms).
- Edge case: Op takes >10s → show estimated time "About 5s remaining".

### Step 5: Success — Green Flash + Selection Cleared
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales                                                       │
├──────────────────────────────────────────────────────────────┤
│  ☐ │ #      │ Customer      │ Status    │ Total              │
├────┼────────┼───────────────┼───────────┼────────────────────┤
│  ☐ │ S-2312 │ Trader Joe's  │ ✓ Confirmed│ $2,100.00  ← green│
│  ☐ │ S-2313 │ Whole Foods   │ ✓ Confirmed│ $1,566.00  ← green│
│  ☐ │ S-2314 │ Sprouts       │ Pending    │ $890.00           │
│  ☐ │ S-2315 │ Whole Foods   │ ✓ Confirmed│ $3,200.00  ← green│
│  ☐ │ S-2316 │ Costco        │ Draft      │ $15,400.00        │
│  ☐ │ S-2317 │ US Foods      │ Confirmed  │ $4,100.00         │
│──────────────────────────────────────────────────────────────│
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  ✓ 3 sales confirmed                                    ║│ ← success bar
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Progress bar at 100%.
#### User Action
- (Automatic — all operations succeeded.)
#### After State
- Grid refreshes: 3 rows now show "✓ Confirmed" with green flash. BulkActionBar shows success message "✓ 3 sales confirmed" for 2s, then slides down and hides. Selection cleared. Summary strip updates.
#### Interactive Elements, ARIA, Edge Cases
- Success bar: `role="status"`, `aria-live="polite"`. Auto-dismiss after 3s (or click ✕).
- Grid rows: updated via optimistic merge; each row flashes `cell-success-flash` 200ms staggers 100ms apart.

### Step 6: Partial Failure — Failure Details
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Sales                                                       │
├──────────────────────────────────────────────────────────────┤
│  ☐ │ #      │ Customer      │ Status    │ Total              │
├────┼────────┼───────────────┼───────────┼────────────────────┤
│  ☐ │ S-2312 │ Trader Joe's  │ ✓ Confirmed│ $2,100.00  ← green│
│  ☐ │ S-2313 │ Whole Foods   │ ⚠ Draft    │ $1,566.00  ← error│
│  ☐ │ S-2315 │ Whole Foods   │ ✓ Confirmed│ $3,200.00  ← green│
│──────────────────────────────────────────────────────────────│
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  ⚠ 2 confirmed · 1 failed    [View failures]  [Retry]   ║│
│  ╚══════════════════════════════════════════════════════════╝│
│                                                              │
│  ┌─ Failed: S-2313 ─────────────────────────────────────┐   │
│  │  Error: Insufficient inventory for line item #2       │   │ ← failure detail
│  │  Suggestion: Reduce quantity or check stock levels    │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Bulk confirm attempted on 3 sales.
#### User Action
- (Automatic — 1 sale failed during bulk op.)
#### After State
- 2 rows show green success. 1 row shows error state with ⚠ icon. BulkActionBar persists with amber warning: "⚠ 2 confirmed · 1 failed". `[View failures]` expands failure detail panel. `[Retry]` retries only failed items.
#### Interactive Elements, ARIA, Edge Cases
- Failure bar: `role="alert"`, `aria-live="assertive"`. Persists until user dismisses.
- `[View failures]`: toggles expanded detail for each failed row (error message + suggestion).
- `[Retry]`: re-attempts only failed items; progress runs again for subset.
- Edge case: All fail → bar shows "✕ 3 failed · 0 confirmed [View failures] [Retry all]". Red styling.
