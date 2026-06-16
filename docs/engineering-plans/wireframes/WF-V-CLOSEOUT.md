## Wireframe: WF-V-CLOSEOUT — CloseoutView

### UX Posture

Month-end at 4 PM. The four equal-weight panels are gone. Top-down attention flow is enforced visually: KPI line at the top, the closeouts table as the single primary surface, blockers expanded inline as the most prominent state when any exist. Adjustments and archive runs move into the closeout slide-over tabs. When blockers exist, the eye lands on them — when they don't, the screen stays calm.

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FilterToolbar                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ [+ New Close] │ Status ▾ │ Data views ▾ │ Period ▾ │ Entity ▾ │ Sort ▾  │ │
│ │               │ Export ▾                                                  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ [Status: In Review ×] [Period: May 2026 ×] [+ Add filter]                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                              KPI Line                                         │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 64 closeouts · $15.0M  ·  Open 12 · In Review 5 · Closed 47 · Variance  │ │
│ │ $12.4k                                              [Show breakdown ▾]   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│           Inline Blockers Strip (only when blockers exist)                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚠ 3 unsafe batches block May 2026 close.       [View in Intake →]       │ │
│ │   2 pending adjustments.                       [Review adjustments →]    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                          AG Grid (closeouts table)                            │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ ID       │ Period     │ Entity    │ Status  │ Total      │ Actions   │ │
│ │───┼──────────┼────────────┼───────────┼─────────┼────────────┼───────────│ │
│ │ ☐ │ CLO-0064 │ May 2026   │ AP        │In Review│ $892,450   │ [···]     │ │
│ │ ☐ │ CLO-0063 │ May 2026   │ AR        │In Review│ $1,234,100 │ [···]     │ │
│ │ ☐ │ CLO-0062 │ May 2026   │ Inventory │  Open   │ $3,456,200 │ [···]     │ │
│ │ ☐ │ CLO-0061 │ Apr 2026   │ AP        │ Closed  │ $789,300   │ [···]     │ │
│ │ ☐ │ CLO-0060 │ Apr 2026   │ AR        │ Closed  │ $1,102,500 │ [···]     │ │
│ │ ☐ │ CLO-0059 │ Apr 2026   │ Inventory │ Closed  │ $3,210,800 │ [···]     │ │
│ │ ☐ │ CLO-0058 │ Apr 2026   │ Banking   │ Closed  │ $2,450,000 │ [···]     │ │
│ │ ☐ │ CLO-0057 │ Mar 2026   │ AP        │ Closed  │ $765,000   │ [···]     │ │
│ │                  Page 1 of 8   [◀ ◀ 1 2 3 … 8 ▶ ▶]                       │ │
│ │                         (row height: 32px Mercury standard)              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│             BulkActionBar (appears only when rows selected)                   │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 2 selected • $890.4k  [Start Review] [Close Period] [More ▾]            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Detail Slide-over for a closeout period (opens on row click):
┌──────────────────────────────────────────────────────────────────────────────┐
│                  Slide-over (right, 420px standard)                           │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ CLO-0064 — May 2026 AP                                              [×] │ │
│ │ Status: [In Review ▾]       Period: May 2026                             │ │
│ │ Entity: Accounts Payable    Total: $892,450.00                           │ │
│ │ Opened: 06/01/26            Reviewer: Jane Smith                         │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ ┌─────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────┐               │ │
│ │ │ Summary │ │ Transactions │ │ Adjustments │ │ History  │               │ │
│ │ └─────────┘ └──────────────┘ └─────────────┘ └──────────┘               │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ ▼ Summary tab                                                            │ │
│ │ Opening Balance: $812,300     Inflows: $445,200                          │ │
│ │ Outflows: $365,050            Closing Balance: $892,450                  │ │
│ │ Variance: $0.00 ✓             Transactions: 1,247                        │ │
│ │ Adjustments: 3 pending        Flags: 0                                   │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ Footer actions (state-gated):                                            │ │
│ │   Open      → [Start Review]                                             │ │
│ │   In Review → [Apply Adjustments] [Close Period] [Cancel Review]         │ │
│ │   Closed    → [View Archive] [Reopen] (requires reason)                  │ │
│ │   Reopened  → [Close Again]                                              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### State-Gated Action Surface

| Closeout State | Visible Actions                                  |
|----------------|--------------------------------------------------|
| Open           | `Start Review`                                   |
| In Review      | `Apply Adjustments`, `Close Period`, `Cancel Review` |
| Closed         | `View Archive`, `Reopen` (requires reason)       |
| Reopened       | `Close Again`                                    |

