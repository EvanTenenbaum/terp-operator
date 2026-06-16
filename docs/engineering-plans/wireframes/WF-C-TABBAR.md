## Wireframe: WF-C-TABBAR — ContentTabBar (Content-Kind Tabs Only)

> **Repurposed in the UX-first retrofit.** Status filtering has moved to the
> `FilterToolbar` Status pill (see WF-C-FILTER). This component now handles
> **content-type tab navigation only** — switching between *kinds* of content within
> a single surface, not between filter slices of the same kind.
>
> Use this component for:
> - **Slide-over entity tabs** (Summary / Lines / Pricing / History / Logs)
> - **Dashboard activity tabs** (Recent Activity / Notifications / Audit Log)
> - **Profile tabs** (Customer profile: Overview / Orders / Payments / Tags / Notes)
> - **Wizard step tabs** (when wizard renders in tabbed form rather than linear)
>
> Do **not** use this component for status-based filtering of a list. Status
> filtering is part of the filter toolbar (UX-9 — filtering is fluid, navigation
> is durable).

A horizontal tab bar for navigating between content kinds within a single surface.
Mercury-style underline indicator with optional count badges and overflow handling.

---

### State 1: Normal

#### Layout (ASCII)
```
┌─ ContentTabBar ───────────────────────────────────────────────────────────────┐
│                                                                                │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  ┌─────────────┐               │
│  │ Summary  │  │ Lines (3) │  │ History (12) │  │ Logs        │               │
│  └──────────┘  └───────────┘  └──────────────┘  └─────────────┘               │
│       ↑                          ████████████                                 │
│       │                          active indicator: 2px #216e4e                │
│   inactive tab                   (width matches tab text)                      │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
  Height: 40px   bg-white   border-bottom: 1px solid border-zinc-200
```

#### Details
- Horizontal row of tab buttons. Height: 40px. `bg-white`, bottom border `1px solid border-zinc-200`
- **Active tab:** `text-accent` (#216e4e), `font-weight: 600`. 2px `border-accent` bottom indicator, width matches text
- **Inactive tabs:** `text-zinc-600`, `font-weight: 400`. No bottom border
- **Count badges (optional):** inline parens `(3)` in `text-muted`, Inter 12px — used for "Lines (3)" or "History (12)" where the count is genuinely useful context, **not** for filtering an entity list
- **Hover:** `bg-zinc-50`. Transition 150ms
- **Tabs sized to content** (no equal-width stretching)
- **Tab content** loads on activation (lazy), or pre-fetched in slide-over case
- **Keyboard:** ArrowLeft/Right roving tabindex. Home/End jump. Enter/Space activates
- **ARIA:** `role="tablist"`, each tab `role="tab"` with `aria-selected`, `aria-controls` → tabpanel id. Tabpanel: `role="tabpanel"`, `aria-labelledby` → tab id
- **URL encoding:** active tab encodes as `#tab-id` (entity slide-over) or `?tab=...` (full-page), so reload restores the tab (UX-11)

---

### State 2: Overflow

#### Layout (ASCII)
```
┌─ ContentTabBar ───────────────────────────────────────────────────────────────┐
│ ┌──┐ ┌────────┐ ┌──────┐ ┌──────────┐ ┌─────────┐ ┌──────┐ ┌──────────┐ ┌──┐ │
│ │◀ │ │Summary │ │Lines │ │ Pricing  │ │ History │ │ Logs │ │Notes (4) │ │▶ │ │
│ └──┘ └────────┘ └──────┘ └──────────┘ └─────────┘ └──────┘ └──────────┘ └──┘ │
│  scroll left                                                       scroll right│
└────────────────────────────────────────────────────────────────────────────────┘
```

#### Details
- Overflow triggers when total tab width > container width
- Scroll buttons "◀" / "▶" 28×28, bg-white, hover `bg-zinc-100`, hidden at scroll extremes (4px buffer)
- Active tab `scrollIntoView({ inline: 'center' })` on activation
- Container `overflow-x: auto` with scrollbar hidden
- **ARIA:** scroll buttons `aria-label`, `aria-hidden="true"` when not visible

---

### Migration note (from old ViewTabBar)

Old usage (status filtering) → moved to **FilterToolbar Status pill**.

| Old tab bar role | New home |
|------------------|----------|
| "All / Draft (3) / Confirmed (12) / Posted (45)" filtering of a list | FilterToolbar Status pill (multi-select with count badges) |
| "Summary / Lines / Pricing / History" inside an entity slide-over | This component (content-kind tabs) |
| Dashboard "Recent Activity / Notifications" | This component (content-kind tabs) |
| Customer profile "Overview / Orders / Payments" | This component (content-kind tabs) |

Existing call sites that used the old component for status filtering must migrate to
the Status pill. See WF-C-FILTER for the multi-select Status pill spec.

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | N/A | Navigation component, not actions |
| UX-2 Supporting info one click away | ✅ | Each tab is exactly one click from the active surface |
| UX-3 One primary surface per view | ✅ | Tab content fills one primary area; tabs do not split the surface |
| UX-4 Bulk actions on selection only | N/A | Not a selection component |
| UX-5 Validation at point of impact | N/A | Not a write surface |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | This component lives inside slide-overs and full-page entity views |
| UX-7 Mode is always visible | ✅ | Active tab indicator continuously visible |
| UX-8 State changes resolve in place | ✅ | Tab switch updates content in place; no navigation away |
| UX-9 Filtering fluid; navigation durable | ✅ | This component is for content-kind navigation (durable); status filtering moved out |
| UX-10 Cell saves immediate; forms explicit | N/A | Not a write surface |
| UX-11 URL is session memory | ✅ | Active tab encodes to URL hash or query param |
| UX-12 Empty states give next step | ✅ | Empty tab content shows "No [items] yet — [+ Add]" |

---
*Font: Inter 13px medium. Active indicator: 2px #216e4e. Hover: bg-zinc-50. All transitions: 150ms.*
