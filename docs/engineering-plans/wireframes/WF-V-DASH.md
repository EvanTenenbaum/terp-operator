## Wireframe: WF-V-DASH — DashboardView (DashboardView)

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                             Welcome Header                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Welcome, Jane                                                           │ │
│ │  Tuesday, June 15, 2026  ·  8:42 AM                                      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                           Quick Action Buttons                                │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │ │
│ │  │ New Sale  │  │  New PO   │  │  Intake   │  │ Payment   │            │ │
│ │  └───────────┘  └───────────┘  └───────────┘  └───────────┘            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                               KPI Metric Strip                                │
│ ┌────────────┬──────────────┬──────────────┬─────────────┬────────────────┐ │
│ │ Active     │ Pending      │ Unfilled     │ Payments    │ Credit Watch   │ │
│ │ Orders     │ Intake       │ Drafts       │ Due         │                │ │
│ │            │              │              │             │                │ │
│ │    12      │      8       │      5       │     $24.5k  │      2 ⚠      │ │
│ │  ↑ 3 today │  ↓ 2 from    │  → no change │  3 invoices │  Acme,        │ │
│ │            │  yesterday   │              │             │  MetroFresh    │ │
│ └────────────┴──────────────┴──────────────┴─────────────┴────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                          Two-Column Content Area                              │
│ ┌───────────────────────────────────┬─────────────────────────────────────┐  │
│ │         Today Focus               │           Work Queues               │  │
│ │ ┌────────────────────────────────┐│ ┌─────────────────────────────────┐ │  │
│ │ │ ● 5 orders confirmed today     ││ │ Intake Ready                    │ │  │
│ │ │   [$32,400 across 3 customers] ││ │ ┌───────────────────────────┐   │ │  │
│ │ │                                ││ │ │ 8 POs · 42 batches         │   │ │  │
│ │ │ ● 3 POs ordered today          ││ │ │ [View Intake →]            │   │ │  │
│ │ │   [$18,700 — 2 vendors]        ││ │ └───────────────────────────┘   │ │  │
│ │ │                                ││ │                                  │ │  │
│ │ │ ● 2 payments pending review    ││ │ Payments Pending                │ │  │
│ │ │   [$8,200 — Acme Corp]         ││ │ ┌───────────────────────────┐   │ │  │
│ │ │                                ││ │ │ 3 invoices · $12,400       │   │ │  │
│ │ │ ● 1 credit alert               ││ │ │ [Review Payments →]        │   │ │  │
│ │ │   [Acme Corp — review]         ││ │ └───────────────────────────┘   │ │  │
│ │ └────────────────────────────────┘│ │                                  │ │  │
│ │                                   │ │ Fulfillment Queue               │ │  │
│ │                                   │ │ ┌───────────────────────────┐   │ │  │
│ │                                   │ │ │ 7 orders · 112 items       │   │ │  │
│ │                                   │ │ │ [View Fulfillment →]       │   │ │  │
│ │                                   │ │ └───────────────────────────┘   │ │  │
│ │                                   │ │                                  │ │  │
│ │                                   │ │ Draft Orders                    │ │  │
│ │                                   │ │ ┌───────────────────────────┐   │ │  │
│ │                                   │ │ │ 5 drafts · $17,300         │   │ │  │
│ │                                   │ │ │ [View Drafts →]            │   │ │  │
│ │                                   │ │ └───────────────────────────┘   │ │  │
│ │                                   │ └─────────────────────────────────┘ │  │
│ └───────────────────────────────────┴─────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│                              Activity Feed                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ┌─────────────┐  ┌────────────────┐  ┌───────────────┐                 │ │
│ │  │ My Drafts   │  │ Recent Activity│  │ Credit Watch  │                 │ │
│ │  └─────────────┘  └────────────────┘  └───────────────┘                 │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▼ My Drafts tab (active)                                                 │ │
│ │  ┌──────────┬─────────────┬──────────┬──────────┬──────────────────────┐ │ │
│ │  │ Type     │ Reference   │ Customer │ Total    │ Action               │ │ │
│ │  ├──────────┼─────────────┼──────────┼──────────┼──────────────────────┤ │ │
│ │  │ SO Draft │ SO-2048     │Acme Corp │ $12,050  │ [Continue Editing]   │ │ │
│ │  ├──────────┼─────────────┼──────────┼──────────┼──────────────────────┤ │ │
│ │  │ PO Draft │ PO-1012     │Acme Corp │ $18,200  │ [Continue Editing]   │ │ │
│ │  ├──────────┼─────────────┼──────────┼──────────┼──────────────────────┤ │ │
│ │  │ SO Draft │ SO-2050     │MetroMart │ $3,800   │ [Continue Editing]   │ │ │
│ │  ├──────────┼─────────────┼──────────┼──────────┼──────────────────────┤ │ │
│ │  │ PO Draft │ PO-1015     │GlobalFood│ $6,200   │ [Continue Editing]   │ │ │
│ │  └──────────┴─────────────┴──────────┴──────────┴──────────────────────┘ │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▶ Recent Activity tab                                                    │ │
│ │  (collapsed — shows latest events: order confirmed, PO received, etc.)    │ │
│ │  ─────────────────────────────────────────────────────────────────────────│ │
│ │  ▶ Credit Watch tab                                                       │ │
│ │  (collapsed — shows customers approaching or over credit limits)          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Element | Measurement |
|---------|-------------|
| Page max-width | 1200px centered |
| Welcome header height | 64px |
| Quick action buttons | 48px height, 140px width each |
| Quick action button gap | 12px |
| KPI strip height | 100px |
| KPI card width | Equal distribution (5 across = ~220px each) |
| KPI card gap | 12px |
| Two-column area | Left column 55%, Right column 45% |
| Two-column gap | 20px |
| Today Focus section min-height | 280px |
| Work Queue card height | 64px (collapsed) |
| Work Queue card gap | 8px |
| Activity Feed tab bar height | 40px |
| Activity Feed table min-height | 200px |
| Font | Inter 13px, line-height 1.4 |
| Dashboard vertical padding | 24px top/bottom, 32px left/right |
| Section header font | Inter 14px, weight 600 |
| KPI value font | Inter 28px, weight 700 |
| KPI label font | Inter 12px, weight 500, uppercase, letter-spacing 0.5px |