### Dimensions

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| View container | 100% viewport | 100vh | flex column |
| FilterToolbar | 100% | 40px | horizontal menubar |
| ActiveFilterPills | 100% | 36px | flex-wrap |
| KPI line | 100% | 32px (collapsed) · ~96px (expanded) | px-4 |
| Inline blockers strip | 100% | 44px (per blocker line, when present) | absent when no blockers |
| AG Grid | 100% | flex-1 | virtual scrolling |
| Grid row | 100% | 32px | Mercury standard |
| Checkbox column | 48px | 32px | center aligned |
| BulkActionBar | 100% | 48px | sticky bottom, slide-up |
| Slide-over peek | 280px | 100% parent | default peek width |
| Slide-over standard | 420px | 100% parent | on expand click |
| Slide-over wide | 60% viewport | 100% parent | on drag |

### Interactive Elements

- **[+ New Close] button**: Opens period close creation in a slide-over: select period (month/year), select entity, auto-calculates balances from transactions.
- **Status ▾ pill**: Multi-select popover with status counts. When operator enters via blocker notification, pill pre-set to `In Review` and the offending row highlighted.
- **Period filter**: Dropdown with month/year picker or recent periods list.
- **KPI line**: Aggregates and counts. Click "Show breakdown ▾" for metric cards (Total Closed, Total In Review, Variance, Avg Days to Close).
- **Inline blockers strip**: Appears only when blockers exist. Each blocker shows a count + deep link into the source (intake, adjustments, etc.). Clicking [View in Intake →] opens IntakeView with a tight filter that shows exactly the 3 unsafe batches.
- **Status cell (ComboboxCellEditor)**: Double-click for valid transitions. `Closed` status requires confirmation modal: "Closing this period is permanent. Continue?" (UX-6).
- **Period cell**: Click filters to that period.
- **Entity cell**: Chip (AP, AR, Inventory, Banking, Payroll, GL).
- **Total cell**: Right-aligned currency; clickable to expand breakdown.
- **Row click**: Opens slide-over at peek (280px).
- **Slide-over Summary tab**: Period balance summary, transaction count, adjustment count, flags.
- **Slide-over Transactions tab**: Filtered list of all transactions in period; mini-grid with type, date, amount, reference.
- **Slide-over Adjustments tab**: List of adjustments with type (Accrual, Deferral, Correction), amount, status (Pending, Applied), date; `[+ New Adjustment]` button.
- **Slide-over History tab**: Audit trail of status changes, review actions, adjustments applied.
- **BulkActionBar buttons**: Start Review (batch), Close Period (batch with confirmation), Export, More ▾ (Reopen, Add Adjustment, Assign Reviewer). Only intersection of valid actions.

### States Shown

- **Empty state**: "No closeout periods found" + "Clear filters" or "No periods closed yet — start your first month-end close" + `[+ New Close]`.
- **Default arrival (no blockers)**: Inline blockers strip absent. KPI line and closeouts table visible. Calm.
- **Default arrival (blockers exist)**: Inline blockers strip prominent at top with the count + deep links. Eye lands here naturally. After blockers cleared, strip dismisses.
- **Loading state**: 8 skeleton rows.
- **Error state**: Banner with retry.
- **Filter active**: ActiveFilterPills visible.
- **Row selected**: Highlight + checkbox; BulkActionBar slides up.
- **Open closeout**: Info-blue status; editable; can start review.
- **In Review closeout**: Warning-yellow; reviewer name visible; adjustments addable; transactions locked.
- **Closed closeout**: Success green with lock; all fields read-only.
- **Reopened closeout**: Purple; previously closed now editable; audit trail shows reopen reason.
- **Variance non-zero**: Total cell shows variance amount in parentheses; Variance KPI card highlighted; adjustments tab shows pending items.
- **Period with flags**: Row shows flag indicator with count.
- **Review in progress by another user**: Row shows "Reviewing — Jane Smith" with user avatar; non-editable except by reviewer.
- **Row editing**: Combobox for status; confirmation for close.
- **Row saving**: Spinner; non-interactive.
- **Bulk close**: Modal confirmation: "Close 3 periods? This action is permanent and will lock all transactions. [Close Notes…] [Cancel] [Close Periods]"
- **Bulk action in progress**: "Starting review on 2 periods…"; buttons disabled.
- **Bulk action complete**: Toast; refresh.
- **Slide-over open**: Grid narrows; keyboard trapped.

### ARIA Annotations

