## Wireframe: WF-C-COMBOBOX — ComboboxCellEditor All States

A Mercury-style inline combobox dropdown for AG Grid cells. Replaces native `<select>` with
typeahead, keyboard navigation, async save, and error recovery.

---

### State 1: Empty

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Select...                       ▾    │
└──────────────────────────────────────┘
  280px × 32px     text-muted color
```

#### Details
- **Dimensions:** 280px wide × 32px tall (default; configurable via `maxWidth`)
- **Font:** Inter 13px regular, `text-muted` (grey #737373)
- **Interactive elements:** Entire cell clickable. Chevron-down icon (12×12) on right, 8px padding
- **ARIA:** `role="combobox"`, `aria-expanded="false"`, `aria-haspopup="listbox"`, `aria-label="Select value"` (or entity-specific label)
- **Edge cases:** No placeholder flicker on mount; uses `aria-placeholder` for screen readers

---

### State 2: Focused

#### Layout (ASCII)
```
┌─[blue focus ring #216e4e 2px]──────┐
│ Select...                       ▾    │
└──────────────────────────────────────┘
```

#### Details
- **Focus ring:** 2px solid `border-accent` (#216e4e), 2px offset from cell edge
- **Placeholder** still visible ("Select..."), ready for keyboard input
- **Keyboard:** Press Enter or type to open dropdown. Escape to blur back to cell
- **ARIA:** `aria-expanded="false"` until opened
- **Edge cases:** Focus ring visible on keyboard focus only; no ring on mouse click unless opened

---

### State 3: Open

#### Layout (ASCII)
```
┌─[blue focus ring]───────────────────┐
│ Select...                       ▾    │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  ┌─ Option A ──────────────────────┐ │  ← default row 32px
│  │ Option B                        │ │  ← hover: bg-zinc-100
│  │ ✓ Option C                      │ │  ← selected: bg-green-50 + checkmark
│  │ Option D                        │ │
│  │ ...                             │ │
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
  min-width: 200px
  max-height: 280px (scrolls if more)
  shadow: 0 4px 12px rgba(0,0,0,0.1)
  z-index: 50
```

#### Details
- **Dropdown container:** Positioned absolutely below cell, min-width: 200px (never narrower than cell), max-width: 400px, max-height: 280px with `overflow-y: auto`
- **Option rows:** 32px tall, padding: 0 8px, Inter 13px. Selected option: `bg-green-50` + green checkmark (✓) on right
- **Shadow:** `0 4px 12px rgba(0,0,0,0.1)`, border-radius: 4px (matches Mercury)
- **Z-index:** 50 (above grid cells but below tooltips)
- **ARIA:** `role="listbox"` on dropdown, `role="option"` on each item. `aria-selected="true"` on selected. `aria-labelledby` pointing to combobox
- **Keyboard:** ArrowUp/ArrowDown moves highlight. Enter selects. Escape closes. Home/End jump to first/last
- **Click outside:** Closes dropdown (listens on `document` mousedown, portal-safe)
- **Edge cases:** Empty options array → "No options" row shown. Dropdown scrolls into viewport if near bottom edge

---

### State 4: Hovered

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Option A                             │
│ ┌[bg-zinc-100]─────────────────────┐ │  ← hovered row
│ │ Option B                         │ │
│ └──────────────────────────────────┘ │
│ Option C                             │
└──────────────────────────────────────┘
```

#### Details
- **Hover:** `bg-zinc-100` background on the option row under the cursor
- **ARIA:** `aria-activedescendant` updated on the combobox to point to the hovered option ID
- **Visual:** cursor: pointer on each option row
- **Edge cases:** Hover state clears on keyboard arrow movement (keyboard takes priority over mouse)

---

### State 5: Selected / Value Set

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Confirmed                         ×▾ │
└──────────────────────────────────────┘
  dark text (Inter 13px)   clear on right
```

#### Details
- **Display:** Selected value in dark text (Inter 13px regular, `text-zinc-900`). No placeholder
- **Clear button:** "×" icon (12×12) on right, before chevron. `aria-label="Clear selection"`. On click: clears to empty state, fires onChange(undefined)
- **Chevron:** "▾" remains visible for dropdown access
- **ARIA:** `aria-expanded="false"`, value set via `aria-valuetext`
- **Edge cases:** Value may be truncated with "…" if > 25 chars. Full value shown in tooltip on hover

---

### State 6: Saving

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Confirmed                         ◌  │
└──────────────────────────────────────┘
  cell border: 1px solid #e5e7eb (grey)
  spinner icon replaces chevron
  non-interactive
```

#### Details
- **Visual:** Spinner icon (SVG rotating, 16×16) replaces the chevron. Cell border: 1px solid `border-zinc-200`
- **Behavior:** Non-interactive — clicks ignored, keyboard blocked. `aria-busy="true"`
- **Matches Mercury:** No separate "Save" button; auto-save on selection. Saving state shown inline
- **Timeout:** After 10 seconds → transitions to Error state (State 8)
- **Edge cases:** Rapid re-selection: cancels previous save promise, starts new save. Debounce: none (immediate on select)

---

### State 7: Saved

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Confirmed                         ✓▾ │
└──────────────────────────────────────┘
  green checkmark flash 200ms
  then fades to normal value display
```

#### Details
- **Flash:** Green checkmark (✓, `text-green-600`) appears in place of spinner for 200ms
- **Transition:** 200ms flash, then fades to State 5 (value display) with 200ms ease-out opacity
- **ARIA:** `aria-live="polite"` announcement: "Status saved" (or entity-specific)
- **Edge cases:** If user tabs away during flash, flash completes and cell returns to normal

---

### State 8: Error

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Confirmed                         ⚠× │
└──────────────────────────────────────┘
  red border (#b42318 border-error)
  error icon + clear button
```

#### Details
- **Border:** 2px solid `border-error` (#b42318), overriding focus/accent
- **Icons:** Warning icon "⚠" (16×16, `text-error`) + clear "×" button
- **Tooltip:** On hover (or focus): "Failed to save: [error message from server]. Click to retry."
- **Click behavior:** Clicking the cell opens dropdown for retry (re-select). Clicking "×" discards to empty
- **ARIA:** `aria-invalid="true"`, `aria-errormessage` pointing to tooltip content ID
- **Edge cases:** Error border takes priority over focus ring. Error persists until user action (retry or clear)

---

### State 9: Typeahead

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Con|                             ▾    │  ← user typing "Con"
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  ┌─ Confirmed ─────────────────────┐ │
│  │ Consensus                       │ │
│  │ Consigned                       │ │
│  │ ─────────────────────────────── │ │  ← divider (if allowCreate)
│  │ + Create "Concheck"  (green)    │ │  ← allowCreate option
│  ├─────────────────────────────────┤ │
│  │ No results                      │ │  ← if no matches
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
```

#### Details
- **Typing:** User types in the combobox → dropdown filters to matching options (startsWith, case-insensitive)
- **Filtered options:** Only options matching the typed prefix are shown
- **No results:** If no matches: "No results" row in `text-muted`, not selectable. Not an error state
- **allowCreate:** If `allowCreate` prop is true: divider line + "Create '[text]'" option at bottom in `text-green-600` (Inter 13px). On select: fires `onCreate(typedText)`, closes dropdown, transitions to Saving
- **Keyboard:** Arrow keys navigate filtered list. Enter selects (or creates). Escape clears filter, closes dropdown
- **Edge cases:** Input trimmed before search. Leading/trailing spaces ignored for matching. Max 50 visible options (virtualized scroll)

---

### State 10: Disabled

#### Layout (ASCII)
```
┌──────────────────────────────────────┐
│ Confirmed                             │
└──────────────────────────────────────┘
  grey text (#9ca3af)
  no chevron, no clear button
  cursor: not-allowed
```

#### Details
- **Text:** `text-zinc-400` grey, same font size. No chevron (▾). No clear button (×)
- **Interaction:** `cursor: not-allowed` on hover. All clicks, keyboard events blocked
- **ARIA:** `aria-disabled="true"`. Combobox role retained but interactions suppressed
- **Edge cases:** Cell still tabbable (not `tabindex="-1"`) so screen reader can announce it, but Tab skips to next cell

---
*Font: Inter 13px body, 11px labels. Colors: semantic class names only. Transitions: 150ms ease.*
