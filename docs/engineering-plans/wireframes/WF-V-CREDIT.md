# Wireframe: WF-V-CREDIT — CreditReviewView

**Template:** GridView
**Entity:** CreditReview
**Wireframe ID:** WF-V-CREDIT

---

## Full View — Default State (Tab: All, No Selection)

```
┌─View Header──────────────────────────────────────────────────────────────┐
│ Credit Review                                                  [New Review]│
└───────────────────────────────────────────────────────────────────────────┘
┌─FilterToolbar────────────────────────────────────────────────────────────┐
│ [▾ Data views]  │  Date ▾  │  Keyword ▾  │  Amount ▾  │ Group ▾  │ Sort ▾ │ ⬇ │
└───────────────────────────────────────────────────────────────────────────┘
┌─GridSummaryStrip─────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│ │ 89 Reviews   │ │ 72 Approved  │ │ $4.2M Total  │ │ 14 High      │      │
│ │    Total     │ │    81% Rate  │ │   Exposure   │ │   Risk       │      │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
┌─ViewTabBar───────────────────────────────────────────────────────────────┐
│  All (89) │ Pending Review (12) │ Approved (72) │ Rejected (5)            │
└───────────────────────────────────────────────────────────────────────────┘
┌─AG Grid (32px rows, checkboxes, sortable headers)────────────────────────┐
│ ☐ │ ID        │ Customer           │ Limit       │ Balance    │ Risk ▾    │ Status    │
├───┼───────────┼────────────────────┼─────────────┼────────────┼───────────┼───────────┤
│ ☐ │ CRD-0104  │ Acme Corporation   │ $500,000    │ $387,200   │ ● Medium  │ Pending   │
│   │           │                    │███████████████░░░░░░░│ 65/100    │           │
│ ☐ │ CRD-0103  │ GlobalFresh Inc    │ $250,000    │ $241,800   │ ● High    │ Pending   │
│   │           │                    │███████████████████░░░│ 78/100    │           │
│ ☑ │ CRD-0102  │ TerraFruits Co     │ $150,000    │ $72,400    │ ● Low     │ Approved  │
│   │           │                    │████████░░░░░░░░░░░░░░│ 28/100    │           │
│ ☐ │ CRD-0101  │ BerryBest LLC      │ $200,000    │ $195,300   │ ● High    │ Rejected  │
│   │           │                    │███████████████████░░░│ 82/100    │           │
│ ☐ │ CRD-0100  │ GreenValley Produce│ $100,000    │ $44,100    │ ● Low     │ Approved  │
│   │           │                    │█████░░░░░░░░░░░░░░░░░│ 19/100    │           │
│ ☐ │ CRD-0099  │ OrganicTrade USA   │ $300,000    │ $156,800   │ ● Medium  │ Pending   │
│   │           │                    │████████████░░░░░░░░░░│ 52/100    │           │
│ ☐ │ CRD-0098  │ PacificAg Supply   │ $75,000     │ $12,300    │ ● Low     │ Approved  │
│   │           │                    │██░░░░░░░░░░░░░░░░░░░░│ 8/100     │           │
└───┴───────────┴────────────────────┴─────────────┴────────────┴───────────┴───────────┘
┌─BulkActionBar (conditional)──────────────────────────────────────────────┐
│ 1 review selected                                                         │
│ [Approve Credit] [Request More Info] [Reject] [Escalate]                  │
└───────────────────────────────────────────────────────────────────────────┘
┌─DetailSlideover: Peek (280px)────────────────────────────────────────────┐
│ CRD-0102                                             ×                   │
│ TerraFruits Co                                                           │
│ Limit: $150,000 · Balance: $72,400                                       │
│ Utilization: 48%  ████████░░░░░░░░░░░░░░                                   │
│ Risk Score: 28/100 ● Low                                                 │
│ Status: Approved                                                         │
│ [Review Again] [View Orders]                                             │
│ ◀ drag                                                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Risk Score Visualization — Inline Cell Detail

```
│ ● High    │  ← Red indicator dot + label
│ 78/100    │  ← Numeric score
│████████░░ │  ← Mini bar: red≥70, amber≥40, green<40
```

- **Indicator dot color:** Green (0-39 Low), Amber (40-69 Medium), Red (70-100 High)
- **Mini bar:** 4px tall, full cell width. Segmented 10-block visualization. CSS background gradient by risk bracket.
- **ARIA:** role="meter", aria-valuenow="78", aria-valuemin="0", aria-valuemax="100"

---

## Credit Limit vs Balance Bar — Inline Visualization

```
│ $500,000    │ $387,200    │  ← Limit and Balance side by side
│███████████████░░░░░░░░░│  ← 10-block bar showing utilization
```
- Each `█` = 10% utilization. `░` = remaining.
- Color: Green ≤50%, Amber 51-80%, Red >80%.
- ARIA: role="meter", aria-valuenow="77", aria-label="Credit utilization: 77%"

---

## DetailSlideover: Standard (420px) — Risk Factors Tab

```
┌─Main Content (shifts left)───────────────────┬─DetailSlideover: Standard─┐
│                                               │ CRD-0103                   │
│  [Grid is narrower, fully functional]         │ GlobalFresh Inc            │
│                                               │ Limit: $250,000            │
│                                               │ Balance: $241,800 (97%)    │
│                                               │ Risk: ● High · 78/100      │
│                                               │ [Approve] [Reject] [Info]  │
│                                               │────────────────────────────│
│                                               │ Fin Hst│ Orders│ Risk│ Dec │
│                                               │        │       │  ▾  │     │
│                                               │────────────────────────────│
│                                               │ Risk Factors:              │
│                                               │ ┌────────────────────────┐ │
│                                               │ │ ⚠ Utilization   97%    │ │
│                                               │ │    25pts  ████████████ │ │
│                                               │ │ ⚠ Late Payments  3     │ │
│                                               │ │    18pts  █████████░░░ │ │
│                                               │ │ ✓ Payment History 2yr  │ │
│                                               │ │    0pts   ░░░░░░░░░░░░ │ │
│                                               │ │ ⚠ DSO Trend    +15d   │ │
│                                               │ │    20pts  ██████████░░ │ │
│                                               │ │ ⚠ Industry Risk Medium │ │
│                                               │ │    15pts  ███████░░░░░ │ │
│                                               │ └────────────────────────┘ │
│                                               │ Total: 78/100 ● High Risk  │
│                                               │ [Open in full view →]      │
└───────────────────────────────────────────────┴────────────────────────────┘
```

---

## DetailSlideover — Financial History Tab

```
│ Fin Hst│ Orders│ Risk│ Dec │
│    ▾    │       │     │     │
│────────────────────────────│
│ Payment History (last 12m):│
│ ┌────────────────────────┐ │
│ │ Jun 2026  $12,400  ✓   │ │
│ │ May 2026  $11,800  ✓   │ │
│ │ Apr 2026  $10,600  ✓   │ │
│ │ Mar 2026  $15,200  ✓   │ │
│ │ Feb 2026  $14,100  14d │ │  ← late payment indicator
│ │ Jan 2026  $13,700  7d  │ │
│ │ Dec 2025  $11,200  ✓   │ │
│ └────────────────────────┘ │
│ Avg Days to Pay: 8.3d      │
│ Late Payments: 3 of 36     │
│ Credit Score: 672 (Fair)   │
```

---

## Dimensions

- View container: 100vw × 100vh
- View Header: 56px tall. [New Review] button right-aligned.
- FilterToolbar: 44px tall. Amount filter for credit limit/balance range.
- GridSummaryStrip: 80px tall, 4 metric cards. "High Risk" card has red accent border.
- ViewTabBar: 40px tall. Tabs 150px wide.
- AG Grid: 32px row height. ID column 110px. Customer column 200px. Limit column 130px. Balance column 130px. Risk column 150px (dot + score + bar). Status column 110px.
- Risk mini bar: 4px tall, full cell width. 10 segments.
- Utilization bar: 8px tall, inline below limit/balance. 10 segments.
- Risk Factors list: 32px per factor row. Score bar 120px wide, 6px tall.
- Payment History rows: 28px tall each. Checkmark/late-day indicator 32px.
- BulkActionBar: 52px tall.
- DetailSlideover: Peek 280px → Standard 420px → Wide 60vw.
- Font: Inter 13px body, 11px secondary, 14px header.

---

## Interactive Elements

- **Risk Score inline bar:** Hover → tooltip with factor breakdown (top 3 contributors). Click → opens DetailSlideover to Risk Factors tab.
- **Utilization bar:** Hover → tooltip "$387,200 of $500,000 (77.4%)". Color-coded by risk.
- **Status cell:** Double-click → ComboboxCellEditor (Pending Review/Approved/Rejected).
- **Row click:** Single-click → DetailSlideover peek. Double-click → standard.
- **New Review button:** Opens review creation form. Customer lookup, auto-populates financial data.
- **BulkActionBar Approve Credit:** Executes credit decision. Updates status. Creates approval record.
- **BulkActionBar Request More Info:** Moves review to "Info Requested" sub-status. Sends notification.
- **BulkActionBar Escalate:** Flags for senior review. Adds "Escalated" tag. Priority increased.
- **Risk Factors tab:** Interactive breakdown. Click factor row → highlights contributing data in other tabs.
- **Financial History tab:** Sortable table by date/amount. Filter by on-time/late.
- **View Orders button (peek):** Opens Orders view filtered to this customer.
- **Decision tab:** Shows approval/rejection rationale. Free-text notes from reviewer. Timestamp + reviewer name.
- **Credit limit adjustment:** Inline edit on limit cell (admin only). Triggers re-review workflow.

---

## States Shown

- **Default (All tab):** All reviews visible. Risk score bars color-coded. High-risk rows have subtle red left-border.
- **Pending Review tab:** Only unreviewed records. "Days pending" badge: "5d" in amber if >3 days.
- **High-risk filter active:** Only red-dot records. SummaryStrip "High Risk" card highlighted.
- **Review approved (success):** Green flash on row. Status updates to Approved. Slideover shows approval details.
- **Review rejected:** Red flash on row. Status updates to Rejected. Reason captured in Decision tab.
- **Info requested:** Amber badge "Info Req" on row. Paused indicator. Clock icon.
- **Empty state:** "All reviews complete" with last review date. "See past reviews" link.
- **Loading:** Skeleton rows with pulsing bars.
- **Error state:** Failed credit check. Toast with error. Retry button.

---

## ARIA Annotations

- View container: role="region", aria-label="Credit review"
- Risk score cell: role="meter", aria-valuenow, aria-valuemin="0", aria-valuemax="100", aria-label="Risk score: 78 out of 100 — High risk"
- Risk indicator dot: aria-hidden="true" (decorative). Score text provides semantic value.
- Utilization bar: role="meter", aria-valuenow="77", aria-valuemin="0", aria-valuemax="100", aria-label="Credit utilization: 77 percent"
- GridSummaryStrip High Risk card: role="status", aria-label="14 high risk reviews requiring attention"
- AG Grid: role="grid", aria-label="Credit reviews"
- Status cell (editing): role="combobox", aria-haspopup="listbox"
- Risk Factors tab: role="tabpanel", aria-label="Risk factors for GlobalFresh Inc"
- Factor rows: role="listitem". Score bar: role="meter", aria-valuenow, aria-label="[Factor name]: [points] points"
- Financial History tab: role="tabpanel", aria-label="Payment history"
- Payment rows: role="row". Late payment: aria-label="Late payment: 14 days overdue"
- BulkActionBar: role="toolbar", aria-label="Credit review actions"
- DetailSlideover: role="complementary", aria-label="Credit review details"
- Decision tab: role="tabpanel", aria-label="Review decision and rationale"

---

## Edge Cases Handled

- **Customer with no payment history:** "No payment history available — new customer" message. Risk defaults to Medium pending first review.
- **Credit limit exceeded (balance > limit):** Balance shown in red. Utilization bar at 100% + overflow indicator "▼$12,400 over limit".
- **Multiple open reviews for same customer:** Warning banner "2 open reviews for this customer." Link to other review.
- **Approved review, subsequent late payment:** "Review may be stale" badge. "Last approved Sep 2025, 3 late payments since." Re-review button.
- **Industry risk change:** If industry risk factor updates, affected reviews get "Risk Updated" badge. Orange left-border.
- **Credit limit zero:** "No credit — prepay only" status. Review shows N/A for utilization. Risk set to Low (no exposure).
- **Concurrent review conflict:** If two reviewers approve same review, second gets toast: "Already approved by [Reviewer] at [time]."
- **Risk score recalculation:** Score shown as "Recalculating..." with pulse animation when underlying data changes (new payment, order).
- **Large customer with many orders:** Orders tab paginates (50 per page). "Showing 1-50 of 847 orders."
