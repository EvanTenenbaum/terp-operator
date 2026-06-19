# Wireframe: WF-V-CREDIT — CreditReviewView

**Template:** GridView
**Entity:** CreditReview
**Wireframe ID:** WF-V-CREDIT

---

### UX Posture

Managers' oversight loop. The credit reviews table is the only primary surface. The owner divergence panel is no longer permanently visible for owners — it collapses to a toggle in the FilterToolbar (`Show divergence ▾`) so an owner scanning the list pays zero attention tax for a view they want only when actively reviewing divergences.

---

## Full View — Default State (Manager arrives, no selection)

```
┌─FilterToolbar──────────────────────────────────────────────────────────────┐
│ [+ New Review] │ Status ▾ │ Data views ▾ │ Date ▾ │ Amount ▾ │ Group ▾ │  │
│                │ Sort ▾   │ Show divergence ▾ (owners only) │ Export ▾    │
└────────────────────────────────────────────────────────────────────────────┘
┌─KPI Line───────────────────────────────────────────────────────────────────┐
│ 89 reviews · 72 approved (81%) · $4.2M exposure · 14 high risk            │
│                                                       [Show breakdown ▾]   │
└────────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)──────────────────────────┐
│ ☐ │ ID        │ Customer           │ Limit       │ Balance    │ Risk      │ Status    │
├───┼───────────┼────────────────────┼─────────────┼────────────┼───────────┼───────────┤
│ ☐ │ CRD-0104  │ Acme Corporation   │ $500,000    │ $387,200   │ ● Medium  │ Pending   │
│   │           │                    │███████████████░░░░░░│ 65/100  │           │
│ ☐ │ CRD-0103  │ GlobalFresh Inc    │ $250,000    │ $241,800   │ ● High    │ Pending   │
│   │           │                    │███████████████████░░│ 78/100  │           │
│ ☑ │ CRD-0102  │ TerraFruits Co     │ $150,000    │ $72,400    │ ● Low     │ Approved  │
│   │           │                    │████████░░░░░░░░░░░░░│ 28/100  │           │
│ ☐ │ CRD-0101  │ BerryBest LLC      │ $200,000    │ $195,300   │ ● High    │ Rejected  │
│   │           │                    │███████████████████░░│ 82/100  │           │
│ ☐ │ CRD-0100  │ GreenValley Produce│ $100,000    │ $44,100    │ ● Low     │ Approved  │
│   │           │                    │█████░░░░░░░░░░░░░░░░│ 19/100  │           │
│ ☐ │ CRD-0099  │ OrganicTrade USA   │ $300,000    │ $156,800   │ ● Medium  │ Pending   │
│   │           │                    │████████████░░░░░░░░░│ 52/100  │           │
│ ☐ │ CRD-0098  │ PacificAg Supply   │ $75,000     │ $12,300    │ ● Low     │ Approved  │
│   │           │                    │██░░░░░░░░░░░░░░░░░░░│ 8/100   │           │
└───┴───────────┴────────────────────┴─────────────┴────────────┴───────────┴───────────┘
┌─BulkActionBar (appears only when rows selected)────────────────────────────┐
│ 1 review selected · CRD-0102                                                │
│ [Approve Credit] [Request More Info] [Reject] [Escalate]                    │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Detail Slide-over — Risk Factors Tab (420px standard)

```
┌──────────────────────────────────────────────────────┐
│ CRD-0103 — GlobalFresh Inc                       [×] │
│ Limit: $250,000  Balance: $241,800 (97%)             │
│ Risk: ● High · 78/100                                │
│ ─────────────────────────────────────────────────── │
│ ┌─────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐    │
│ │ Fin Hst │ │ Orders │ │ Risk Fac │ │ Decision │    │
│ └─────────┘ └────────┘ └──────────┘ └──────────┘    │
│ ─────────────────────────────────────────────────── │
│ ▼ Risk Factors tab                                   │
│ ⚠ Utilization     97%   25pts ████████████          │
│ ⚠ Late Payments    3    18pts █████████░░░          │
│ ✓ Payment History  2yr   0pts ░░░░░░░░░░░░          │
│ ⚠ DSO Trend       +15d  20pts ██████████░░          │
│ ⚠ Industry Risk   Medium 15pts ███████░░░░░          │
│ ─────────────────────────────────────────────────── │
│ Total: 78/100 ● High Risk                            │
│ Footer actions (state-gated):                        │
│   Pending  → [Approve] [Reject] [Request Info]       │
│   Approved → [Re-review] [View Orders]               │
│   Rejected → [Reconsider]                            │
└──────────────────────────────────────────────────────┘
```

---

## Owner Divergence View (toggle, not permanent)

When an owner clicks `Show divergence ▾` in the FilterToolbar, a slide-over opens with the divergence comparison. Closing returns the operator to the calm primary table — no residual real estate.

```
┌─Slide-over: Divergence view (owner-only)────────────────────────┐
│ Owner Divergence — Credit Decisions                       [×]  │
│ ─────────────────────────────────────────────────────────────── │
│ Filter: System recommendation ≠ Operator decision                │
│ 7 reviews diverge from system recommendation                    │
│ ─────────────────────────────────────────────────────────────── │
│ Customer        │ System │ Operator │ Reason            │ Reviewer│
│ Acme Corp       │ Reject │ Approve  │ Long relationship │ Jane S. │
│ GlobalFresh     │ Approve│ Reject   │ New CFO concern   │ Bob M.  │
│ ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

