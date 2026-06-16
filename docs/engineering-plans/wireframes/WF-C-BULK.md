## Wireframe: WF-C-BULK — BulkActionBar All States

A fixed bottom bar for multi-select operations. Animates up when rows are selected,
shows action buttons, and handles execution states inline.

---

### State 1: Hidden

#### Layout (ASCII)
```
┌─ AG Grid (extends to bottom of viewport, no bulk bar) ────────────────────────┐
│                                                                                │
│    ID        Customer     Status       Date        Amount                      │
│   ────      ────────     ──────       ────        ──────                      │
│   SO-1042   Acme Co      Confirmed    6/15/26     $12,400                     │
│   SO-1041   Beta Inc     Posted       6/14/26     $8,200                      │
│   SO-1040   Gamma LLC    Draft        6/13/26     $3,150                      │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
   selectedCount=0 → not rendered
```

#### Details
- **Condition:** `selectedCount === 0` → component returns `null`
- **DOM:** Not in the DOM tree. No placeholder, no hidden element
- **No animation** needed for hidden state (nothing to transition from)

---

### State 2: Visible

#### Layout (ASCII)
```
┌─ AG Grid ─────────────────────────────────────────────────────────────────────┐
│                                                                                │
│   ☑ SO-1042   Acme Co      Confirmed    6/15/26     $12,400                   │
│   ☑ SO-1041   Beta Inc     Posted       6/14/26     $8,200                    │
│   ☑ SO-1040   Gamma LLC    Draft        6/13/26     $3,150                    │
│                                                                                │
├─ BulkActionBar ────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ ☑ 3 orders selected · $24,500    [✓ Confirm] [📄 Post] [▾ More ▾]       │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
  Height: 56px   bg-white   border-top: 1px solid border-zinc-200
  Animates up: translateY(0) 200ms ease-out
```

#### Details
- **Layout:** Fixed to bottom of viewport, full width, 56px tall. `bg-white`, `border-top: 1px solid border-zinc-200`
- **Left:** "[checkbox] N [entity] selected · $[total]". Checkbox toggles select-all
- **Right:** Action buttons: 2-3 primary actions + "More ▾" dropdown for secondary actions
- **Spacing:** 12px horizontal padding on each side. Actions separated by 4px gap
- **Animation:** Animates up from `translateY(56px)` to `translateY(0)` over 200ms `ease-out`. Hides by sliding down
- **Action buttons:** Defined by entity config (`entity-actions.ts` `bulkActions` array). Only actions with `bulk: true` shown. Inter 13px medium, padding 6px 12px, border-radius 4px
- **More dropdown:** Shows secondary bulk actions (Print, Export selection, Delete, etc.)
- **ARIA:** `role="toolbar"`, `aria-label="Bulk actions"`. Selected count: `aria-live="polite"`. Action buttons: `role="button"` with descriptive labels
- **Edge cases:** Very large selections (1000+): show "1,000+ selected" with truncated total. Max action buttons: 4 visible + More dropdown

---

### State 3: Executing

#### Layout (ASCII)
```
├─ BulkActionBar ────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ ☑ 3 orders selected · $24,500    [◌ Confirming…] [📄 Post] [▾ More ▾]   │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│  all buttons disabled, active button shows spinner
└────────────────────────────────────────────────────────────────────────────────┘
```

#### Details
- **Active button:** Shows spinner icon (SVG rotating, 16×16) + label: "Confirming…", "Posting…", etc.
- **All buttons disabled:** `pointer-events: none`, `opacity: 0.5` on non-active buttons. No interactions
- **Progress text:** Optional: "Confirming 2 of 3…" shown between selected count and buttons (if server reports progress)
- **Timeout:** After 30 seconds with no response → transitions to Error state (State 6)
- **ARIA:** `aria-busy="true"` on toolbar. Active button: `aria-disabled="true"`. Spinner: `aria-hidden="true"`
- **Edge cases:** User closes tab during execution → no recovery (fire-and-forget bulk endpoint). Double-click on button → ignored (disabled)

---

### State 4: Partial Success

#### Layout (ASCII)
```
├─ BulkActionBar ────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠ 2 confirmed · 1 failed    [View failures →]     [Dismiss]              │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│  mixed results: amber warning
└────────────────────────────────────────────────────────────────────────────────┘
```

