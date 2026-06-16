## Wireframe: WF-C-FILTER — FilterToolbar All States

A menubar-style filter toolbar with inline popovers, active filter pills, and export
controls. Mercury-style: click a chip, get an inline popover, not a sidebar.

---

### State 1: Default (No Active Filters)

#### Layout (ASCII)
```
┌─ FilterToolbar ──────────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────┐  ┌─────────┐  ┌────────┐  ┌───────┐  ┌──────┐  ┌──┐  │
│  │▾Data views│  │▾Date │  │▾Keyword │  │▾Amount │  │▾Group │  │▾Sort │  │⬇│  │
│  └──────────┘  └──────┘  └─────────┘  └────────┘  └───────┘  └──────┘  │Ex│  │
│                                                                         │port  │
│  No active filter pills                                                └──┘  │
└───────────────────────────────────────────────────────────────────────────────┘
  Height: 44px   bg-white   border-bottom: 1px solid border-zinc-200
```

#### Details
- **Layout:** Horizontal menubar, 44px height. Chips separated by 4px gap. Export button right-aligned
- **Chips:** Each is a button (role="button"). "▾" indicates dropdown. Font: Inter 13px medium. Padding: 6px 12px
- **Hover:** `bg-zinc-100` on chip hover. Active (open) chip: `bg-zinc-100` + `border-accent` bottom border
- **Export:** "⬇ Export" button, right-aligned, Inter 13px. Triggers dropdown (State 9)
- **Data views:** First chip, shows saved view presets. "▾ Data views" default
- **No pills visible** when no filters active
- **ARIA:** `role="menubar"`. Each chip is `role="menuitem"` with `aria-haspopup="true"` when a popover is available

---

### State 2: Chip Open (Popover)

#### Layout (ASCII)
```
┌─ FilterToolbar ──────────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌[date open]┐  ┌─────────┐  ┌────────┐  ┌───────┐  ┌──────┐  │
│  │▾Data views│  │▼Date      │  │▾Keyword │  │▾Amount │  │▾Group │  │▾Sort │  │
│  └──────────┘  └────────────┘  └─────────┘  └────────┘  └───────┘  └──────┘  │
│                 ┌───────────────────────────────────────┐                      │
│                 │                                       │                      │
│                 │   (see State 4-8 for popover types)   │                      │
│                 │                                       │                      │
│                 └───────────────────────────────────────┘                      │
└───────────────────────────────────────────────────────────────────────────────┘
  Selected chip: bg-zinc-100 + border-accent bottom. Chevron flips to ▼.
```