### Interactive Elements

- **Welcome Header**: Greeting with user's first name. Current date and time auto-updating every minute.
- **Quick Action Buttons**: 
  - [New Sale]: Opens new sales order authoring slide-over (420px). Pre-fills with today's date. 
  - [New PO]: Opens new purchase order authoring slide-over (420px). 
  - [Intake]: Navigates to IntakeView with "Ready" filter pre-applied.
  - [Payment]: Navigates to PaymentsView with "Pending" filter pre-applied.
  - Each button shows a subtle icon alongside text. Hover shows 2px elevation lift. Click triggers loading state before navigation/slideover.
- **KPI Metric Strip**: 
  - Five metric cards arranged horizontally. 
  - Each card shows: icon, metric label, large numeric value, and trend indicator (↑/↓/→ with description).
  - Active Orders: Count of confirmed + posted orders. Trend shows orders confirmed today.
  - Pending Intake: Count of POs awaiting intake. Trend vs yesterday.
  - Unfilled Drafts: Count of draft orders. Trend vs last check.
  - Payments Due: Dollar value of outstanding invoices. Count of invoices.
  - Credit Watch: Count of customers over/near credit limit. Warn icon (⚠) for any > 0. Shows customer names.
  - Clicking a KPI card navigates to the relevant view with appropriate filter (e.g., click "Pending Intake" → IntakeView filtered to Ready).
  - KPIs refresh on page load and periodically (every 5 min) via polling.
- **Today Focus (left column)**: 
  - Curated list of actionable items for the current day.
  - Each item has a bullet indicator, description, bracketed detail, and optional inline action link.
  - "5 orders confirmed today" — shows count, total value, customer count. Click navigates to Sales view filtered to confirmed + today.
  - "3 POs ordered today" — shows count, value, vendor count. Click navigates to PO view filtered to ordered + today.
  - "2 payments pending review" — shows count, value, customer. Click navigates to Payments view.
  - "1 credit alert" — highlighted item. Shows customer name and "review" link. Click opens customer credit detail.
  - Items update based on real-time data. Empty state: "No activity yet today."
