## Wireframe: WF-C-DASHBOARD — DashboardView Template

A welcome-and-overview template for the operator console home screen. Mercury-style
dashboard with KPI strips, focus panels, work queues, and activity feeds.

> **UX-first principles for this template:**
> - **One primary surface and a clear landing zone.** The 4-card KPI strip is the
>   default eye-landing target. Today's Focus and Work Queues are secondary, not
>   peers (UX-3).
> - **Three visual sections, not eight WorkspacePanels.** Welcome + Quick Actions →
>   KPI strip → two-column (Focus / Queues) → Activity Feed.
> - **Work Queues are clickable links to filtered views** (UX-9). Clicking
>   "Intake Ready: 8" navigates to `/intake?status=ready`. The dashboard does
>   not own the work — it routes the operator to the surface that does.
> - **Empty queues stay visible** with a green "All caught up ✓" — the operator
>   trusts that "nothing here" means "nothing to do," not "broken."
> - **State (active tab in activity feed) encodes in the URL** so reload restores
>   the view (UX-11).

---

### Full Page Layout

```
┌─ Dashboard ──────────────────────────────────────────────────────────────────────┐
│                                                                                   │
│  ┌─ Welcome Header ──────────────────────────────────────────────────────────┐   │
│  │  Good morning, Evan                          Monday, June 15, 2026         │   │
│  │  Inter 24px semibold                         Inter 13px text-muted          │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  ┌─ Quick Actions ───────────────────────────────────────────────────────────┐   │
│  │  [+ New Order]  [+ New PO]  [+ New Intake]  [View Pending (5)]            │   │
│  │  Inter 13px medium  padding 8px 16px  gap: 8px                            │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  ┌─ KPI Strip ───────────────────────────────────────────────────────────────┐   │
│  │  ┌────────────────┬────────────────┬────────────────┬────────────────┬──┐ │   │
│  │  │ Total Revenue  │ Open Orders    │ Pending POs   │ Avg Margin     │  │ │   │
│  │  │                │                │               │                │  │ │   │
│  │  │  $1,248,500    │      42        │      8        │    22.4%       │  │ │   │
│  │  │   ▲ 12.3%      │   ▲ 8.5%       │   ▼ 2.1%      │   ▲ 1.4%       │  │ │   │
│  │  └────────────────┴────────────────┴────────────────┴────────────────┴──┘ │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  Today's Focus                   │  │  Work Queues                         │  │
│  │                                  │  │                                      │  │
│  │  ┌─ Pending Confirmation (5) ─┐  │  │  ┌─ Pending Review ────  [3] ───┐   │  │
│  │  │ SO-1052  Acme Co    $12.4K │  │  │  │ Intake batches waiting       │   │  │
│  │  │ SO-1051  Beta Inc    $8.2K │  │  │  └──────────────────────────────┘   │  │
│  │  │ SO-1050  Gamma LLC   $3.1K │  │  │                                      │  │
│  │  │ SO-1049  Delta Corp  $22.8K│  │  │  ┌─ Unconfirmed POs ────  [5] ───┐   │  │
│  │  │ SO-1048  Epsilon In   $6.9K│  │  │  │ Awaiting vendor confirmation   │   │  │
│  │  └────────────────────────────┘  │  │  └──────────────────────────────┘   │  │
│  │                                  │  │                                      │  │
│  │  ┌─ Awaiting Payment (3) ──────┐ │  │  ┌─ Discrepancies ──────  [2] ───┐   │  │
│  │  │ SO-1047  Zeta LLC   $15.3K  │ │  │  │ Quantity/price mismatches      │   │  │
│  │  │ SO-1046  Eta Corp    $4.5K  │ │  │  └──────────────────────────────┘   │  │
│  │  │ SO-1045  Theta Inc  $11.2K  │ │  │                                      │  │
│  │  └─────────────────────────────┘ │  │  ┌─ Draft Orders ───────  [12] ──┐   │  │
│  │                                  │  │  │ Incomplete sales orders         │   │  │
│  │  ┌─ Shipping Today (2) ───────┐  │  │  └──────────────────────────────┘   │  │
│  │  │ SO-1044  Iota LLC    $9.8K │  │  │                                      │  │
│  │  │ SO-1043  Kappa Co    $3.6K │  │  └──────────────────────────────────────┘  │
│  │  └────────────────────────────┘  │                                            │
│  └──────────────────────────────────┘                                            │
│                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │  Activity Feed                                                              │  │
│  │                                                                             │  │
│  │  10:42 AM  ·  Evan confirmed SO-1042              Acme Co · $12,400         │  │
│  │  10:15 AM  ·  System auto-posted SO-1041                                 │  │
│  │   9:58 AM  ·  PO-2041 received: Oranges 150ct     Beta Inc · $45.00         │  │
│  │   9:30 AM  ·  Sarah created PO-2042               Delta Corp · $8,200       │  │
│  │   9:05 AM  ·  Payment received: SO-1040             Gamma LLC · $3,150      │  │
│  │   8:45 AM  ·  Intake batch #IA-305 received        12 orders · $48,600      │  │
│  │                                                                             │
│  │  [View all activity →]                                                      │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

### Section Details

#### 1. Welcome Header
**Height:** 60px
```
┌─ Welcome Header ──────────────────────────────────────────────────────────┐
│  Good morning, Evan                          Monday, June 15, 2026         │
│  Inter 24px semibold  text-zinc-900           Inter 13px  text-muted        │
└───────────────────────────────────────────────────────────────────────────┘
```
- **Greeting:** Time-aware: "Good morning" (before 12), "Good afternoon" (12-17), "Good evening" (after 17)
- **User name:** From auth context. Inter 24px, `font-weight: 600`
- **Date:** Right-aligned. Full format: "Monday, June 15, 2026". Inter 13px, `text-muted`
- No border-bottom (open feel). Padding: 16px horizontal, 12px vertical

#### 2. Quick Actions
**Height:** 52px
```
┌─ Quick Actions ───────────────────────────────────────────────────────────┐
│  [+ New Order]  [+ New PO]  [+ New Intake]  [View Pending (5)]            │
│  primary        secondary   secondary       outline                         │
└──────────────────────────────────────────────────────────────────────────┘
```
- **Buttons:** 2-4 action buttons. Primary button (solid `bg-accent`): "+ New Order". Secondary (outline): "+ New PO", "+ New Intake". Outline: "View Pending (5)"
- **Spacing:** `gap: 8px` between buttons. Inter 13px medium, padding 8px 16px, border-radius 6px
- **Count badges:** Inline in button text: "(5)" in `text-muted`
- **ARIA:** Each button has descriptive `aria-label`

#### 3. KPI Strip
**Height:** 100px (80px cards + 20px padding)
```
┌─ KPI Strip ───────────────────────────────────────────────────────────────┐
│  ┌────────────────┬────────────────┬────────────────┬────────────────┐    │
│  │ Total Revenue  │ Open Orders    │ Pending POs   │ Avg Margin     │    │
│  │                │                │               │                │    │
│  │  $1,248,500    │      42        │      8        │    22.4%       │    │
│  │   ▲ 12.3%      │   ▲ 8.5%       │   ▼ 2.1%      │   ▲ 1.4%       │    │
│  └────────────────┴────────────────┴────────────────┴────────────────┘    │
└───────────────────────────────────────────────────────────────────────────┘
```
- **Cards:** 4 equally-sized cards (25% width each). Same styling as GridSummaryStrip cards but taller (80px vs 64px)
- **Values:** Inter 28px semibold (slightly larger than GridSummaryStrip for prominence)
- **Deltas:** Comparison vs. last month. Arrow + percentage
- **Hover:** Slight lift: `transform: translateY(-2px)`, `box-shadow: 0 4px 8px rgba(0,0,0,0.05)`. Transition: 200ms
- **ARIA:** Each card: `role="region"`, `aria-label="Total Revenue: $1,248,500, up 12.3% from last month"`

#### 4. Two-Column Layout
```
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│  Today's Focus (50% width)       │  │  Work Queues (50% width)         │
│                                  │  │                                  │
│   Section panels with:           │  │   Section panels with:           │
│   - Title (Inter 14px semibold)  │  │   - Title + count badge          │
│   - Item rows (Inter 13px)       │  │   - Description (Inter 12px)     │
│   - Hover: bg-zinc-50            │  │   - Click navigates to view      │
│   - Click navigates to entity    │  │   - Hover: bg-zinc-50            │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

