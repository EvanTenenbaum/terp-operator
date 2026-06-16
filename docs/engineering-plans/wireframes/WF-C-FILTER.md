## Wireframe: WF-C-FILTER — FilterToolbar Essential States

A menubar-style filter toolbar with inline popovers, active filter pills, and export
controls. Mercury-style: click a chip, get an inline popover, not a sidebar.

> **Status filtering note:** As of the UX-first retrofit, **the status pill in this
> toolbar replaces the legacy `ViewTabBar` for status filtering** (UX-9 — filtering
> is fluid, navigation is durable, status is a filter not a destination). The
> status pill is multi-select with count badges. See WF-C-TABBAR for its new
> content-tab role.

---

### State 1: Default (No Active Filters)

#### Layout (ASCII)
```
┌─ FilterToolbar ──────────────────────────────────────────────────────────────┐
│  ┌──────────┐ ┌──────┐ ┌─────────┐ ┌────────┐ ┌───────────┐         ┌──┐    │
│  │▾Data views│ │▾Date │ │▾Keyword │ │▾Amount │ │▾Status (0)│         │⬇ │    │
│  └──────────┘ └──────┘ └─────────┘ └────────┘ └───────────┘         │Ex│    │
│                                                                      │pt│    │
│  No active filter pills                                              └──┘    │
└──────────────────────────────────────────────────────────────────────────────┘
  Height: 44px   bg-white   border-bottom: 1px solid border-zinc-200
```

#### Details
- Horizontal menubar, 44px height. Chips separated by 4px gap. Export right-aligned
- Each chip is a button with Inter 13px medium, padding `6px 12px`, "▾" indicates popover
- Hover: `bg-zinc-100`. Open chip: `bg-zinc-100` + 2px `border-accent` bottom
- Default chips: Data views, Date, Keyword, Amount, **Status (n)**, Export
- **No status tab bar above the grid.** Status is filtered here.
- **ARIA:** `role="menubar"`, each chip `role="menuitem"` with `aria-haspopup="true"`

---

### State 2: Popover Open (generic — Date, Keyword, Amount, Status)

#### Layout (ASCII)
```
┌─ FilterToolbar ──────────────────────────────────────────────────────────────┐
│  ┌──────┐ ┌[date open]┐ ┌─────────┐ ┌────────┐ ┌───────────┐ ┌──┐            │
│  │▾Data │ │▼Date       │ │▾Keyword │ │▾Amount │ │▾Status (0)│ │⬇│            │
│  └──────┘ └────────────┘ └─────────┘ └────────┘ └───────────┘ └──┘            │
│            ┌──────────────────────────────────┐                              │
│            │   (popover content — see State 3-5)│                            │
│            └──────────────────────────────────┘                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Details
- Open chip: `bg-zinc-100` + 2px `border-accent` bottom. Chevron flips ▾ → ▼
- Popover appears directly below the chip (flips above if near viewport bottom). `z-index: 45`
- One popover open at a time; clicking another chip switches; clicking the same chip closes
- Close: click-outside, Escape, or click the chip again
- **ARIA:** `aria-expanded="true"`. Popover gets `role="dialog"`, `aria-label` matches chip

---

### State 3: Complex Active (Active Pills)

#### Layout (ASCII)
```
┌─ FilterToolbar ──────────────────────────────────────────────────────────────┐
│  ┌──────┐ ┌──────┐ ┌─────────┐ ┌────────┐ ┌───────────┐         ┌──┐         │
│  │▾Data │ │▾Date │ │▾Keyword │ │▾Amount │ │▾Status (2)│         │⬇│         │
│  └──────┘ └──────┘ └─────────┘ └────────┘ └───────────┘         └──┘         │
│  ┌────────────────────┐ ┌────────────────────┐ ┌─────────────┐               │
│  │⚙ Complex filter    │ │✕ status: Draft,    │ │✕ amt:gte:5K │   [Advanced ▾]│
│  └────────────────────┘ │   Confirmed        │ └─────────────┘               │
│                         └────────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────────┘
  Height grows to 76px with pill row