- **Work Queues (right column)**:
  - Stacked queue cards, each showing queue name, count summary, and "View →" link.
  - Intake Ready: Shows PO count + batch count. Click navigates to IntakeView (Ready filter).
  - Payments Pending: Shows invoice count + total. Click navigates to PaymentsView (Pending filter).
  - Fulfillment Queue: Shows order count + item count. Click navigates to FulfillmentView.
  - Draft Orders: Shows draft count + total value. Click navigates to SalesView (Draft filter).
  - Queue cards show subtle color indicators (semantic CSS classes, not hex).
- **Activity Feed**:
  - Three-tab section: My Drafts, Recent Activity, Credit Watch.
  - **My Drafts tab**: Table of all draft orders (SO and PO) assigned to or created by current user. Columns: Type (with icon), Reference number, Customer/Vendor, Total, Action button. "Continue Editing" button opens the draft in authoring slide-over.
  - **Recent Activity tab**: Chronological feed of system events. Shows: timestamp, event type icon, description, reference link. Events include: order confirmed, PO received, batch verified, payment posted, customer added. "View all activity →" link at bottom.
  - **Credit Watch tab**: Table of customers with credit concerns. Columns: Customer, Credit Limit, Current Balance, % Used, Status indicator. Sorted by % used (highest first). "[Review]" action per row opens customer detail with credit tab focused.
  - Tab switching is instant (client-side). Active tab indicated by underline.
  - Section height accommodates ~4 rows visible; scrollable within section for more.
- **Dashboard refresh**: Manual refresh button in top-right corner. Auto-refresh via polling (configurable, default 5 min). Loading state shows skeleton cards.

### States Shown

- **Default (first load of day)**: Welcome header with current time. KPIs show current values. Today Focus populated with today's activity. Work Queues show current counts. My Drafts tab active in Activity Feed.
- **Loading state (initial)**: Skeleton placeholders for KPI cards, Today Focus items, Work Queue cards, Activity Feed rows. Welcome header and quick action buttons visible immediately.
- **Loading state (refresh)**: Subtle loading indicators on individual widgets. Not full-page skeleton. Previous data remains visible during refresh.
- **Empty state (new account, no data)**: Welcome header still shows. Quick action buttons prominent. KPIs all show "—" or 0 with "No data yet" subtitles. Today Focus: "Nothing yet! Start by creating your first sale or purchase order." Work Queues: all show "0" with "Get started →" links. Activity Feed: "No drafts yet. Create a sale or purchase order to see it here."
- **Credit Watch with 0 alerts**: Card shows "0" with green checkmark. No ⚠ icon. Subtitle: "All clear."
- **Credit Watch with 3+ alerts**: Shows "3 ⚠" with first 2 customer names and "+1 more" indicator. Clicking card opens filtered view.
- **Error state (API failure)**: Per-widget error state with retry button. "Could not load dashboard data. [Retry]" Dashboard partially loads where possible.
- **Error state (complete failure)**: Full-page error with retry. Quick action buttons still functional (they navigate/create, not load-dependent).
- **Midnight rollover**: Date updates automatically. "Today" focus items reset to new day.
- **Very long customer names in Credit Watch**: Truncated with ellipsis at 120px. Full name in tooltip.

### ARIA Annotations

