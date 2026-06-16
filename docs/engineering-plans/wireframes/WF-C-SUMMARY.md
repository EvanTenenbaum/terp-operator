## Wireframe: WF-C-SUMMARY — GridSummaryStrip (Collapsed / Expanded)

A compact summary line above the grid. **Not a permanent KPI strip.** In the UX-first
retrofit, the summary is **collapsed by default to a single inline KPI text line**,
and the operator clicks "Show breakdown ▾" to reveal 3–5 metric cards.

> **Why this changed:** The original spec rendered 3–5 KPI cards as a permanent 80px
> strip above every grid. That violates UX-2 (supporting info one click away, never
> zero) — the breakdown is reference data the operator usually does not need, and
> permanent display habituates the eye and steals 80px of vertical real estate.
> Mercury's pattern is a single line ("\$1,248,500 across 42 transactions") with
> the breakdown one click away.

---

### State 1: Collapsed (Default)

#### Layout (ASCII)
```
┌─ GridSummaryStrip (collapsed) ─────────────────────────────────────────────────┐
│                                                                                 │
│   42 orders · $128,400 total · 5 pending · 3 shipped         [Show breakdown ▾]│
│   Inter 13px medium, text-zinc-700, tabular numbers          Inter 12px link    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
   Height: 36px   bg-white   border-bottom: 1px solid border-zinc-200
```

#### Details
- **Single text line** combining the 3–4 most useful numbers as readable prose
- Format: "[count] [entities] · $[total] · [secondary] · [tertiary]"
- Right-aligned **"Show breakdown ▾"** link reveals the expanded card view
- Height: 36px (vs. legacy 80px) — recovers 44px of grid space
- Tabular numbers (`font-variant-numeric: tabular-nums`)
- Updates reactively when filters change (no skeleton on re-fetch; previous values stay until new arrive)
- **ARIA:** `role="region"`, `aria-label="Summary: 42 orders, $128,400 total, 5 pending, 3 shipped"` — full readable description for screen readers
- **Edge cases:** zero results → "No orders match. [Clear filters]". Loading on first mount → skeleton text rect (36px tall, single row)

---

### State 2: Expanded (After "Show breakdown ▾")

#### Layout (ASCII)
```
┌─ GridSummaryStrip (expanded) ──────────────────────────────────────────────────┐
│                                                                                 │
│   42 orders · $128,400 total · 5 pending · 3 shipped         [Hide breakdown ▴]│
│                                                                                 │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│   │ Total Orders│ │ Total Value │ │  Pending    │ │  Avg Value  │               │
│   │     42      │ │  $128,400   │ │  5  ▲12%   │ │   $3,057    │               │
│   └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
   Height: 36px + 72px cards + 8px gap = 116px expanded
```

#### Card anatomy
```
┌─────────────┐
│ Total Orders│   ← Inter 11px, uppercase, text-muted, letter-spacing 0.5px
│             │
│      42     │   ← Inter 24px semibold, text-zinc-900, tabular-nums
│   ▲ 12%     │   ← Inter 12px, green ▲ or red ▼ + percentage delta (optional)
└─────────────┘
   ~160-180px wide × 64-72px tall
```

#### Details
- **Cards appear** below the inline summary line. 3–5 cards depending on entity (sales-orders gets 4: Total Orders / Total Value / Pending / Avg Value)
- **Toggle persistence:** "Show breakdown" preference persists per user per view in URL `?breakdown=1` (UX-11) and in `useUiStore`
- Card width: min 140px, ideal 180px. Responsive wrap at <900px (2 rows), <600px (2 per row)
- **Delta arrows** (optional) compare to last period; absent when no comparison data
- Empty values: "—" (em dash) in `text-muted`
- Currency: `$12,400`; numbers >999,999 abbreviate to "1.2M"; negative values use `text-error`
- **ARIA:** each card `role="region"`, full readable `aria-label` (e.g., "Total Orders: 42")

---

### Transitions

```
Loading (skeleton text line) ──▶ Collapsed (text line)
Collapsed   ── click "Show breakdown ▾" ──▶ Expanded (text line + cards)
Expanded    ── click "Hide breakdown ▴"  ──▶ Collapsed
Any         ── filter change ──▶ Numbers update in place (no full re-skeleton)
Any         ── query error ──▶ Collapsed inline message: "⚠ Summary unavailable. [Retry]"
```

- Expand/collapse animates with 200ms `cubic-bezier(0.2, 0.8, 0.4, 1)` height transition
- No skeleton on re-fetch (stale-while-revalidate) — keeps the operator from seeing flashing placeholders

---

### Error (inline, no separate card grid)

```
┌─ GridSummaryStrip ─────────────────────────────────────────────────────────────┐
│  ⚠ Summary unavailable                                              [🔄 Retry] │
└─────────────────────────────────────────────────────────────────────────────────┘
```

A single 36px error line replaces the summary. The grid below stays usable.
This avoids a full-strip amber card that competes with the grid for attention.

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | N/A | Display component |
| UX-2 Supporting info one click away | ✅ | Breakdown is one click; default is the inline summary |
| UX-3 One primary surface per view | ✅ | Component is a thin band above the grid (grid remains primary) |
| UX-4 Bulk actions on selection only | N/A | Display component |
| UX-5 Validation at point of impact | ✅ | Error renders in-line where data would, not in a separate alert panel |
| UX-6 Tools in slide-overs; modals for confirms | N/A | Display component |
| UX-7 Mode is always visible | ✅ | Inline summary text is always visible; breakdown state is implicit (▴/▾) |
| UX-8 State changes resolve in place | ✅ | Toggle expands/collapses inline; no navigation |
| UX-9 Filtering fluid; navigation durable | ✅ | Numbers respect current filters; no separate "filter scope" indicator needed |
| UX-10 Cell saves immediate; forms explicit | N/A | Display component |
| UX-11 URL is session memory | ✅ | Expanded/collapsed state encodes as `?breakdown=1` |
| UX-12 Empty states give next step | ✅ | Zero results → "No orders match. [Clear filters]" |

---
*Font: Inter 11px labels, Inter 13px summary text, Inter 24px values. Colors: semantic classes only. Collapsed height 36px; expanded ~116px.*
