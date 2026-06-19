## Wireframe: WF-V-CLIENTS — ClientsView

### UX Posture

The clients table is the only primary surface. Status filter is a pill in the FilterToolbar (no ViewTabBar). Credit status, balance, and last-order details are at the row; profile, orders, payments, and history live in the slide-over.

### Layout (ASCII)

```
┌─FilterToolbar──────────────────────────────────────────────────────────────┐
│  [+ Add Client ▾] │ Status ▾ │ Data views │ Keyword │ Credit │ Last Order │
│                   │ Sort ▾ │ Export ▾                                       │
│  [✕ credit:pending-review] [✕ status:past-due]                              │
├─KPI Line───────────────────────────────────────────────────────────────────┤
│  56 clients · 42 active · $87,500 total AR · 3 past due                    │
│                                                       [Show breakdown ▾]   │
├─AG Grid Table──────────────────────────────────────────────────────────────┤
│  ┌──────┬─────────┬────────────┬─────────────────┬───────┬──────────┬────┐│
│  │  ☐   │ ID      │ Name       │ Contact         │Balance│ Credit   │Last││
│  ├──────┼─────────┼────────────┼─────────────────┼───────┼──────────┼────┤│
│  │  ☐   │ CLT-319 │ Whole Foods │ buyer@wf.com    │$12,400│ Approved │6/15││
│  │  ☑   │ CLT-318 │ Kroger      │ ap@kroger.com   │ $5,200│ Approved │6/14││
│  │  ☑   │ CLT-317 │ Trader Joes │ orders@tjs.com  │ $8,800│ Pending  │6/12││
│  │  ☐   │ CLT-316 │ Publix      │ apricot@pub.com │$22,800│ Approved │6/10││
│  │  ☐   │ CLT-315 │ Safeway     │ buyer@safeway.. │     $0│ Inactive │3/02││
│  │  ☑   │ CLT-314 │ Costco      │ orders@costco.. │ $3,150│ Approved │6/11││
│  │  ☐   │ CLT-313 │ Walmart     │ acct@walmart..  │$15,300│ Past Due │6/08││
│  └──────┴─────────┴────────────┴─────────────────┴───────┴──────────┴────┘│
│                       (row height: 32px Mercury standard)                  │
├─BulkActionBar (appears only when rows selected)────────────────────────────┤
│  3 selected · $17,150 AR   [Email] [More ▾: Tag | Credit Review | Export] │
└────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over (right, 420px, opens on row click):
  Tabs: Profile | Orders | Payments | History
  Footer actions (state-gated):
    Active            → [Edit] [New Order] [Deactivate] [Credit Review]
    Past Due          → [Record Payment] [Place on Hold] [Credit Review]
    Credit Pending    → [Approve Credit] [Reject Credit] [Request More Info]
    Inactive          → [Reactivate]
    Suspended         → [Reactivate] (with approval)
```

### State-Gated Action Surface

| Client State    | Visible Actions                                          |
|-----------------|----------------------------------------------------------|
| Active          | `Edit`, `New Order`, `Deactivate`, `Credit Review`       |
| Past Due        | `Record Payment`, `Place on Hold`, `Credit Review`       |
| Credit Pending  | `Approve Credit`, `Reject Credit`, `Request More Info`   |
| Inactive        | `Reactivate`                                             |
| Suspended       | `Reactivate` (with approval)                             |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| FilterToolbar          | 100%            | 44px + 32px  | Menubar + active-chip row      |
| KPI line               | 100%            | 32px / ~96px expanded | Inter 13px |
| AG Grid Table          | 100%            | fills remain | Row height 32px                |
| BulkActionBar          | 100%            | 48px         | Slide-up, fixed bottom         |
| Slide-over             | 420px standard  | 100% vh      | 280px peek mode                |
| Credit Status cell     | —               | —            | Color badge encodes state      |

### Interactive Elements

