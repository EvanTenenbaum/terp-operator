## Wireframe: WF-C-SUMMARY — GridSummaryStrip All States

A horizontal row of metric cards summarizing grid data. Mercury-style KPI strip
with dense numeric display, skeletons during load, and error recovery.

---

### State 1: Loading

#### Layout (ASCII)
```
┌─ GridSummaryStrip ──────────────────────────────────────────────────────────────────┐
│                                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░ │  │
│  │ ░░░░░░░░░░░      │  │ ░░░░░░░░░░░      │  │ ░░░░░░░░░░░      │  │ ░░░░░░░      │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│  ~180px wide each       pulsing grey rectangles   height: 64px                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
  Height: 80px (64px cards + 8px padding top/bottom)
```

#### Details
- **Skeleton cards:** 3-5 grey rectangles, ~180px wide × 48px each (two rows of 32px within each card). `bg-zinc-200` with `animate-pulse` (CSS keyframe: opacity 100% → 50% → 100%, 2s infinite)
- **Count:** 3 for simple grids (e.g., Drafts), 4-5 for complex grids (e.g., Sales Orders with total, pending, value metrics)
- **Layout:** Horizontal flex row, `gap: 12px`. Cards `flex-shrink: 0`
- **ARIA:** `aria-busy="true"`, `role="status"`. Skeleton rectangles: `aria-hidden="true"`
- **Edge cases:** Initial mount (before first query) shows skeletons. Subsequent re-fetches: NO skeletons — keep previous data visible (stale-while-revalidate pattern)

---

### State 2: Loaded

#### Layout (ASCII)
```
┌─ GridSummaryStrip ──────────────────────────────────────────────────────────────────┐
│                                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ Total Orders│  │ Total Value │  │  Pending    │  │  Shipped    │  │ Avg Value │  │
│  │             │  │             │  │             │  │             │  │           │  │
│  │     42      │  │  $128,400   │  │  5  ▲12%   │  │  3  ▼4%    │  │  $3,057   │  │
│  │             │  │             │  │             │  │             │  │           │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
  Each card: ~180px wide × 64px   gap: 12px between cards
```

#### Card Anatomy
```
┌─────────────┐
│ Total Orders │  ← label: Inter 11px, uppercase, text-muted, letter-spacing: 0.5px
│              │
│      42      │  ← value: Inter 24px, semibold (600), text-zinc-900
│              │
└─────────────┘

┌─────────────┐
│   Pending    │
│              │
│  5   ▲ 12%  │  ← value + delta: Inter 24px + Inter 12px delta (green/red arrow)
│              │     arrow: ▲ green (#16a34a) / ▼ red (#b42318). 12px next to value
└─────────────┘
```

#### Details
- **Card dimensions:** Min-width 140px, ideal ~180px. Height 64px. `bg-white` (or `bg-zinc-50` if inside a section). `border: 1px solid border-zinc-200`, `border-radius: 6px`. Padding: 8px 12px
- **Label:** Inter 11px, `text-muted` (#737373), `text-transform: uppercase`, `letter-spacing: 0.5px`, `font-weight: 500`. Single line, truncates with "…"
- **Value:** Inter 24px, `font-weight: 600` (semibold), `text-zinc-900`. Tabular numbers: `font-variant-numeric: tabular-nums`. Number formatted with locale (e.g., "1,234" not "1234")
- **Delta:** Optional. Shown when comparison data is available (vs. last period). Green upward arrow "▲" or red downward arrow "▼" + percentage. Font: Inter 12px, `font-weight: 500`
- **Responsive:** On viewports < 900px, cards wrap to 2 rows. On < 600px, 2 cards per row
- **Loading transition:** Cards fade in with `opacity: 0 → 1`, 200ms `ease-out`. Each card staggered by 50ms
- **Empty values:** If value is 0/null, show "—" (em dash) in `text-muted`. No delta shown
- **ARIA:** Container: `role="region"`, `aria-label="Summary metrics"`. Each card: no interactive role (it's display-only). Values: `aria-label` with full readable text (e.g., "Total orders: 42")
- **Edge cases:** Negative values: red text for value itself, not just delta. Currency formatting: `$12,400` not `$12400`. Very large numbers: "1.2M" not "1,234,567" (threshold: > 999,999)

---

### State 3: Error

#### Layout (ASCII)
```
┌─ GridSummaryStrip ──────────────────────────────────────────────────────────────────┐
│                                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────────┐       │
│  │  ⚠ Unable to load summary                                     [🔄 Retry]  │       │
│  └───────────────────────────────────────────────────────────────────────────┘       │
│  single card, full width, amber warning, retry button                                │
└──────────────────────────────────────────────────────────────────────────────────────┘
  Height: 48px   card: bg-amber-50, border: 1px solid border-amber-200
```

#### Details
- **Card:** Single card, full width of the strip. `bg-amber-50` background, `border: 1px solid border-amber-200`
- **Content:** Warning icon "⚠" (16×16, `text-amber-600`) + message + Retry button
- **Retry:** "🔄 Retry" button (right-aligned). Fires the summary query again. On click: transitions to Loading state
- **Message text:** Inter 13px, `text-zinc-700`. Shows generic "Unable to load summary" — not raw server error
- **ARIA:** `role="alert"`. Full error message in `aria-label` for screen readers
- **Edge cases:** Retry fails again → card stays in error state with updated message: "Still unable to load. Try again?" No retry limit. Network offline → same error state (no special offline indicator yet)

---

### Transition States

```
Loading ──▶ Loaded                    (data arrives, 200ms fade-in)
Loaded  ──▶ Error                     (query fails)
Error   ──▶ Loading (retry) ──▶ Loaded (success)
Error   ──▶ Loading (retry) ──▶ Error (fail again)
Loaded  ──▶ (no skeleton on re-fetch) (stale-while-revalidate)
```

---
*Font: Inter 11px labels, Inter 24px values. Colors: semantic classes only. Card gaps: 12px. Responsive wrap at 900px, 600px.*