##### Today's Focus Panel
- **Sections:** Configurable entity lists: "Pending Confirmation", "Awaiting Payment", "Shipping Today"
- **Item rows:** ID, Customer, Amount. Truncated to fit. Max 5 items per section
- **See more:** If > 5 items: "View all (8) →" link at bottom of section
- **Empty section:** "Nothing to focus on today ✓" in green text. Section still shown (not hidden)

##### Work Queues Panel
- **Sections:** Configurable system queues: "Pending Review", "Unconfirmed POs", "Discrepancies", "Draft Orders"
- **Count badge:** Right-aligned `[N]` badge (`bg-zinc-100`, Inter 12px, border-radius: 10px, padding: 2px 8px)
- **Description:** One-line description below title (Inter 12px, `text-muted`)
- **Click:** Navigates to the corresponding view with the queue filter pre-applied
- **Empty queue:** "All caught up ✓" in green text. Section still shown

#### 5. Activity Feed
**Height:** ~250px (scrollable if needed)
```
┌─ Activity Feed ───────────────────────────────────────────────────────────┐
│                                                                           │
│  10:42 AM  ·  Evan confirmed SO-1042              Acme Co · $12,400       │
│  10:15 AM  ·  System auto-posted SO-1041                                  │
│   9:58 AM  ·  PO-2041 received: Oranges 150ct     Beta Inc · $45.00       │
│   9:30 AM  ·  Sarah created PO-2042               Delta Corp · $8,200     │
│   9:05 AM  ·  Payment received: SO-1040             Gamma LLC · $3,150    │
│   8:45 AM  ·  Intake batch #IA-305 received        12 orders · $48,600    │
│                                                                           │
│  [View all activity →]                                                    │
└───────────────────────────────────────────────────────────────────────────┘
```
- **Items:** Timestamp · User/System · Action verb · Entity ID · optional details
- **Layout:** Two-part row: Timestamp + Actor + Action (left), Entity details (right, `text-muted`)
- **Action verbs:** Created, Confirmed, Posted, Received, Shipped, Paid, Edited, Deleted
- **System actions:** "System auto-posted" in `text-muted` italic. User actions: normal text
- **Max items:** 20 initially visible. "View all activity →" opens a full activity log view
- **Real-time:** Polls every 30 seconds (or WebSocket if available). New items slide in from top
- **ARIA:** `role="feed"` container. Each item: `role="article"`. Live region: `aria-live="polite"` for new items