- **FilterToolbar**: `role="menubar"`, `aria-label="Filter and view options"`
- **Status ▾ pill**: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by closeout status"`, `aria-multiselectable="true"`
- **ActiveFilterPills**: `role="list"`, `aria-label="Active filters"`
- **KPI line**: `role="status"`, `aria-live="polite"`, `aria-label="64 closeouts, $15.0M. Open 12, In Review 5, Closed 47, Variance $12.4k."`
- **Inline blockers strip**: `role="alert"`, `aria-live="polite"`. Each blocker link: `aria-label="View 3 unsafe batches in Intake"`
- **AG Grid**: `role="grid"`, `aria-label="Closeout period records"`, `aria-multiselectable="true"`
- **Status cell (editable)**: `role="combobox"`, `aria-label="Status for CLO-0064"`
- **Locked row (Closed)**: `aria-readonly="true"` on all cells; `aria-label="CLO-0061 — Closed — read only"`
- **BulkActionBar**: `role="toolbar"`, `aria-label="Bulk actions — 2 selected"`
- **Slide-over**: `role="dialog"`, `aria-label="Closeout CLO-0064 details"`
- **DetailTabBar**: `role="tablist"`, `aria-label="Closeout detail sections"`
- **Summary balances**: `role="region"`, `aria-label="Period balance summary"`
- **Close confirmation dialog**: `role="alertdialog"`, `aria-label="Close period — permanent action"`, `aria-modal="true"`
- **Toast**: `role="alert"`, `aria-live="assertive"`

### Edge Cases Handled

- **No closeouts at all**: Full-page empty; CTA to start first month-end close; summary/tabs hidden.
- **All periods closed**: Normal view; Open/In Review counts 0; Closed pre-selected; all rows locked.
- **Period with zero transactions**: Total $0.00; Summary shows all zeros; variance $0.00 ✓; closeable normally.
- **Period spanning multiple entities**: Grid shows one row per entity-period combination.
- **Negative total (net outflow)**: Total displayed in parentheses; variance calculation still works.
- **Reopening a closed period**: Modal confirmation: "Reopening May 2026 AP will unlock all transactions. Reason for reopening (required) [text]. [Cancel] [Reopen]." Audit trail records.
- **Closing with unresolved adjustments**: Modal warning: "3 adjustments are still pending. Close anyway? [Review adjustments] [Close anyway] [Cancel]"
- **Closing with non-zero variance**: Modal warning: "Period has $12,400 variance. Close anyway? [Review variance] [Force close] [Cancel]". Force close requires note.
- **Concurrent close**: If another user closes while reviewing, toast: "Period was closed by [user]. Refreshing." Page refreshes.
- **Reviewer assignment**: Detail shows current reviewer; `[Assign Reviewer]` available; bulk assign available.
- **Transaction from closed period**: Source transaction detail view shows "Period closed — read only" banner; edit disabled.
- **Adjustment dependencies**: If Adjustment A offsets Adjustment B, both must be applied together; validation on close.
- **Month-end workload**: If many periods open for same month, summary shows "Month-end status: 4 of 5 entities closed, AP still in review."
- **Historical close data**: Filters by period allow historical lookback.
- **Large dataset**: Virtual scrolling; pre-computed summary; period filter groups by year.
- **Rapid filter changes**: 300ms debounce.
- **Browser back**: Closes slide-over; restores state.
- **Keyboard**: Arrow keys; F2 edit; Enter detail; Tab cycle; Escape close.
- **Screen reader**: "5 periods in review totaling $892k" on filter.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Closeout actions filtered by state (Start Review only on Open; Close Period only on In Review; Reopen only on Closed). |
| UX-2: Supporting info one click away, never zero | ✓ | Adjustments and Archive runs as slide-over tabs. Blocker drilldown is one click. |
| UX-3: One primary surface per view | ✓ | Closeouts table is the single primary surface. Blockers appear inline only when present. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only when rows selected. |
| UX-5: Validation errors at point of impact | ✓ | Blockers strip appears inline above the table, only when blockers exist. No permanent panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | Closeout detail and new closeout in slide-overs. Modals reserved for destructive operations (Close, Reopen, Force close). |
| UX-7: System never hides what mode the operator is in | ✓ | Active filter pills, slide-over header, status badges. |
| UX-8: State changes resolve in place | ✓ | Status transitions update the row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill is fluid filter; sidebar nav is durable. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status edits save. New Adjustment form has explicit Apply. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over period ID encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | Empty → `+ New Close`. Empty filtered → `Clear filters`. |
