## Wireframe: WF-V-DASH — DashboardView (DashboardView)

### UX Posture

The morning ritual. Eight equally-weighted panels are gone. The dashboard now has three visual sections: Quick Actions, KPI Strip (the eye's default landing zone), and a two-column Focus + Pending Queues area, followed by a unified Activity Feed. The operator's eye lands on the KPI strip in under 2 seconds. Counts on queue cards are tight deep links that match exactly what the destination view shows when clicked.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                             Welcome strip                                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Welcome, Jane  ·  Tuesday, June 15, 2026 · 8:42 AM                       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                         Quick Action Buttons (4)                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐             │ │
│ │  │ New Sale  │  │  New PO   │  │  Intake   │  │ Payment   │             │ │
│ │  └───────────┘  └───────────┘  └───────────┘  └───────────┘             │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│              KPI Strip (4 cards, eye's default landing zone)                  │
│ ┌────────────┬──────────────┬──────────────┬─────────────────────────────┐ │
│ │ Active     │ Pending      │ Payments     │ Credit Watch                │ │
│ │ Orders     │ Intake       │ Due          │ (role-gated: managers only) │ │
│ │            │              │              │                             │ │
│ │    12      │      8       │     $24.5k   │      2 ⚠                    │ │
│ │  ↑ 3 today │  ↓ 2 / yest  │  3 invoices  │  Acme · MetroFresh          │ │
│ └────────────┴──────────────┴──────────────┴─────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│            Two-Column Content Area (Focus / Pending Queues)                   │
│ ┌───────────────────────────────────┬─────────────────────────────────────┐ │
│ │  Today Focus                      │  Pending Queues                     │ │
│ │ ┌──────────────────────────────┐ │ ┌─────────────────────────────────┐ │ │
│ │ │ ● 5 orders confirmed today    │ │ │ Intake Ready                    │ │ │
│ │ │   $32,400 across 3 customers  │ │ │ 8 POs · 42 batches    [View →] │ │ │
│ │ │   [Open in Sales]             │ │ │                                 │ │ │
│ │ │                               │ │ │ Payments Pending                │ │ │
│ │ │ ● 3 POs ordered today         │ │ │ 3 invoices · $12,400  [View →] │ │ │
│ │ │   $18,700 — 2 vendors         │ │ │                                 │ │ │
│ │ │   [Open in POs]               │ │ │ Fulfillment Queue               │ │ │
│ │ │                               │ │ │ 7 orders · 112 items  [View →] │ │ │
│ │ │ ● 2 payments pending review   │ │ │                                 │ │ │
│ │ │   $8,200 — Acme Corp          │ │ │ Draft Orders                    │ │ │
│ │ │   [Review payments]           │ │ │ 5 drafts · $17,300    [View →] │ │ │
│ │ │                               │ │ └─────────────────────────────────┘ │ │
│ │ │ ● 1 credit alert              │ │                                     │ │
│ │ │   Acme Corp — [Review]        │ │                                     │ │
│ │ └──────────────────────────────┘ │                                     │ │
│ └───────────────────────────────────┴─────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│             Unified Activity Feed (single section; tabs filter it)            │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ┌─────────────┐  ┌────────────────┐  ┌───────────────┐                 │ │
│ │  │ My Drafts   │  │ Recent Activity│  │ Credit Watch  │                 │ │
│ │  └─────────────┘  └────────────────┘  └───────────────┘                 │ │
│ │  ─────────────────────────────────────────────────────────────────────── │ │
│ │  ▼ My Drafts tab (default)                                               │ │
│ │  Type     │ Reference │ Customer │ Total    │ Action                    │ │
│ │  SO Draft │ SO-2048   │Acme Corp │ $12,050  │ [Continue Editing]        │ │
│ │  PO Draft │ PO-1012   │Acme Corp │ $18,200  │ [Continue Editing]        │ │
│ │  SO Draft │ SO-2050   │MetroMart │ $3,800   │ [Continue Editing]        │ │
│ │  PO Draft │ PO-1015   │GlobalFood│ $6,200   │ [Continue Editing]        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Element | Measurement |
|---------|-------------|
| Page max-width | 1200px centered |
| Welcome strip height | 40px |
| Quick action buttons | 48px height, 140px width each, 12px gap |
| KPI strip height | 100px |
| KPI card width | Equal distribution (4 across = ~280px each), 12px gap |
| Two-column area | Left 55%, Right 45%, 20px gap |
| Today Focus section min-height | 280px |
| Pending Queue card height | 64px each, 8px gap |
| Activity Feed tab bar height | 40px |
| Activity Feed table min-height | 200px |
| Font | Inter 13px body, 14px section headers (weight 600), 28px KPI values (weight 700), 12px KPI labels |
| Dashboard padding | 24px top/bottom, 32px left/right |

### Interactive Elements

- **Welcome strip**: Greeting with user's first name; current date and time auto-updating every minute. Compact single line — not a heavy header.
- **Quick Action Buttons (4 only — Sale, PO, Intake, Payment)**: 
  - [New Sale]: Opens new sales order authoring slide-over (URL `/sales?compose=new`).
  - [New PO]: Opens new purchase order authoring slide-over (URL `/purchase-orders?compose=new`).
  - [Intake]: Navigates to IntakeView with `Ready` filter pre-applied (deep link).
  - [Payment]: Navigates to PaymentsView with `Pending` filter pre-applied (deep link).
- **KPI Strip (4 cards — eye's default landing zone)**: 
  - Active Orders: Count of confirmed + posted orders. Trend = orders confirmed today.
  - Pending Intake: Count of POs awaiting intake. Trend vs yesterday.
  - Payments Due: Dollar value of outstanding invoices. Count of invoices.
  - Credit Watch: Count of customers over/near credit limit. **Role-gated — shown only to users with credit-review permissions.** Hidden for non-managers per UX-7.
  - Cards refresh on page load and every 5 minutes via polling.
  - Each card is a deep link to the relevant view with appropriate filter — **the click guarantees the destination matches the count** (UX-11).
- **Today Focus (left column, ~4 items)**: Curated actionable list. Each item shows count, dollar context, and a deep-link button. Click [Open in Sales] navigates to SalesView with exactly the filter that produced "5 orders confirmed today."
- **Pending Queues (right column, 4 cards)**: Compact queue cards with count + summary + deep link. The number on the dashboard equals the number the operator sees on the destination view after clicking — no re-filter needed.
- **Activity Feed (one section, three tabs)**:
  - **My Drafts** (default): Table of all draft orders. "Continue Editing" opens the draft in authoring slide-over on the relevant view, preserving URL state.
  - **Recent Activity**: Chronological feed (event type, timestamp, link).
  - **Credit Watch**: Table of customers near/over credit limits.
- **Dashboard refresh**: Manual refresh button. Auto-refresh every 5 min. Loading state uses subtle skeletons on individual widgets — never a full-page skeleton on refresh.

### States Shown

- **Default (first load of day)**: Welcome strip with date/time. KPI strip immediately visible (eye lands here). Today Focus and Pending Queues populated. Activity Feed defaults to My Drafts.
- **Initial loading state**: Skeleton placeholders on KPI cards, Today Focus items, Queue cards, Activity Feed rows. Welcome strip and quick actions visible immediately so the page never looks blank.
- **Refresh loading**: Per-widget loading indicators only. Previous data remains visible.
- **Empty state (new account)**: Quick action buttons prominent. KPIs show "—" with "No data yet" subtitles. Today Focus: "Nothing yet. Start by creating your first sale or purchase order." Each queue card shows 0 with "Get started →" link.
- **Credit Watch with 0 alerts**: Card shows "0 ✓" with subtle success color and subtitle "All clear."
- **Credit Watch with 3+ alerts**: Shows "3 ⚠" with first 2 customer names and "+1 more" indicator.
- **Error state (per-widget)**: Each widget shows its own retry — partial dashboards still useful.
- **Error state (complete failure)**: Full-page error with retry. Quick actions still functional.
- **Midnight rollover**: Date updates automatically. "Today" focus resets.
- **Real-time updates**: Smooth value transitions (CSS transitions). No jarring jumps.

### ARIA Annotations

- **Welcome strip**: `role="heading"`, `aria-level="1"`, `aria-label="Welcome, Jane"`
- **Date/time display**: `role="timer"`, `aria-live="off"`, `aria-label="Current date and time"`
- **Quick action buttons**: `role="group"`, `aria-label="Quick actions"`. Each: `role="button"`, `aria-label="..."`
- **KPI strip**: `role="region"`, `aria-label="Key performance indicators"`, `aria-live="polite"`
- **Each KPI card**: `role="button"`, `aria-label="Active orders: 12, 3 new today. Click to view all active orders."`, `tabindex="0"`
- **KPI trend indicators**: `aria-label="Trend: up 3 from yesterday"` / `"Trend: down 2 from yesterday"`
- **Today Focus**: `role="region"`, `aria-label="Today's focus items"`, `aria-live="polite"`
- **Today Focus items**: `role="list"`. Each item: `role="listitem"`
- **Pending Queues**: `role="region"`, `aria-label="Pending queues"`
- **Pending Queue cards**: `role="link"`, `aria-label="[Queue name]: [count] [description]. Click to view."`
- **Activity Feed**: `role="region"`, `aria-label="Activity feed"`
- **Activity Feed tabs**: `role="tablist"`, `aria-label="Activity feed sections"`
- **Activity Feed tab panels**: `role="tabpanel"`
- **"Continue Editing" buttons**: `role="button"`, `aria-label="Continue editing [type] [reference]"`
- **Dashboard refresh button**: `role="button"`, `aria-label="Refresh dashboard data"`
- **Skeleton loading placeholders**: `aria-busy="true"`, `aria-label="Loading [section name]"`
- **Error state**: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **User with no assigned drafts**: My Drafts tab shows "You have no draft orders. [View all team drafts →]"
- **User with very many drafts (50+)**: Table scrolls within section. "View all (50) →" link to filtered Sales view.
- **Credit Watch hidden for non-managers**: KPI strip becomes 3 cards instead of 4 (or a 4th card surfaces a different KPI relevant to operator role).
- **Credit Watch with zero alerts**: Card stays visible (zero is also information) with "All clear ✓".
- **Recent Activity with no events**: "No recent activity. Activity will appear here as orders are processed."
- **Dashboard accessed at midnight with stale "yesterday" data**: Date display updates. KPI trend comparisons recalculate against new day's baseline.
- **Queue count out of sync with destination view**: Should never happen — counts and destinations share the same query (UX-11). If a sync issue is detected, the dashboard shows a subtle "Refreshing counts…" indicator.
- **Quick action button clicked while slide-over already open**: Existing slide-over closes, new one opens. No stacking.
- **KPI card clicked while data is stale**: Triggers immediate refresh of that view's data before navigation.
- **Browser window narrows (<900px)**: Two-column layout stacks vertically. KPI cards wrap to 2 rows (2+2 not 3+1). Quick action buttons wrap.
- **Browser window very narrow (<600px)**: KPI cards stack vertically. Quick action buttons full-width. Activity Feed tabs become horizontal scroll. Single column throughout.
- **Reduced motion preference**: All transitions and value animations disabled.
- **Screen reader on refresh**: `aria-live="polite"` region announces "Dashboard updated."
- **Session timeout while on dashboard**: Inline notification: "Your session has expired. [Sign in again]." Dashboard data hidden. Quick actions disabled.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Queue card actions match queue state (no "Verify" on empty queue). |
| UX-2: Supporting info one click away, never zero | ✓ | Activity Feed is one click in (tabbed). Credit Watch role-gated. |
| UX-3: One primary surface per view | ✓ | KPI strip is the single primary surface (eye's landing zone). Three supporting sections below, not eight competing panels. |
| UX-4: Bulk actions appear only on selection | N/A | Dashboard is read-mostly; no bulk operations. |
| UX-5: Validation errors at point of impact | ✓ | Per-widget error states; no global validation panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Quick action buttons open slide-overs on destination views. |
| UX-7: System never hides what mode the operator is in | ✓ | Welcome strip and sidebar provide context. Role-gated cards only appear for those roles. |
| UX-8: State changes resolve in place | ✓ | Counts refresh in place. No navigation for refresh confirmations. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Activity Feed tabs are filters (no mode change). Queue/KPI clicks are deliberate navigation. |
| UX-10: Cell-level interactions save immediately | N/A | Dashboard is read-mostly; no cell editing. |
| UX-11: URL is the session memory | ✓ | Queue/KPI deep links carry tight filters; destination shows exactly what was clicked. |
| UX-12: Empty states give the operator a next step | ✓ | Empty Today Focus: "Start by creating your first sale." Empty My Drafts: "View all team drafts." Each KPI surfaces "Get started" for zero state. |