### State-Gated Action Surface

| Review State    | Visible Actions                              |
|-----------------|----------------------------------------------|
| Pending         | `Approve Credit`, `Request More Info`, `Reject`, `Escalate` |
| Info Requested  | `Approve Credit`, `Reject`, `Cancel Request` |
| Approved        | `Re-review`, `View Orders`, `Reduce Limit` (with approval) |
| Rejected        | `Reconsider`                                 |

---

## Dimensions

- View container: 100vw × 100vh
- FilterToolbar: 44px tall (plus 32px active filter pill row when active)
- KPI line: 32px collapsed · ~96px expanded breakdown
- AG Grid: 32px row height; ID column 110px; Customer column 200px; Limit column 130px; Balance column 130px; Risk column 150px (dot + score + bar); Status column 110px
- Risk mini bar: 4px tall, full cell width, 10 segments
- Utilization bar: 8px tall, inline below limit/balance, 10 segments
- Risk Factors list: 32px per factor row; Score bar 120px wide, 6px tall
- BulkActionBar: 52px tall
- Slide-over: Peek 280px → Standard 420px → Wide 60vw
- Font: Inter 13px body, 11px secondary, 14px header

---

## Interactive Elements

- **[+ New Review] button**: Opens review creation as a slide-over. Customer lookup auto-populates financial data.
- **Status ▾ pill**: Multi-select with `Pending (12)`, `Approved (72)`, `Rejected (5)`, `Info Requested`. Encodes to URL.
- **Show divergence ▾ (owner-only)**: Opens the divergence slide-over. Hidden entirely for non-owners (UX-7: role context drives surface visibility).
- **Risk Score inline bar**: Hover → tooltip with factor breakdown (top 3 contributors). Click → opens slide-over to Risk Factors tab.
- **Utilization bar**: Hover → tooltip "$387,200 of $500,000 (77.4%)." Color-coded.
- **Status cell**: Double-click → ComboboxCellEditor (Pending Review / Approved / Rejected / Info Requested).
- **Row click**: Single-click → slide-over peek. Double-click → standard.
- **BulkActionBar — Approve Credit**: Executes credit decision. Updates status. Creates approval record.
- **BulkActionBar — Request More Info**: Moves to "Info Requested" sub-status. Sends notification.
- **BulkActionBar — Escalate**: Flags for senior review. Adds "Escalated" tag.
- **Risk Factors tab**: Interactive breakdown. Click factor row → highlights contributing data in other tabs.
- **Financial History tab**: Sortable by date/amount. Filter by on-time/late.
- **Decision tab**: Approval/rejection rationale, free-text notes from reviewer.
- **Credit limit adjustment**: Inline edit on limit cell (admin only). Triggers re-review workflow.

---

## States Shown