- **Page header**: `role="banner"`, `aria-label="Dashboard"`
- **Welcome message**: `role="heading"`, `aria-level="1"`, `aria-label="Welcome, Jane"`
- **Date/time display**: `role="timer"`, `aria-live="off"`, `aria-label="Current date and time"`
- **Quick action buttons**: `role="group"`, `aria-label="Quick actions"`
- **[New Sale] button**: `role="button"`, `aria-label="Create new sale"`
- **[New PO] button**: `role="button"`, `aria-label="Create new purchase order"`
- **[Intake] button**: `role="button"`, `aria-label="Go to intake"`
- **[Payment] button**: `role="button"`, `aria-label="Go to payments"`
- **KPI strip**: `role="region"`, `aria-label="Key performance indicators"`, `aria-live="polite"`
- **KPI card (Active Orders)**: `role="button"`, `aria-label="Active orders: 12, 3 new today. Click to view all active orders."`, `tabindex="0"`
- **KPI card (Pending Intake)**: `role="button"`, `aria-label="Pending intake: 8 purchase orders, down 2 from yesterday. Click to view intake."`
- **KPI card (Unfilled Drafts)**: `role="button"`, `aria-label="Unfilled drafts: 5, no change. Click to view drafts."`
- **KPI card (Payments Due)**: `role="button"`, `aria-label="Payments due: 24,500 dollars across 3 invoices. Click to view payments."`
- **KPI card (Credit Watch)**: `role="button"`, `aria-label="Credit watch: 2 alerts — Acme Corp, MetroFresh. Click to review."`
- **KPI trend indicators**: `aria-label="Trend: up 3 from yesterday"` or `"Trend: down 2 from yesterday"` or `"Trend: no change"`
- **Today Focus**: `role="region"`, `aria-label="Today's focus items"`, `aria-live="polite"`
- **Today Focus items**: `role="list"`. Each item: `role="listitem"`
- **Work Queues**: `role="region"`, `aria-label="Work queues"`
- **Work Queue cards**: `role="list"`. Each card: `role="listitem"`, `role="link"` (or contains link), `aria-label="[Queue name]: [count] [description]. Click to view."`
- **Activity Feed**: `role="region"`, `aria-label="Activity feed"`
- **Activity Feed tabs**: `role="tablist"`, `aria-label="Activity feed sections"`
- **Activity Feed tab panels**: `role="tabpanel"`, `aria-label="[Tab name]"`
- **My Drafts table**: `role="table"`, `aria-label="My draft orders"`
- **"Continue Editing" buttons**: `role="button"`, `aria-label="Continue editing [type] [reference]"`
- **Recent Activity list**: `role="list"`, `aria-label="Recent activity"`
- **Credit Watch table**: `role="table"`, `aria-label="Credit watch alerts"`
- **Credit Watch status indicators**: `aria-label="Credit usage: 92 percent — warning"`
- **"View all activity" link**: `role="link"`, `aria-label="View all recent activity"`
- **Dashboard refresh button**: `role="button"`, `aria-label="Refresh dashboard data"`
- **Skeleton loading placeholders**: `aria-busy="true"`, `aria-label="Loading [section name]"`
- **Error state**: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **User with no assigned drafts but drafts exist**: "My Drafts" tab shows empty: "You have no draft orders. [View all team drafts →]."
- **User with very many drafts (50+)**: Table scrolls within section (max 300px height). "View all (50) →" link at bottom navigates to filtered Sales view.
- **Credit Watch with zero alerts**: Tab still shows but content is "All customers within credit limits. ✓" with green indicator. No table rendered.
- **Recent Activity with no events**: "No recent activity. Activity will appear here as orders are processed."
- **Dashboard accessed at midnight with stale "yesterday" data**: Date display updates. KPI trend comparisons recalculate against new day's baseline.
- **Rapid KPI updates (real-time polling)**: Smooth value transitions (CSS transitions on numeric values). No jarring jumps. Values animate on change.
- **Quick action button clicked while slide-over already open**: Existing slide-over closes, new one opens. No stacking.
- **KPI card clicked while data is stale**: Triggers immediate refresh of that view's data before navigation.
- **Browser window narrows (<900px)**: Two-column layout stacks vertically. KPI cards wrap to 2 rows (3+2). Quick action buttons wrap.
- **Browser window very narrow (<600px)**: KPI cards stack vertically. Quick action buttons full-width. Activity feed tabs become horizontal scroll. Single column layout throughout.
- **Accessibility: reduced motion preference**: All transitions and value animations disabled. Instant state changes.
- **Accessibility: screen reader announcement on refresh**: `aria-live="polite"` region announces "Dashboard updated" after refresh completes.
- **Session timeout while on dashboard**: Inline notification appears: "Your session has expired. [Sign in again]." Dashboard data hidden. Quick actions disabled.
- **Real-time data conflict (another user modifies an order shown in "My Drafts")**: Row updates or disappears in real-time. Subtle highlight animation on changed rows.
