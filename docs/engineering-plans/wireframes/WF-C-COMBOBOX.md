## Wireframe: WF-C-COMBOBOX — ComboboxCellEditor Essential States

A Mercury-style inline combobox dropdown for AG Grid cells. Replaces native `<select>` with
typeahead, keyboard navigation, async save, and error recovery.

> **UX annotation:** Inline edit is immediate. No Save button. **Enter commits, Escape cancels.**
> The cell IS the editor — there is no separate edit mode, modal, or form. Mode is implicit:
> default → open → saving → saved. Error appears in the same cell with retry on click.

---

### State 1: Closed (Default / Value Display)

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Confirmed                         ▾  │   ← value set: dark text + chevron
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ Select...                         ▾  │   ← empty: muted placeholder
└──────────────────────────────────────┘
  280px × 32px       Inter 13px
```

#### Details
- **Dimensions:** 280px wide × 32px tall (configurable via `maxWidth`)
- **Value set:** dark text (`text-zinc-900`), Inter 13px regular, chevron "▾" on right
- **Empty:** "Select..." in `text-muted` (#737373)
- **Interactive:** entire cell clickable. Click, Enter, F2, or typing opens dropdown
- **Focus ring:** 2px solid `border-accent` (#216e4e) on keyboard focus
- **ARIA:** `role="combobox"`, `aria-expanded="false"`, `aria-haspopup="listbox"`, `aria-label` matches column
- **Edge cases:** values >25 chars truncate with "…" and reveal full text on hover via tooltip

---

### State 2: Open (Dropdown + Typeahead)

#### Layout (ASCII)
```
┌─[blue focus ring]───────────────────┐
│ Con|                             ▾   │   ← typing filters list as you go
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ ✓ Confirmed                          │   ← selected: bg-green-50 + check
│ Consensus                            │   ← hover/keyboard: bg-zinc-100
│ Consigned                            │
│ ───────────────────────────────────  │   ← divider (allowCreate only)
│ + Create "Concheck"                  │   ← green, only if allowCreate
└──────────────────────────────────────┘
  min-width 200px, max-height 280px (scroll), shadow + z-index 50
```

#### Details
- **Dropdown:** positioned below the cell (above if near viewport bottom), `min-width: 200px`, `max-height: 280px` with `overflow-y: auto`
- **Option rows:** 32px tall, padding `0 8px`, Inter 13px. Selected has `bg-green-50` + ✓
- **Typeahead:** typing filters (case-insensitive, startsWith). Empty matches → "No results" row in `text-muted`
- **allowCreate:** when true and no exact match, a green "+ Create '[text]'" row appears below a divider. Selecting fires `onCreate(text)`, then transitions to Saving
- **Keyboard:** ArrowUp/Down moves highlight; Enter commits; Escape closes without saving; Home/End jump
- **Click-outside / Escape:** closes without saving
- **ARIA:** `role="listbox"`, each row `role="option"` with `aria-selected`; `aria-activedescendant` follows highlight
- **Edge cases:** virtualized after 50 visible options; leading/trailing whitespace trimmed before match

---

### State 3: Saving

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Confirmed                         ◌  │   ← spinner replaces chevron
└──────────────────────────────────────┘
  cell border 1px solid border-zinc-200, non-interactive, aria-busy
```

#### Details
- **Trigger:** selecting an option commits immediately — no separate Save button
- **Visual:** rotating spinner (16×16) replaces the chevron. Cell border `border-zinc-200`
- **Non-interactive:** clicks and keyboard ignored. `aria-busy="true"`
- **Cancellation:** a new selection cancels the in-flight save and starts a new one
- **Timeout:** 10 seconds → Error sub-state (red border + ⚠) with retry-on-click
- **Edge cases:** error persists in-cell until user retries (click reopens dropdown) or discards (× clears)

---

### State 4: Saved

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ ✓ Confirmed                       ▾  │   ← green check flashes 200ms, fades to State 1
└──────────────────────────────────────┘
```

#### Details
- **Flash:** green ✓ for 200ms, then 200ms ease-out fade back to State 1 display
- **ARIA:** `aria-live="polite"` announcement: "Status saved" (or entity-specific)
- **Grid:** summary strip / KPI cards refresh reactively, no full grid reload
- **Edge cases:** if focus leaves during flash, animation still completes

---

### Error (cell-level sub-state of Saving)

Error is not a separate "panel" or "page" — it is the saving cell in its failed state.
A red 2px border replaces the focus ring, a ⚠ icon replaces the spinner, and hover/focus
shows the server error in a tooltip. Click the cell to reopen the dropdown with the
attempted value pre-selected (retry). Click "×" in the tooltip to revert to original.

This honors UX-5 (validation at point of impact) and UX-8 (state changes resolve in place).

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | N/A | Cell editor, not entity-level actions |
| UX-2 Supporting info one click away | ✅ | Tooltip carries full server error; no permanent error panel |
| UX-3 One primary surface per view | ✅ | The cell is the editor; no parallel form panel |
| UX-4 Bulk actions on selection only | N/A | Per-cell control |
| UX-5 Validation at point of impact | ✅ | Errors render in the cell that failed, not a status panel |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Inline editor; no modal for cell edits |
| UX-7 Mode is always visible | ✅ | Open/saving/saved are all visible in-cell |
| UX-8 State changes resolve in place | ✅ | Save, success, error all happen in the cell |
| UX-9 Filtering fluid; navigation durable | N/A | Cell editor, not a view |
| UX-10 Cell saves immediate; forms explicit | ✅ | Selection commits immediately, no Save button |
| UX-11 URL is session memory | N/A | Cell editor is transient |
| UX-12 Empty states give next step | ✅ | Empty list → "No results"; allowCreate offers the next step |

---
*Font: Inter 13px body. Colors: semantic class names only. Transitions: 150ms ease.*
