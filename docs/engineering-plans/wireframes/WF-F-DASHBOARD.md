## Wireframe: WF-F-DASHBOARD — Dashboard Navigation Flow

### Flow Overview
Operator lands on Dashboard, views KPIs and Work Queues, clicks an actionable queue item to navigate to the corresponding view with pre-applied filters, completes work, and returns to see updated counts.

### Step 1: Dashboard Loads — KPIs, Today Focus, Work Queues
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard                                                   │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────┬────────────┬────────────┬────────────┐       │
│  │ Today's    │ Open POs   │ Sales Vol  │ Margin     │       │ ← KPI cards
│  │ Revenue    │            │            │            │       │
│  │ $34,200    │ 12         │ $48,500    │ 22.4%      │       │
│  │ ↑ 8% vs LW │ ↔ flat     │ ↑ 12%      │ ↑ 0.3pp    │       │
│  └────────────┴────────────┴────────────┴────────────┘       │
│──────────────────────────────────────────────────────────────│
│  Today's Focus                          Work Queues          │
│  ┌────────────────────────┐  ┌────────────────────────────┐  │
│  │ 🔴 3 Overdue POs       │  │ 📥 Intake Ready:     8     │  │ ← actionable
│  │ 🟡 2 Approaching SLAs  │  │ 📋 Pending Sales:    5     │  │
│  │ 🟢 12 On Track         │  │ 💰 Payments Due:     3     │  │
│  └────────────────────────┘  │ 🏷️  Unmatched Tags:   12    │  │
│                              │ 🚛 Pending Shipments:  2    │  │
│  Recent Activity             └────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 10:32 AM  PO #1042 finalized — $5,600               │   │
│  │ 09:15 AM  Sale #2312 confirmed — $2,100             │   │
│  │ 08:45 AM  Receipt #089 — 12 items                   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- App loads at `/dashboard` route. Data fetching in progress.
#### User Action
- App auto-navigates to dashboard on login. Loading skeletons shown during data fetch.
#### After State
- Dashboard fully rendered: 4 KPI cards (revenue, open POs, sales volume, margin), Today Focus panel (left), Work Queues panel (right), Recent Activity feed (bottom).
#### Interactive Elements, ARIA, Edge Cases
- KPI cards: `role="region"`, `aria-label="Today's Revenue: $34,200"`. Cards are keyboard-focusable but not clickable.
- Work Queues: each item is a `role="button"` if clickable (Intake Ready, Pending Sales, etc.).
- Loading state: skeleton placeholders for each card/panel. Error state: "Unable to load dashboard. [Retry]".
- Auto-refresh: dashboard polls every 60s (configurable). Last-updated timestamp shown.

### Step 2: "Intake Ready: 8" Clickable Queue Item
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│                              Work Queues                     │
│                              ┌────────────────────────────┐  │
│                              │ 📥 Intake Ready:   ▐▐8▐▐   │  │ ← hover: pointer cursor
│                              │ ─────────────────────────  │  │    blue highlight
│                              │ 📋 Pending Sales:    5     │  │
│                              │ 💰 Payments Due:     3     │  │
│                              │ 🏷️  Unmatched Tags:  12    │  │
│                              │ 🚛 Pending Shipments: 2    │  │
│                              └────────────────────────────┘  │
│                                                              │
│  Tooltip on hover: "View 8 intake batches ready for review"  │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Dashboard fully loaded. Work Queues panel showing 5 queue items.
#### User Action
- Hover over "Intake Ready: 8". Cursor changes to pointer. Row highlights blue (2px left border accent). Tooltip appears.
#### After State
- Hover state active. Click expected next.
#### Interactive Elements, ARIA, Edge Cases
- Queue item: `role="link"` or `role="button"`, `aria-label="Intake Ready: 8 items. Click to review."`.
- Keyboard: Tab to item, Enter to navigate. Visual focus ring (2px blue).
- Edge case: Count = 0 → item grayed out, not clickable, `aria-disabled="true"`.

### Step 3: Click — Navigate to IntakeView with Pre-Applied Filter
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Intake  │  Filtered: Ready to Verify (8)    [Dashboard →]   │ ← context header
├──────────────────────────────────────────────────────────────┤
│  ┌─ Active Tab ──────────────────────────────────────────┐  │
│  │ [▐▐Ready▐▐] [All] [Verified] [Rejected]               │  │ ← tab bar
│  └───────────────────────────────────────────────────────┘  │
│──────────────────────────────────────────────────────────────│
│  ▶ #1042 │ Sunny Farms    │ Jun 15 │ Received │ 12 items    │
│  ▶ #1043 │ GreenLeaf Co   │ Jun 14 │ Received │ 20 items    │
│  ▶ #1044 │ Valley Fresh   │ Jun 15 │ Received │ 6 items     │
│  ▶ #1045 │ Harvest Inc    │ Jun 13 │ Received │ 12 items    │
│  ▶ #1046 │ Sunny Farms    │ Jun 12 │ Received │ 8 items     │
│  ▶ #1047 │ GreenLeaf Co   │ Jun 15 │ Received │ 10 items    │
│  ▶ #1048 │ Valley Fresh   │ Jun 14 │ Received │ 4 items     │
│  ▶ #1049 │ Harvest Inc    │ Jun 13 │ Received │ 16 items    │
└──────────────────────────────────────────────────────────────┘
  Showing 8 POs  (filtered: status=received, verification=pending)