- **[+ Add Client ▾]**: Split button — opens client creation slide-over; arrow opens "Add Client", "Import Clients", "Request Credit App".
- **Status ▾ pill**: Multi-select popover with `Active (42)`, `Past Due (3)`, `Inactive (11)`, `Suspended`. Replaces prior ViewTabBar.
- **Credit ▾ filter**: Approved, Pending Review, Denied, On Hold.
- **Last Order ▾**: Date range presets.
- **Credit Status cell**: Color badge — Approved (success), Pending (warning), Past Due/Denied (error), Inactive (neutral). Click opens slide-over Credit tab.
- **Balance cell**: Right-aligned; negative balances in error styling; Past Due in error text.
- **Client Name cell**: Click opens slide-over.
- **⋮ Actions**: State-gated context menu.
- **Slide-over tabs**: Profile, Orders, Payments, History.
- **BulkActionBar**: Intersection of valid actions only.

### States Shown

- **Default**: Clients table only. Status ▾ defaults to Active.
- **Past Due row**: Warning-state left border; balance in error styling; status badge.
- **Credit Pending row**: Warning-state left border; status badge.
- **Inactive row**: Slightly dimmed.
- **Bulk selected**: BulkActionBar slides up.
- **Slide-over peek (280px)**: ID, name, balance, credit status.
- **Slide-over open (420px)**: Full profile with tabs.
- **Credit near limit**: Balance bar > 80% warning; > 95% error.
- **Zero balance client**: Muted text "$0.00".
- **Negative balance (credit owed to client)**: Error styling with parentheses.
- **Export in progress**: Button shows spinner.
- **Error**: Toast.

### ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Clients filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by client status"`, `aria-multiselectable="true"`
- Active chip [✕]: `role="button"`, `aria-label="Remove filter"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="56 clients, 42 active, 87,500 dollars total AR, 3 past due"`
- AG Grid: `role="grid"`, `aria-label="Clients table"`, `aria-rowcount="56"`, `aria-multiselectable="true"`
- Credit Status cell: `role="gridcell"`, `aria-label="Credit status: Approved. Click for details."`
- Balance cell (Past Due): `role="gridcell"`, `aria-label="Balance $5,200, past due warning"`
- BulkActionBar: `role="toolbar"`, `aria-label="Bulk actions for 3 selected clients"`
- Slide-over: `role="dialog"`, `aria-label="Client CLT-318 Kroger details"`
- Slide-over tabs: `role="tablist"`, `aria-label="Client detail sections"`
- Credit utilization bar: `role="progressbar"`, `aria-valuenow="10"`, `aria-valuemax="100"`

### Edge Cases Handled

- **Zero results**: Empty state with "Clear filters".
- **Client with no orders**: Last Order shows "No orders".
- **Client with no email**: "Email" bulk action shows count of selected with email; clients without email get skipped with toast.
- **Past Due + Active orders**: Row shows error balance highlight AND status badge for orders.
- **Credit limit exceeded**: Balance > limit; error "Over Limit" badge; credit bar at 100% error.
- **Client merge**: "Merge Clients" bulk action opens merge wizard.
- **Client deactivation**: Modal warning "Deactivating will not cancel open orders."
- **Slide-over + bulk selection**: Both work independently.
- **Concurrent edits**: Optimistic update; rollback with toast.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Deactivate only Active; Reactivate only Inactive; Credit approve only Pending. |
| UX-2: Supporting info one click away, never zero | ✓ | Orders, Payments, History as slide-over tabs. |
| UX-3: One primary surface per view | ✓ | Clients table is the only primary surface. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Past due, credit pending at the row. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Client creation in slide-over. Deactivate modal. |
| UX-7: System never hides what mode the operator is in | ✓ | Filter pills, slide-over header, status badges. |
| UX-8: State changes resolve in place | ✓ | Status transitions inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill replaces tab bar. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Profile edits save. Credit review form explicit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → Add Client CTA. Empty filtered → Clear filters. |
