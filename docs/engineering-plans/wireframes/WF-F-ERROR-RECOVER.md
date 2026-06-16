## Wireframe: WF-F-ERROR-RECOVER — Error Recovery Flow

### Flow Overview
Operator encounters and recovers from a failed inline cell edit, **or** from a command-bus failure surfaced in the Recovery view. The recovery view is **a safety net, not an interrogation room** — it shows the command's context (what it tried to do, on what data, with what inputs), one row at a time, with retry directly in the slide-over header.

> **UX-first changes from prior draft:**
> - **Recovery view is a single filtered surface**, not three competing surfaces (Action Log + Admin Tools + Command Reversal). Admin tools live behind a kebab/power-user menu (UX-2 — one click away, not zero).
> - **Failure context lives in the slide-over.** Clicking a failed command opens a slide-over with the command summary in the header: what it was trying to do, on what data, with what inputs, and the error. Tabs: Details / History / Logs.
> - **Retry is in the slide-over header**, next to the command title. The operator sees what they're retrying.
> - **Calm presentation.** No alarming red banners across the page. Red is used at the row + cell level (point of impact). The view feels like "here is what failed and how to fix it," not "the system is in danger."

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

---

### Recovery View — Command-Bus Failures (companion pattern)

For server-side / command-bus failures that the operator must triage (e.g., overnight posting failures), the same UX principles apply on the Recovery view:

```
┌─ Recovery ─────────────────────────────────────────────────────────────────┐
│  Recovery                                              [⋯ Admin tools]      │ ← admin behind a menu
├────────────────────────────────────────────────────────────────────────────┤
│  Filter: [Status: Failed (3)] [Date: Today] [Command type]                 │
├────────────────────────────────────────────────────────────────────────────┤
│  Time     │ Command            │ Target       │ Reason          │ Actions  │
├───────────┼────────────────────┼──────────────┼─────────────────┼──────────┤
│  05:32:11 │ post.sale          │ S-2313       │ insufficient    │[Retry]   │ ← row-level retry
│           │                    │              │ inventory       │          │
│  05:30:08 │ post.sale          │ S-2299       │ db timeout      │[Retry]   │
│  05:29:51 │ confirm.po         │ #1041        │ vendor inactive │[Retry]   │
└────────────────────────────────────────────────────────────────────────────┘
   No "Admin tools" panel, no "Command Reversal" panel competing for attention.
   Admin tools live behind a menu (one click away).
```

Clicking a row opens a slide-over (entity mode):

```
┌──────────────────────────────────────┐
│  Failed: post.sale S-2313    [🔄 Retry]│ ← title carries WHAT failed; Retry in header
│  [Details]  [History]  [Logs]        │
├──────────────────────────────────────┤
│  Attempted at:  05:32:11               │
│  By:           system (cron)           │
│  Target:       Sale S-2313 (Whole Foods)│
│  Inputs:       {confirm: true, post: …} │
│  Error:        Insufficient inventory   │
│                for line 2 (Roma 50 lb,  │
│                only 30 lb available)    │
│  Suggested:    Reduce qty or restock    │
└──────────────────────────────────────┘
```

The operator sees what it was trying to do, on what data, with what inputs. Retry is right there. Reverse or Mark Resolved are also available as primary slide-over actions when relevant.

---

### UX Check

| Question | Answer |
|----------|--------|
| Does the flow require mode-switching? | No. Both cell-level and Recovery-view recovery happen at the point of failure — the cell shows the error, or the Recovery row opens a slide-over with command context. |
| Is the operator ever shown irrelevant actions? | No. Retry / Discard at cell level; Retry / Reverse / Mark Resolved at command level. Admin tools live behind a kebab menu. |
| Is context preserved if the operator leaves mid-flow? | Yes. Error state encodes in the cell or the row; the slide-over URL preserves the open failure id. Reload reproduces it. |
| Mercury comparison | Mercury doesn't have a separate Recovery page — failed payments live in the transactions table with `status: failed`. Clicking opens a panel with retry. This flow mirrors that pattern: status filter + slide-over with context. |

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Retry shown only when retryable; Reverse only when the command was destructive |
| UX-2 Supporting info one click away | ✅ | Admin tools behind a kebab; failure detail one click into slide-over |
| UX-3 One primary surface per view | ✅ | Recovery view is one filtered table; no competing Action Log / Admin / Command Reversal panels |
| UX-4 Bulk actions on selection only | ✅ | Bulk retry available via WF-C-BULK on selection only |
| UX-5 Validation at point of impact | ✅ | Cell errors render in the cell; command-bus errors render in the row and the slide-over header |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Failure detail and retry live in slide-over; destructive Reverse confirms via modal |
| UX-7 Mode is always visible | ✅ | Slide-over title carries the failed command name + target throughout |
| UX-8 State changes resolve in place | ✅ | Retry / Discard / Resolve resolve in the cell or slide-over; no navigation |
| UX-9 Filtering fluid; navigation durable | ✅ | "Failed today" is a status+date filter, durable as a URL |
| UX-10 Cell saves immediate; forms explicit | ✅ | Discard is immediate (revert); Retry submits the same command |
| UX-11 URL is session memory | ✅ | Open failure encodes to URL (`/recovery/cmd/2025-…`); reload reproduces the view |
| UX-12 Empty states give next step | ✅ | Empty failures → "Nothing has failed today ✓"; cell discard messaging confirms the reverted value |