```
#### Before State
- Dashboard visible. User hovered "Intake Ready: 8".
#### User Action
- Click "Intake Ready: 8".
#### After State
- Browser navigates to `/intake?status=ready`. IntakeView loads with filter pre-applied: status = "Ready" (Received but unverified). "Ready" tab active. Grid shows 8 POs matching. Context header shows "Filtered: Ready to Verify (8)" with `[Dashboard →]` link back.
#### Interactive Elements, ARIA, Edge Cases
- Navigation: client-side route. URL encodes filter: `/intake?status=ready&tab=ready`.
- Tab bar: "Ready" tab active (`aria-selected="true"`). Tab text: `Ready (8)` with count badge.
- `[Dashboard →]`: returns to dashboard with preserved state (no re-fetch).
- Edge case: Between click and load, count changes (e.g., 8→7) → actual view shows latest data; mismatch is acceptable.

### Step 4: IntakeView Shows Filtered Results — Tab Active
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Intake  │  Ready to Verify (8)              [Dashboard →]   │
├──────────────────────────────────────────────────────────────┤
│  [▐▐Ready (8)▐▐] [All (14)] [Verified (5)] [Rejected (1)]   │
│──────────────────────────────────────────────────────────────┤
│  ☐ │ PO #  │ Vendor       │ Date     │ Items  │ Batches     │
│────┼───────┼──────────────┼──────────┼────────┼─────────────│
│  ☐ │ 1042  │ Sunny Farms  │ Jun 15   │ 12     │ 3           │
│  ☐ │ 1043  │ GreenLeaf Co │ Jun 14   │ 20     │ 5           │
│  ☐ │ 1044  │ Valley Fresh │ Jun 15   │ 6      │ 2           │
│  ☐ │ 1045  │ Harvest Inc  │ Jun 13   │ 12     │ 4           │
│  ☐ │ 1046  │ Sunny Farms  │ Jun 12   │ 8      │ 2           │
│  ☐ │ 1047  │ GreenLeaf Co │ Jun 15   │ 10     │ 3           │
│  ☐ │ 1048  │ Valley Fresh │ Jun 14   │ 4      │ 1           │
│  ☐ │ 1049  │ Harvest Inc  │ Jun 13   │ 16     │ 6           │
│──────────────────────────────────────────────────────────────│
│  8 POs ready to verify  │  88 total items  │  26 batches     │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Just navigated from dashboard. IntakeView loading.
#### User Action
- Operator reviews the filtered list. Can expand POs and verify batches (see WF-F-INTAKE-VERIFY).
#### After State
- Filtered grid fully loaded. Tab counts show: Ready (8), All (14), Verified (5), Rejected (1). Context-aware summary strip: "8 POs ready to verify | 88 total items | 26 batches".
#### Interactive Elements, ARIA, Edge Cases
- Tab counts: reactively update as batches are verified (Ready count decrements).
- Edge case: All ready items verified while viewing → "Ready (0)" tab, grid shows empty state "All intake verified! 🎉".

### Step 5: Complete Work — Click Dashboard in Nav
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  🏠 Dashboard  │  📋 Purchase Orders  │  📊 Sales  │  ...    │ ← top nav
│  ────────────────────────────────────────────────────────    │
│                                                              │
│  Intake  │  Ready to Verify (5)              [Dashboard →]   │
│  ...                                                         │
│                                                              │
│  ╔══════════════════════════════════════════════════════════╗│
│  ║  ✓ 3 POs verified today                                 ║│ ← toast
│  ╚══════════════════════════════════════════════════════════╝│
└──────────────────────────────────────────────────────────────┘
    │
    │  user clicks "Dashboard" in top nav (or [Dashboard →])
    ▼

┌──────────────────────────────────────────────────────────────┐
│  Dashboard                                                   │
├──────────────────────────────────────────────────────────────┤
│  ... KPI cards (updated) ...                                 │
├──────────────────────────────────────────────────────────────┤
│                              Work Queues                     │
│                              ┌────────────────────────────┐  │
│                              │ 📥 Intake Ready:     5     │  │ ← was 8, now 5
│                              │ 📋 Pending Sales:    5     │  │
│                              │ 💰 Payments Due:     3     │  │
│                              │ 🏷️  Unmatched Tags:  12    │  │
│                              │ 🚛 Pending Shipments: 2    │  │
│                              └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Operator completed verifying 3 POs in IntakeView. Ready count now 5.
#### User Action
- Click "🏠 Dashboard" in top navigation bar. Or click `[Dashboard →]` in Intake context header.
#### After State
- Dashboard loads. KPI cards refresh with updated data. Work Queues shows "Intake Ready: 5" (was 8). Brief highlight/transition on the changed number (amber flash 300ms to draw attention).
#### Interactive Elements, ARIA, Edge Cases
- Navigation: `🏠 Dashboard` link is `role="link"`, `aria-current="page"` when active.
- Count transition animates: number slides up 300ms, color amber briefly, then settles.
- `aria-live="polite"` for count updates: "Work queue Intake Ready updated to 5".

### Step 6: Dashboard Shows Updated Counts
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard                                      Last: 10:45  │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────┬────────────┬────────────┬────────────┐       │
│  │ Today's    │ Open POs   │ Sales Vol  │ Margin     │       │
│  │ Revenue    │            │            │            │       │
│  │ $41,800    │ 11         │ $52,100    │ 23.1%      │       │ ← updated
│  │ ↑ 12% ↑    │ ↓ 1 ↓      │ ↑ 14% ↑    │ ↑ 0.7pp ↑  │       │
│  └────────────┴────────────┴────────────┴────────────┘       │
│──────────────────────────────────────────────────────────────│
│  Today's Focus                          Work Queues          │
│  ┌────────────────────────┐  ┌────────────────────────────┐  │
│  │ 🔴 2 Overdue POs       │  │ 📥 Intake Ready:     5     │  │ ← updated!
│  │ 🟡 1 Approaching SLA   │  │ 📋 Pending Sales:    5     │  │
│  │ 🟢 8 On Track          │  │ 💰 Payments Due:     3     │  │
│  └────────────────────────┘  │ 🏷️  Unmatched Tags:  12    │  │
│                              │ 🚛 Pending Shipments: 2    │  │
│  Recent Activity             └────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 10:41 AM  PO #1043 verified — 20 items              │   │ ← new
│  │ 10:38 AM  PO #1044 verified — 6 items               │   │ ← new
│  │ 10:35 AM  PO #1042 verified — 12 items              │   │ ← new
│  │ 10:32 AM  PO #1042 finalized — $5,600               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Dashboard reloaded after navigation.
#### User Action
- (Automatic — dashboard re-fetches data on mount/re-focus.)
#### After State
- All dashboard widgets reflect current state. "Intake Ready: 5" shown (3 verified since last visit). KPIs updated (revenue, open POs, margin all recalculated). Recent Activity feed shows 3 new "verified" events. Last-updated timestamp refreshed to current time.
#### Interactive Elements, ARIA, Edge Cases
- Refresh: dashboard re-fetches on `visibilitychange` (tab refocus) and route navigation.
- Changed metrics: brief amber highlight animation on values that changed since last render (300ms).
- Edge case: Network error on re-fetch → stale data shown with banner "Data may be outdated. [Refresh now]".
- Edge case: Intake Ready goes to 0 → item stays visible but shows "Intake Ready: 0 — All caught up! 🎉" with green styling.

---

### UX Check

| Question | Answer |
|----------|--------|
| Does the flow require mode-switching? | No. Dashboard is the landing zone; clicking a Work Queue is a durable filter navigation to a real view, not a hidden mode change. |
| Is the operator ever shown irrelevant actions? | No. Quick Actions are the few high-frequency starting points; queue items with zero count gray out (`aria-disabled`) so no dead-end clicks. |
| Is context preserved if the operator leaves mid-flow? | Yes. Filter URLs (`/intake?status=ready`) are durable and shareable. Dashboard re-fetches on return and animates changed counts so the operator sees the impact of their work. |
| Mercury comparison | Mercury's home: greeting + balance card (the landing zone) + 4 quick actions + recent activity. Eye lands on the balance in 2 seconds. This flow targets the same 2-second time-to-orient via the KPI strip. |

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Empty queues stay visible with green ✓; zero-count items are disabled (no dead clicks) |
| UX-2 Supporting info one click away | ✅ | Activity feed details, queue contents, KPI breakdowns are all one click away via the linked view |
| UX-3 One primary surface per view | ✅ | KPI strip is the default landing zone; Focus + Queues are secondary, not 8 equal panels |
| UX-4 Bulk actions on selection only | N/A | Read-only summary surface |
| UX-5 Validation at point of impact | N/A | Read-only summary surface |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Quick Action "+ New …" opens authoring slide-over, not a modal |
| UX-7 Mode is always visible | ✅ | "Dashboard" is the current view throughout; date and greeting orient the operator |
| UX-8 State changes resolve in place | ✅ | Polling and re-focus refresh update counts in place with brief amber highlight |
| UX-9 Filtering fluid; navigation durable | ✅ | Queue links go to filter URLs that are durable and shareable |
| UX-10 Cell saves immediate; forms explicit | N/A | No edit surface |
| UX-11 URL is session memory | ✅ | Dashboard root URL is durable; activity tab encodes to hash |
| UX-12 Empty states give next step | ✅ | Zero queues → "All caught up ✓"; zero KPIs → "No data yet" tooltip on em-dash placeholder |