#### Details
- **Open chip:** gets `bg-zinc-100`, bottom border 2px `border-accent` (#216e4e). Chevron changes from ▾ to ▼
- **Popover:** Appears directly below the chip (or above if near viewport bottom). `z-index: 45`
- **One at a time:** Clicking another chip closes the current popover, opens the new one. Clicking the same chip closes
- **Close:** Click-outside, Escape, or clicking the chip again
- **ARIA:** `aria-expanded="true"` on open chip. Popover gets `role="dialog"`, `aria-label` matching chip name

---

### State 3: Complex Active (Active Pills)

#### Layout (ASCII)
```
┌─ FilterToolbar ──────────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────┐  ┌─────────┐  ┌────────┐  ┌───────┐  ┌──────┐  ┌──┐  │
│  │▾Data views│  │▾Date │  │▾Keyword │  │▾Amount │  │▾Group │  │▾Sort │  │⬇│  │
│  └──────────┘  └──────┘  └─────────┘  └────────┘  └───────┘  └──────┘  │Ex│  │
│                                                                         │port│
│  ┌────────────────────────┐ ┌────────────────────┐ ┌─────────────┐     └──┘  │
│  │⚙ Complex filter active │ │✕ status:confirmed  │ │✕ amt:gte:5000│          │
│  └────────────────────────┘ └────────────────────┘ └─────────────┘          │
│                              active chip pills                                │
└───────────────────────────────────────────────────────────────────────────────┘
  Height grows to 76px with pill row
```

#### Details
- **Pill row:** Appears below the menubar when any filter is active. Height 32px. Pills separated by 4px gap
- **Complex indicator:** "⚙ Complex filter active" amber pill shown when a complex filter (custom JSON/expression) is applied. Not dismissible via × (edit via Advanced button)
- **Chip pills:** Each shows chip label + value: `✕ status:confirmed`. Click "✕" to remove. Click pill body to re-open that chip's popover
- **Advanced button:** "Advanced" link/button appears at right of pill row when complex filter is active (if custom expression is supported)
- **Layout:** Menubar row (44px) + pill row (32px) + 8px padding = ~84px total toolbar height
- **ARIA:** Pill row is `role="list"`. Each pill is `role="listitem"`. Remove button is `aria-label="Remove [filter name] filter"`

---

### State 4: Date Popover

#### Layout (ASCII)
```
┌─ Date ──────────────────────────────────────────┐
│  ╔═════════════════════════════════════════════╗ │
│  ║  [◀]    June 2026    [▶]                   ║ │
│  ║  ┌───┬───┬───┬───┬───┬───┬───┐            ║ │
│  ║  │Sun│Mon│Tue│Wed│Thu│Fri│Sat│            ║ │
│  ║  ├───┼───┼───┼───┼───┼───┼───┤            ║ │
│  ║  │   │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │            ║ │
│  ║  │ 7 │ 8 │ 9 │10 │11 │12 │13 │            ║ │
│  ║  │14 │15█│16█│17 │18 │19 │20 │            ║ │
│  ║  │21 │22 │23 │24 │25 │26 │27 │            ║ │
│  ║  │28 │29 │30 │   │   │   │   │            ║ │
│  ║  └───┴───┴───┴───┴───┴───┴───┘            ║ │
│  ║   From: Jun 15, 2026  To: Jun 16, 2026  ██║ │  █ = selected range
│  ╚═════════════════════════════════════════════╝ │
│                                                   │
│  ┌─ Presets ───────────────────────────────────┐  │
│  │  Today    Yesterday    This Week             │  │
│  │  This Month    Last 7 Days    Last 30 Days   │  │
│  │  Custom Range…                               │  │
│  │                                              │  │
│  │  [Apply]  [Cancel]                           │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
  Width: 320px   Shadow: 0 4px 12px rgba(0,0,0,0.1)
```

#### Details
- **Popover width:** 320px. Contains: calendar + preset buttons
- **Calendar:** Two-month range picker (or single month with click to start range). Selected range highlighted with `bg-green-100`
- **Presets:** Clickable buttons that auto-fill the range. "Custom" shows additional fields
- **Apply/Cancel:** Apply sets the filter and shows pill "✕ date:Jun15-Jun16". Cancel closes without applying
- **ARIA:** Calendar: `role="grid"`, each cell `role="gridcell"` with `aria-selected` for range. Preset buttons: `role="button"`

---

### State 5: Keyword Popover

#### Layout (ASCII)
```
┌─ Keyword ──────────────────────────────────────┐
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ Search...                          🔍     │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Search in: ┌────────────────────────────┐       │
│             │ All fields             ▾   │       │
│             └────────────────────────────┘       │
│                                                  │
│  ┌─ Suggestions ─────────────────────────────┐  │
│  │  "Apples"                    (23 matches)  │  │
│  │  "Apollo Inc"                 (4 matches)  │  │
│  │  "Apple"                      (8 matches)  │  │
│  │  ...                                       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│               [Apply]  [Cancel]                  │
└──────────────────────────────────────────────────┘
  Width: 300px
```

#### Details
- **Input:** Text field with search icon. Live search: debounced 300ms, queries tRPC `searchSuggestions`
- **Field selector:** Dropdown to scope search: "All fields", "Customer", "ID", "Product", etc.
- **Suggestions:** Dropdown list showing matching terms with match count. Click to select. Arrow keys + Enter
- **ARIA:** `role="combobox"` on input, `role="listbox"` on suggestions, `aria-autocomplete="list"`
- **Edge cases:** Empty search → show recent searches or nothing. Very broad search (1-2 chars) → show "Type 3+ characters"

---

### State 6: Amount Popover

#### Layout (ASCII)
```
┌─ Amount ───────────────────────────────────────┐
│                                                  │
│  ┌─ Min ────────────────────────────────────┐   │
│  │ $ ______________________                 │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌─ Max ────────────────────────────────────┐   │
│  │ $ ______________________                 │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌─ Presets ────────────────────────────────┐   │
│  │  > 0      < 100      100–1,000            │   │
│  │  1,000–10,000    > 10,000                 │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│               [Apply]  [Cancel]                  │
└──────────────────────────────────────────────────┘
  Width: 280px
```

#### Details
- **Inputs:** Two number fields with $ prefix. Min and max. Both optional (empty = unbounded)
- **Presets:** Click sets min/max instantly. Overwrites previous values
- **Validation:** Max must be > Min. If invalid: red border + "Max must be greater than Min" inline error
- **ARIA:** Both inputs: `aria-label="Minimum amount"` / "Maximum amount", `inputmode="decimal"`

---

### State 7: Group Popover

#### Layout (ASCII)
```
┌─ Group ─────────────────────────────────────────┐
│                                                   │
│  Group by: ┌───────────────────────────┐         │
│            │ Status                ▾   │         │
│            └───────────────────────────┘         │
│                                                   │
│  Order:    ┌──────────┐   ┌──────────┐           │
│            │ ASC  ▼   │   │ Count    │           │
│            └──────────┘   └──────────┘           │
│                                                   │
│  ┌─ Available fields ──────────────────────────┐ │
│  │  Status      Customer      Date              │ │
│  │  Amount      Type          Region            │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│               [Apply]  [Cancel]                   │
└───────────────────────────────────────────────────┘
  Width: 260px
```

#### Details
- **Field selector:** Dropdown of groupable fields from the entity schema. Only fields marked `groupable: true`
- **Direction:** ASC/DESC toggle button group
- **Available fields:** Shown as small tag chips for quick selection. Click selects the primary dropdown
- **ARIA:** Field selector: `role="combobox"`. Direction: `role="radiogroup"` or toggle buttons with `aria-pressed`

---

### State 8: Sort Popover

#### Layout (ASCII)
```
┌─ Sort ───────────────────────────────────────────┐
│                                                    │
│  Sort by: ┌───────────────────────────┐           │
│           │ Date Created         ▾    │           │
│           └───────────────────────────┘           │
│                                                    │
│  Order:   ┌──────────┐                            │
│           │ DESC ▼   │                            │
│           └──────────┘                            │
│                                                    │
│  ┌─ Available fields ───────────────────────────┐ │
│  │  Date Created    Date Updated    Amount        │ │
│  │  Customer        Status          ID            │ │
│  └───────────────────────────────────────────────┘ │
│                                                    │
│               [Apply]  [Cancel]                    │
└────────────────────────────────────────────────────┘
  Width: 260px
```

#### Details
- **Field selector:** Dropdown of sortable fields from entity schema. Only fields marked `sortable: true`
- **Direction:** DESC/ASC toggle (default DESC for dates, ASC for text)
- **Available fields:** Quick-select tag chips (same pattern as Group popover)
- **ARIA:** Same pattern as Group popover

---

### State 9: Export Dropdown

#### Layout (ASCII)
```
                          ┌─ Export ────────────────────┐
                          │                               │
┌──┐                      │  📄 Export as CSV             │
│⬇ │──────────────────────│  📊 Export as Excel          │
│Ex│                      │  📋 Export as PDF            │
│port                     │                               │
└──┘                      │  ─────────────────────────    │
                          │  Formatting                   │
                          │  ☑ Include filters            │
                          │  ☐ Export all columns         │
                          │                               │
                          │  [Export]                     │
                          └───────────────────────────────┘
                            Width: 240px  z-index: 45
```

#### Details
- **Formats:** CSV (default), Excel, PDF. Each is a selectable item with icon
- **Options:** Checkboxes for "Include current filters", "Export all columns" (vs visible only)
- **Large exports:** For >10K rows: progress bar shown ("Exporting 12,500 rows… 45%"), async background job, notification on completion
- **ARIA:** `role="menu"`, each format is `role="menuitem"`. Checkboxes use `role="menuitemcheckbox"`
- **Edge cases:** Export fails → toast notification "Export failed: [reason]. Retry?"

---
*Height: menubar 44px + optional pill row 32px + padding = 44-84px total. Font: Inter 13px. Colors: semantic classes only. Z-index: popovers at 45.*