#### Details
- **Status:** Amber warning icon "⚠" + summary: "2 confirmed · 1 failed"
- **Actions:** "View failures →" link (highlights failed rows in grid, scrolls to first). "Dismiss" button clears bar
- **Grid feedback:** Failed rows get red left-border indicator. Selected state cleared except for failed rows
- **ARIA:** `aria-live="assertive"` announcement: "2 orders confirmed, 1 failed". Failed count announced
- **Edge cases:** All fail → transitions to Error state (State 6) instead of Partial

---

### State 5: Success

#### Layout (ASCII)
```
├─ BulkActionBar ────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ ✓ All 3 orders confirmed                                      [Dismiss]   │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│  green flash 500ms, then auto-hides after 2s
└────────────────────────────────────────────────────────────────────────────────┘
```

#### Details
- **Visual:** Green checkmark "✓" + message. `bg-green-50` background with `border-top-color: border-green-200`
- **Animation:** Green flash: background pulses from `bg-white` to `bg-green-50` over 200ms, holds 300ms, then slides down over 300ms. Auto-hide after 2s total
- **Manual dismiss:** "Dismiss" button for instant close. Escape key also dismisses
- **Grid state:** All selected rows deselected. Grid refreshes data (invalidation)
- **ARIA:** `aria-live="polite"` announcement: "All 3 orders confirmed successfully"
- **Edge cases:** User re-selects rows during success display → bar transitions to Visible state immediately

---

### State 6: Error

#### Layout (ASCII)
```
├─ BulkActionBar ────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ ✕ Failed: Network error. Please try again.   [🔄 Retry]  [✕ Dismiss]     │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│  red banner: bg-red-50, border-top-color: border-error
└────────────────────────────────────────────────────────────────────────────────┘
```

#### Details
- **Visual:** "✕" error icon + message. `bg-red-50` background, `border-top-color: border-error` (#b42318)
- **Message:** Truncated to one line with ellipsis. Full message in title tooltip. Format: "Failed: [server error message]"
- **Actions:** "🔄 Retry" button re-executes the bulk action. "✕ Dismiss" clears bar, deselects all
- **Persistence:** Error stays until user action (Retry or Dismiss). Does NOT auto-hide
- **ARIA:** `role="alert"` (not polite — assertive for errors). Error message in `aria-label`
- **Edge cases:** Retry fails again → message updates, bar stays. Maximum 3 retries? No — let the user decide

---

### State 7: Bespoke Input

#### Layout (ASCII)
```
├─ BulkActionBar ────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ ☑ 3 orders selected · $24,500    Route to: [______________] [🚚 Route]   │  │
│  │                                  └── inline text field ──┘               │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

#### Details
- **Trigger:** Specific actions need input (e.g., "Assign to", "Route to", "Add tag"). After clicking the action → bar transforms to show inline input
- **Layout:** Selected count (left) + label + text field + action button (right). Text field: 200px wide, 32px tall, bordered
- **Cancel:** Escape clears the input and returns to State 2 (visible). Clicking another action button also returns to State 2
- **Submit:** Enter in text field triggers the action. Action button also submits
- **Validation:** Inline validation (e.g., required field → red border + "Required" tooltip). Server validation errors → transitions to State 6
- **ARIA:** Input: `aria-label="Route destination"`. Action button label updated to include the input context
- **Edge cases:** Empty input → action button disabled. Very long input → text field scrolls horizontally

---

### Layout Constants

```
Height:        56px
Background:    bg-white
Border:        1px solid border-zinc-200 (top only)
Padding:       0 12px (horizontal)
Content:       flex, justify-between, align-items: center
Left:          checkbox + count + total (flex, gap: 8px)
Right:         action buttons (flex, gap: 4px)
Font:          Inter 13px medium (count), Inter 13px regular (total)
Z-index:       40 (below combobox 50, above slideover 30)
Animation:     translateY 200ms ease-out (enter), 200ms ease-in (exit)
```

---
*All states transition through the same DOM element (never unmount/mount mid-animation). Fixed position, bottom: 0, left: 0, right: 0.*