---

### Responsive Layout

```
Desktop (>1024px):
┌────────────────────────────────────────────────────────────────────────────┐
│ Welcome Header                                                              │
│ Quick Actions                                                               │
│ KPI Strip (4 cards)                                                         │
│ ┌─────────────────────────┐  ┌─────────────────────────┐                   │
│ │ Today's Focus           │  │ Work Queues             │                   │
│ └─────────────────────────┘  └─────────────────────────┘                   │
│ Activity Feed                                                               │
└────────────────────────────────────────────────────────────────────────────┘

Tablet (768-1024px):
┌──────────────────────────────────┐
│ Welcome Header                    │
│ Quick Actions                     │
│ KPI Strip (2×2 grid)              │
│ ┌──────────────────────────────┐  │
│ │ Today's Focus (stacked)      │  │
│ ├──────────────────────────────┤  │
│ │ Work Queues                  │  │
│ └──────────────────────────────┘  │
│ Activity Feed                     │
└──────────────────────────────────┘

Mobile (<768px):
┌──────────────────┐
│ Welcome Header    │
│ Quick Actions     │
│ (scrollable row)  │
│ KPI (1 col)       │
│ Today's Focus     │
│ Work Queues       │
│ Activity Feed     │
└──────────────────┘
```

### Data Flow

```
DashboardView
    │
    ├──▶ Welcome       ← Static + auth context (user name)
    ├──▶ Quick Actions ← Static config (dashboard-actions.ts)
    ├──▶ KPI Strip     ← tRPC dashboard.kpis() — single query returns all 4 values
    ├──▶ Today Focus   ← tRPC dashboard.focusItems() — returns lists of entities
    ├──▶ Work Queues   ← tRPC dashboard.workQueues() — returns queues with counts
    └──▶ Activity Feed ← tRPC dashboard.activityFeed({ limit: 20 }) — paginated
```

### Empty States

- **No KPIs (brand new system):** KPI strip still renders, values show "—" with "No data yet" tooltip
- **Today's Focus empty:** "Nothing needs your attention today" with ✓ icon
- **Work Queues all empty:** "All queues cleared" with ✓ icon
- **Activity Feed empty:** "No recent activity" with empty state illustration (or just text for v1)

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Quick Actions reflect what the operator can usefully start; no disabled "Coming soon" buttons |
| UX-2 Supporting info one click away | ✅ | KPI deltas, queue counts, and activity feed link to detail; no dense always-visible reference data |
| UX-3 One primary surface per view | ✅ | KPI strip is the default landing zone; Focus and Queues are secondary, not 8 equal panels |
| UX-4 Bulk actions on selection only | N/A | Dashboard is not a multi-select surface |
| UX-5 Validation at point of impact | N/A | Read-only summary surface |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Quick Action "+ New Order" opens the sales slide-over form, not a modal |
| UX-7 Mode is always visible | ✅ | Greeting and date orient the operator; current view is always the dashboard while here |
| UX-8 State changes resolve in place | ✅ | Activity feed polling updates in place; queue counts update without navigation |
| UX-9 Filtering fluid; navigation durable | ✅ | Clicking a Work Queue navigates to a filtered view URL (e.g., `/intake?status=ready`) |
| UX-10 Cell saves immediate; forms explicit | N/A | No edit surface |
| UX-11 URL is session memory | ✅ | Active activity tab and any expanded section encode to URL hash; dashboard root URL is durable |
| UX-12 Empty states give next step | ✅ | Empty Focus → "Nothing needs your attention today ✓"; empty Queues → "All caught up ✓"; empty Activity → "No recent activity" |

---
*Font: Inter 24px greeting, Inter 14px section headers, Inter 13px body, Inter 12px meta. Columns: 50/50 split at desktop, stacked at tablet/mobile. Real-time polling: 30s.*
