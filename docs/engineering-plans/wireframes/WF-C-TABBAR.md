## Wireframe: WF-C-TABBAR — ViewTabBar All States

A horizontal tab bar for navigating between entity status views. Mercury-style
underline indicator with count badges and overflow handling.

---

### State 1: Normal

#### Layout (ASCII)
```
┌─ ViewTabBar ──────────────────────────────────────────────────────────────────┐
│                                                                                │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  ┌────────────┐            │
│  │   All    │  │ Draft (3) │  │ Confirmed (12)   │  │Posted (45) │            │
│  └──────────┘  └───────────┘  └──────────────────┘  └────────────┘            │
│       ↑                          ████████████                                 │
│       │                          active indicator: 2px #216e4e                │
│    inactive tab                  (width matches tab text)                      │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
  Height: 40px   bg-white   border-bottom: 1px solid border-zinc-200
```

#### Details
- **Layout:** Horizontal row of tab buttons. Full width. Height: 40px. `bg-white`, bottom border: `1px solid border-zinc-200`
- **Active tab:** `text-accent` (#216e4e) color, `font-weight: 600` (semibold). 2px solid `border-accent` bottom indicator, width matches text width
- **Inactive tabs:** `text-zinc-600` color, `font-weight: 400` (regular). No bottom border
- **Count badges:** Parenthesized number, e.g., "Draft (3)". Uses `text-muted`, Inter 12px. No separate badge pill — inline text only
- **Hover:** `bg-zinc-50` background on hover (full tab height). `transition: background-color 150ms`
- **Font:** Inter 13px medium. Tab names from entity state machine config (`entity-actions.ts` `tabs` array)
- **Spacing:** 0px gap between tabs (adjoining). Each tab: padding 8px 16px horizontal. Text left-aligned within tab
- **Width:** Tabs sized to content (no equal-width stretching). If tabs total < bar width, empty space on right
- **Keyboard:** ArrowLeft/ArrowRight moves focus between tabs (roving tabindex). Home/End jump to first/last. Enter/Space activates
- **ARIA:** `role="tablist"`. Each tab: `role="tab"`, `aria-selected="true|false"`, `tabindex="0"` (active) / `tabindex="-1"` (inactive). `aria-controls` points to tabpanel ID. Tabpanel: `role="tabpanel"`, `aria-labelledby` points to tab ID
- **Edge cases:** Tab with count 0 → still shown (user may want empty view). Tab disabled in config → not rendered. Only one tab in config → bar not rendered (no need for single tab)

---

### State 2: Overflow

#### Layout (ASCII)
```
┌─ ViewTabBar ──────────────────────────────────────────────────────────────────┐
│ ┌──┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌────────────┐ ┌────────┐ ┌┐│
│ │◀ │ │   All    │ │ Draft (3) │ │Confirmed (12)│ │Posted (45) │ │Fulfill │ │▶││
│ └──┘ └──────────┘ └───────────┘ └──────────────┘ └────────────┘ │ed (7)  │ └┘│
│  scroll left                                          ██████████ └────────┘ sr│
│  button (hidden                       active indicator (scrolls into view)    │
│  if at start)                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
  Arrow buttons appear on edges when tabs overflow viewport
```

#### Details
- **Trigger:** Total tab width > viewport width → overflow mode
- **Scroll buttons:** "◀" left arrow (left edge), "▶" right arrow (right edge). 28×28px, `bg-white`, border: none, hover: `bg-zinc-100`. Z-index: 1 (above tabs)
- **Visibility:** Left arrow hidden when scrolled to start (scrollLeft === 0). Right arrow hidden when scrolled to end
- **Scroll behavior:** Click scrolls by ~150px (or next partially visible tab into full view). Smooth scroll: `scroll-behavior: smooth`
- **Active tab:** On activation: `scrollIntoView({ block: 'nearest', inline: 'center' })` — auto-scrolls to ensure active tab is visible
- **Container:** `overflow-x: auto` with scrollbar hidden (`scrollbar-width: none` or `-webkit-scrollbar: none`). Arrow buttons provide explicit scroll control
- **Keyboard:** Arrow keys still navigate tabs AND scroll if needed (same as normal)
- **ARIA:** Scroll buttons: `aria-label="Scroll tabs left"` / "Scroll tabs right". Hidden when not visible: `aria-hidden="true"`
- **Edge cases:** Very narrow viewport (mobile) → arrow buttons always visible (24×24px). Tab text may truncate to "Conf…" if < 80px wide, with full text in `title` tooltip

---

### Overflow Scroll Mechanics (Detail)

```
┌───┬──────────────────────────────────────────────────────┬───┐
│ ◀ │ [All] [Draft (3)] [Confirmed (12)] [Posted (45)] [Fu│ ▶ │
└───┴──────────────────────────────────────────────────────┴───┘
     │                                              │
     └─ scroll buttons toggle visibility  ──────────┘
        via IntersectionObserver on first/last tab
```

**Scroll button rendering rule:**
```
leftArrow.visible  = (scrollContainer.scrollLeft > 4)      // 4px buffer
rightArrow.visible = (scrollWidth - clientWidth - scrollLeft > 4)
```

---
*Font: Inter 13px medium. Active indicator: 2px #216e4e. Hover: bg-zinc-50. All transitions: 150ms.*