- **Default (manager arrives)**: All reviews visible. Risk score bars color-coded. KPI line above. Owner divergence collapsed.
- **High-risk filter active**: Status ▾ pill set to filter for high-risk. KPI line "14 high risk" highlighted.
- **Review approved**: Success state flash. Status updates. Slide-over shows approval details.
- **Review rejected**: Error state flash. Reason captured in Decision tab.
- **Info requested**: Warning badge "Info Requested." Paused indicator.
- **Empty state**: "All reviews complete" with last review date. "See past reviews" link.
- **Loading**: Skeleton rows with pulsing bars.
- **Error state**: Failed credit check. Toast with retry.

---

## ARIA Annotations

- FilterToolbar: `role="menubar"`, `aria-label="Credit review filter toolbar"`
- Status ▾ pill: `role="combobox"`, `aria-haspopup="listbox"`, `aria-label="Filter by review status"`, `aria-multiselectable="true"`
- KPI line: `role="status"`, `aria-live="polite"`, `aria-label="89 reviews, 72 approved at 81 percent, $4.2 million exposure, 14 high risk"`
- Show divergence button (owner): `role="button"`, `aria-haspopup="dialog"`, `aria-label="Show owner divergence view"`
- Risk score cell: `role="meter"`, `aria-valuenow="78"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Risk score: 78 out of 100 — High risk"`
- Risk indicator dot: `aria-hidden="true"` (decorative)
- Utilization bar: `role="meter"`, `aria-valuenow="77"`, `aria-label="Credit utilization: 77 percent"`
- AG Grid: `role="grid"`, `aria-label="Credit reviews"`
- Status cell (editing): `role="combobox"`, `aria-haspopup="listbox"`
- Risk Factors tab: `role="tabpanel"`, `aria-label="Risk factors for GlobalFresh Inc"`
- Financial History tab: `role="tabpanel"`, `aria-label="Payment history"`
- BulkActionBar: `role="toolbar"`, `aria-label="Credit review actions"`
- Slide-over: `role="dialog"`, `aria-label="Credit review details"`

---

## Edge Cases Handled

- **Customer with no payment history**: "No payment history available — new customer." Risk defaults to Medium pending first review.
- **Credit limit exceeded (balance > limit)**: Balance shown in error state. Utilization bar at 100% + overflow indicator "▼$12,400 over limit."
- **Multiple open reviews for same customer**: Warning banner "2 open reviews for this customer." Link to other review.
- **Approved review, subsequent late payment**: "Review may be stale" badge. "Last approved Sep 2025, 3 late payments since." Re-review button.
- **Industry risk change**: If industry risk factor updates, affected reviews get "Risk Updated" badge.
- **Credit limit zero**: "No credit — prepay only" status. N/A for utilization. Risk set to Low (no exposure).
- **Concurrent review conflict**: If two reviewers approve same review, second gets toast: "Already approved by [Reviewer] at [time]."
- **Risk score recalculation**: Score shown as "Recalculating..." with pulse animation when underlying data changes.
- **Large customer with many orders**: Orders tab paginates (50 per page).

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Approve absent on Approved; Reconsider only on Rejected; Reduce Limit only on Approved with admin permission. |
| UX-2: Supporting info one click away, never zero | ✓ | Risk Factors, Financial History, Decision as slide-over tabs. Owner divergence as toggle, not permanent. |
| UX-3: One primary surface per view | ✓ | Credit reviews table is the only primary surface. Owner divergence view is a slide-over. |
| UX-4: Bulk actions appear only on selection | ✓ | BulkActionBar slides up only on selection. |
| UX-5: Validation errors at point of impact | ✓ | Conflict toasts at the row. No permanent error panel. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | New Review, Risk Factors detail in slide-overs. Re-review modal for destructive override. |
| UX-7: System never hides what mode the operator is in | ✓ | Owner role drives divergence toggle visibility. Active filter pills. Status badges. |
| UX-8: State changes resolve in place | ✓ | Approve/Reject updates the row inline. |
| UX-9: Filtering is fluid; navigation is durable | ✓ | Status ▾ pill fluid. Sidebar nav durable. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Status edits save. New Review form has explicit Submit. |
| UX-11: URL is the session memory | ✓ | Filters, slide-over review ID, and divergence toggle state encode into URL. |
| UX-12: Empty states give the operator a next step | ✓ | "All reviews complete" with link. Empty filtered → "Clear filters." |