```

#### Details
- Pill row appears below menubar when any filter is active. Height 32px, 4px gap
- **Status pill** in the menubar updates to "(2)" indicating two values are filtered
- **Active pill** in the pill row shows the chosen values joined by comma
- **Complex pill** "⚙ Complex filter" amber appears only when an advanced builder expression is active (see WF-F-FILTER-ADVANCED)
- Click `✕` to remove a single filter. Click pill body to reopen that popover
- **ARIA:** Pill row `role="list"`, each pill `role="listitem"`, remove button `aria-label="Remove [name] filter"`

---

### State 4: Date Popover

#### Layout (ASCII)
```
┌─ Date ──────────────────────────────────────────┐
│  [◀]    June 2026    [▶]                        │
│  Su Mo Tu We Th Fr Sa                            │
│         1  2  3  4  5  6                         │
│   7  8  9 10 11 12 13                            │
│  14 15█16█17 18 19 20                            │
│  21 22 23 24 25 26 27                            │
│  28 29 30                                        │
│                                                  │
│  Presets:                                        │
│  Today  Yesterday  This Week  This Month         │
│  Last 7 Days  Last 30 Days  Custom Range…        │
│                                                  │
│  [Apply]   [Cancel]                              │
└──────────────────────────────────────────────────┘
  Width: 320px
```

#### Details
- Range picker, selected range `bg-green-100`
- Preset buttons fill the range instantly
- Apply commits → pill "✕ date: Jun 15-16". Cancel closes without applying
- **ARIA:** calendar `role="grid"`, cells `role="gridcell"` with `aria-selected`

---

### State 5: Keyword (Search) Popover

#### Layout (ASCII)
```
┌─ Keyword ───────────────────────────────────────┐
│  ┌──────────────────────────────────────────┐   │
│  │ 🔍  Search...                            │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Search in: [ All fields ▾ ]                    │
│                                                  │
│  Suggestions:                                    │
│    "Apples"             (23 matches)             │
│    "Apollo Inc"          (4 matches)             │
│    "Apple"               (8 matches)             │
│                                                  │
│  [Apply]   [Cancel]                              │
└──────────────────────────────────────────────────┘
  Width: 300px
```

#### Details
- Live search, debounced 300ms, queries `searchSuggestions` tRPC procedure
- Field selector scopes search to ID / Customer / Product / etc.
- Suggestions show match count; arrow keys + Enter select
- **ARIA:** `role="combobox"` on input, `role="listbox"` on suggestions

---

### Status Filter Pill — Multi-Select Detail

> **Replaces ViewTabBar for status filtering.** This implements UX-9 (filtering is
> fluid, navigation is durable). Status is not a tab because the underlying entity
> set never changes — only the visible slice does.

#### Layout (ASCII)
```
┌─ Status ─────────────────────────────────────────┐
│  ☐ All                                            │
│  ─────────────────────────────────────────────    │
│  ☑ Draft           (5)                            │
│  ☑ Confirmed       (12)                           │
│  ☐ Posted          (45)                           │
│  ☐ Fulfilled       (7)                            │
│  ☐ Cancelled       (3)                            │
│                                                  │
│  [Apply]   [Cancel]   [Clear]                    │
└──────────────────────────────────────────────────┘
  Width: 240px
```

#### Details
- Multi-select. Count badge per status is computed from current Date/Keyword/Amount filters (i.e., counts respect the rest of the filter state — not the raw entity table)
- "All" deselects every value
- Apply commits → menubar chip becomes "Status (n)" and a pill appears in the pill row
- **No tab bar above the grid.** Status is one of many filters and stays inside the toolbar
- **ARIA:** `role="dialog"`, checkboxes `role="menuitemcheckbox"`, count badge in `aria-label`

---

### Export Dropdown (unchanged, abbreviated)

- Formats: CSV, Excel, PDF. Options: include filters, all columns vs. visible
- Large exports (>10K rows): async background job with notification
- **ARIA:** `role="menu"`

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | N/A | Filter component, not entity actions |
| UX-2 Supporting info one click away | ✅ | Popovers open on demand; no permanent secondary filter panel |
| UX-3 One primary surface per view | ✅ | Toolbar lives above the grid as one strip; no sidebar |
| UX-4 Bulk actions on selection only | N/A | Filter component |
| UX-5 Validation at point of impact | ✅ | "Max must be > Min" appears under the offending field, not in a banner |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Filters use lightweight popovers, not modals |
| UX-7 Mode is always visible | ✅ | Active chip pills make the current filter state continuously legible |
| UX-8 State changes resolve in place | ✅ | Apply updates the grid in place; no navigation |
| UX-9 Filtering fluid; navigation durable | ✅ | This component IS the filtering layer; status moved here from tabs |
| UX-10 Cell saves immediate; forms explicit | ✅ | Apply/Cancel inside popovers; chip removal commits immediately |
| UX-11 URL is session memory | ✅ | Every chip/pill encodes to a query param; reload reproduces filter state |
| UX-12 Empty states give next step | ✅ | Zero results → "No matches. [Clear filters]" empty state in the grid |

---
*Height: menubar 44px + optional pill row 32px + padding = 44-84px total. Font: Inter 13px. Colors: semantic classes only. Z-index: popovers at 45.*
