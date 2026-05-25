# Phase 6 Report Math Spec

Date: 2026-05-25  
Status: prerequisite spec — required before Phase 6 implementation starts  
Author: OpenCode PM agent  
Linear: TER-1499

---

## Overview

This document specifies the data sources, math formulas, period scope, empty-state behavior, and Phase 5 dependencies for every report and KPI item in Phase 6 scope. It is the "report math expectations are written before implementation" prerequisite identified in `docs/roadmap/phase-readiness/6.md`.

**How to use this doc:**

- Implementers: read a section before writing the corresponding aggregation logic; don't guess at period scope or formula.
- QA: use the formulas to write seeded fixture tests against known DB state.
- PM: use the Build-Now vs. Hold Matrix and Open Questions sections before sprint planning.

**What already exists:**

`src/client/components/ReportsRouteShell.tsx` is a working shell with client-side `buildReportRows()` logic for all 7 report types. The aggregation math is correct in broad strokes but has no period scope, no drilldown linkage, no deterministic column order for exports, and no documented empty-state behavior. Phase 6 hardens and documents what is already there rather than building from scratch.

`src/client/views/DashboardView.tsx` already has 7 KPI cards, Money Buckets, Pending Work Queues, Recent Activity, and a ranked Work Queue grid. Phase 6 adds a "Today Focus" decision panel without replacing the existing sections.

---

## Prerequisite Data Inventory

The following tRPC queries are available for aggregation. All are client-fetched and aggregated in the browser; no server-side report tables exist or are needed yet (see Backend Packet D policy in `docs/roadmap/phase-readiness/6.md`).

| tRPC query | Relevant columns for reports | DB tables |
|---|---|---|
| `queries.dashboard` | `metrics[]`, `moneyBuckets[]`, `pendingQueues[]` | `payments`, `invoices`, `vendor_bills`, `batches`, `matchmaking_matches`, `customers` |
| `queries.grid({ view: 'sales' })` | `total`, `status`, `internalMargin`, `customer`, `createdAt`, `lines` | `sales_orders`, `customers`, `sales_order_lines` |
| `queries.grid({ view: 'inventory' })` | `availableQty`, `reservedQty`, `unitCost`, `unitPrice`, `ageDays`, `category`, `status`, `vendor` | `batches`, `vendors`, `items` |
| `queries.grid({ view: 'payments' })` | `amount`, `direction`, `method`, `locationBucket`, `status`, `createdAt` | `payments`, `customers` |
| `queries.grid({ view: 'vendors' })` | `amount`, `amountPaid`, `status`, `dueDate`, `scheduledFor`, `vendor`, `duReason`, `consignmentTriggered` | `vendor_bills`, `vendors`, `purchase_orders` |
| `queries.grid({ view: 'clients' })` | `balance`, `creditLimit`, `invoiceCount`, `name` | `customers`, `invoices` |
| `queries.grid({ view: 'purchaseOrders' })` | `total`, `prepaymentAmount`, `lines`, `orderedQty`, `receivedQty`, `status`, `vendor` | `purchase_orders`, `vendors`, `purchase_order_lines` |
| `queries.grid({ view: 'connectors' })` | `source`, `requestType`, `status`, `createdAt` | `connector_requests`, `customers` |
| `queries.grid({ view: 'closeout' })` | `period`, `status`, `controlTotals`, `createdAt` | `archive_runs` |
| `queries.transactionLedger` | client ledger entries with `kind`, `amount`, `balanceAfter`, `createdAt` | `client_ledger_entries` |
| `queries.drilldown({ metricKey })` | source rows for dashboard KPIs (cash → payments, payables → vendor_bills, receivables → invoices, inventory/aging → inventory grid, debt_leader → clients grid) | varies by key |
| `queries.workQueue` | pending work items with `lane`, `title`, `status`, `detail`, urgency sort | `sales_orders`, `purchase_orders`, `invoices`, `vendor_bills`, `connector_requests` |

**Not available for aggregation yet (deferred):**

- Persisted suggestions table (BE-006 — deferred)
- Search freshness timestamp (BE-007 — deferred)
- Server-side batch filter path (BE-012 — deferred; client-side filtering sufficient until >500 active batches)

---

## Reports and KPIs

### 1. Dashboard Today Focus

- **Capability ID**: CAP-021 (Dashboard Today Focus item; Recipe R7, R12)
- **Operator description**: The 2–3 decisions the owner actually needs to make today, ranked by urgency. Not a chart wall — a short list with a clear next action for each item.
- **Source data**: `queries.dashboard` (already loaded by DashboardView), `queries.workQueue`
- **Math formula**:
  ```
  Today Focus items = top 3 items from workQueue ranked by urgencyScore(row):
    needs_fix / failed → 100
    ready / confirmed → 80
    lane = 'Payments' or 'Vendor' → 70
    draft / open → 50
    all other → 10
  Tiebreak: createdAt DESC

  Display each item as: [lane label] · [status pill] · [detail] · [action button]
  ```
  The urgency formula already exists in `DashboardView.tsx`. Today Focus reuses it but renders only the top 3 items prominently at the top of the page, above KPI cards.
- **Date/period scope**: Live — all non-archived active rows at query time. No historical period filter; this is a "right now" view.
- **Empty state behavior**: "Nothing needs your attention right now." with a status pill showing green. Do not hide the panel — show it with the empty message so the operator knows it is working.
- **Phase 5 dependency**: No. Closeout/archive data is not used. Work queue sources (sales_orders, purchase_orders, invoices, vendor_bills, connector_requests) are live operational tables. Can build without Phase 5. ✅ Build now.

---

### 2. Revenue Report

- **Capability ID**: CAP-021 (Reports route, Report 1; Recipe R7)
- **Operator description**: How much product have we sold, and where does it stand? Sales order totals grouped by status so the owner can see what is confirmed, posted, or still in draft.
- **Source data**: `queries.grid({ view: 'sales' })` → `sales_orders` joined with `customers` and `sales_order_lines`
- **Math formula**:
  ```
  For each status group (draft | confirmed | posted | cancelled):
    group_total = SUM(row.total) for rows WHERE row.status = group
    row_count   = COUNT(rows) WHERE row.status = group

  Grand total (posted revenue) = SUM(row.total) WHERE row.status = 'posted'
  ```
  The current `ReportsRouteShell.tsx` already implements this via `groupRows(data.sales, (row) => row.status, ...)`. The formula is correct. What is missing: a grand-total summary row pinned at top, and a "posted only" highlight for the number the owner actually uses.
- **Date/period scope**: All non-archived orders at query time. No period filter in Phase 6 MVP. Add a "This period" chip if closeout data is available (Phase 5 dependency for filtered view). Without a period filter, label the report "All orders — live" in the parameter strip.
- **Empty state behavior**: "No sales orders recorded yet." in place of the grid. Do not show $0 rows; omit status groups with zero count entirely.
- **Phase 5 dependency**: Partial. The base report builds now against all orders. Period-scoped revenue (e.g., "posted this month only") requires knowing which months are locked — that's closeout data. Stub: omit the period filter chip until closeout data exists; label as "all time" explicitly. ⚠️ Build base now, period filter after Phase 5.

---

### 3. Aging Inventory Report

- **Capability ID**: CAP-021 (Reports route, Report 2; Recipe R7)
- **Operator description**: Which inventory has been sitting too long? Batches grouped by how old they are, so the owner can spot slow-moving stock before it becomes a problem.
- **Source data**: `queries.grid({ view: 'inventory' })` → `batches` joined with `vendors` and `items`
- **Math formula**:
  ```
  ageDays = floor(extract(epoch from (now() - batch.createdAt)) / 86400)
  -- Note: ageDays is pre-computed server-side in the inventory grid SQL as "ageDays"

  ageBucket(ageDays):
    0–29  → '0-29 days (fresh)'
    30–59 → '30-59 days (watch)'
    60+   → '60+ days (aging)'

  For each ageBucket:
    group_cost_value  = SUM(row.availableQty * row.unitCost) WHERE ageBucket matches
    group_retail_value = SUM(row.availableQty * row.unitPrice) WHERE ageBucket matches
    row_count         = COUNT(batches) WHERE ageBucket matches AND row.availableQty > 0

  Filter: only include batches WHERE row.status IN ('posted', 'ready') AND row.availableQty > 0
  Exclude: draft batches (not yet received), zero-quantity batches.
  ```
  Current shell includes all rows regardless of availableQty. Fix: filter to `availableQty > 0` before grouping.
- **Date/period scope**: Live snapshot of current inventory state. Age is measured from `createdAt` (batch posting date) — this is correct for "how long has this lot been in stock." No period filter needed.
- **Empty state behavior**: "No active inventory lots." If all lots are draft or zero-quantity, show this message. Do not show empty age buckets.
- **Phase 5 dependency**: No. Aging is computed from live batch data. Archived batches are already excluded by the grid SQL (`WHERE b.archived_at IS NULL`). ✅ Build now.

---

### 4. Payables Due Report

- **Capability ID**: CAP-021 (Reports route, Report 3; Recipe R7)
- **Operator description**: What do we owe vendors, and when is it due? Open vendor bills grouped by payment status so the owner can plan cash out.
- **Source data**: `queries.grid({ view: 'vendors' })` → `vendor_bills` joined with `vendors` and `purchase_orders`
- **Math formula**:
  ```
  For each status group (open | approved | scheduled | partial):
    group_balance  = SUM(row.amount - row.amountPaid) WHERE row.status = group
    row_count      = COUNT(bills) WHERE row.status = group

  Overdue flag: bills WHERE row.dueDate < today AND row.status NOT IN ('paid', 'voided')
  overdue_balance = SUM(row.amount - row.amountPaid) for overdue rows

  Grand total owed = SUM(row.amount - row.amountPaid) WHERE row.status IN ('open','approved','scheduled','partial')
  ```
  Current shell uses `row.amount - row.amountPaid` per row, which is correct. What is missing: the overdue flag/bucket and a grand total row.
- **Date/period scope**: Live open bills at query time. Overdue is `dueDate < today` (client-computed at render time using `new Date(row.dueDate) < new Date()`). No period filter needed for Phase 6 MVP.
- **Empty state behavior**: "No open vendor bills." — this is a genuinely happy state; render it with a green status pill.
- **Phase 5 dependency**: No. Uses live `vendor_bills` table. ✅ Build now.

---

### 5. Cash Movement Report

- **Capability ID**: CAP-021 (Reports route, Report 4; Recipe R7)
- **Operator description**: Where is money actually moving? Payment rows grouped by direction (in vs. out) and method (cash, check, wire, etc.) so the owner can see cash flow patterns.
- **Source data**: `queries.grid({ view: 'payments' })` → `payments` joined with `customers`
- **Math formula**:
  ```
  Group key = `${row.direction} / ${row.method}`
  -- direction: 'in' | 'out'
  -- method: 'cash' | 'check' | 'wire' | 'credit' | etc.

  For each group:
    group_total = SUM(row.amount)
    row_count   = COUNT(payments)

  Filter: only rows WHERE row.status = 'posted'
  Exclude: draft and void payment rows.

  Net cash position = SUM(amount WHERE direction='in' AND status='posted')
                    - SUM(amount WHERE direction='out' AND status='posted')
  ```
  Current shell includes all payment rows regardless of status. Fix: filter to `status = 'posted'` only. Buyer credit payments (negative client payment rows) count as "out" direction by convention.
- **Date/period scope**: All posted payments at query time (all time). No period filter in Phase 6 MVP. The Money Buckets panel in DashboardView provides the location_bucket breakdown; this report provides the direction/method breakdown.
- **Empty state behavior**: "No posted payment rows." Revenue and expenses will both show as $0.
- **Phase 5 dependency**: No. Uses live `payments` table. ✅ Build now.

---

### 6. Vendor Performance Report

- **Capability ID**: CAP-021 (Reports route, Report 5; Recipe R7)
- **Operator description**: How much do we owe each vendor? Bill exposure by vendor name so the owner can see concentration risk and prioritize vendor payments.
- **Source data**: `queries.grid({ view: 'vendors' })` → `vendor_bills` joined with `vendors`
- **Math formula**:
  ```
  Group key = row.vendor (vendor name)

  For each vendor group:
    outstanding_balance = SUM(row.amount - row.amountPaid) WHERE row.status NOT IN ('paid','voided')
    total_billed        = SUM(row.amount) for all bills (any status)
    bill_count          = COUNT(bills) WHERE row.status NOT IN ('voided')
    consignment_count   = COUNT(bills) WHERE row.consignmentTriggered = true
  ```
  Current shell groups by `row.vendor` and sums `amount - amountPaid` for all bills including paid/voided. Fix: filter out paid/voided rows for the "outstanding_balance" column; keep a separate "total_billed" column for context.
- **Date/period scope**: All non-voided bills at query time. No period filter in Phase 6 MVP.
- **Empty state behavior**: "No vendor bills recorded." 
- **Phase 5 dependency**: No. Uses live `vendor_bills` table. ✅ Build now.

---

### 7. Category Analytics Report

- **Capability ID**: CAP-021 (Reports route, Report 6; Recipe R7)
- **Operator description**: What product categories are in stock and what are they worth? Inventory batches grouped by category, valued at retail price, so the owner can see where the floor value is.
- **Source data**: `queries.grid({ view: 'inventory' })` → `batches` joined with `vendors` and `items`
- **Math formula**:
  ```
  Group key = row.category (from batches.category; 'Uncategorized' if null)

  For each category group:
    retail_value = SUM(row.availableQty * row.unitPrice)
                   WHERE row.status IN ('posted','ready') AND row.availableQty > 0
    cost_value   = SUM(row.availableQty * row.unitCost)
                   WHERE row.status IN ('posted','ready') AND row.availableQty > 0
    lot_count    = COUNT(batches) WHERE row.availableQty > 0
    total_qty    = SUM(row.availableQty)
  ```
  Current shell uses `unitPrice` for retail value and includes all status rows. Fix: filter to `status IN ('posted','ready')` and `availableQty > 0`. Note: `unitPrice` may be null for some batches (cost-only lots) — use `COALESCE(unitPrice, unitCost)` for value display, with a note in the UI that null-price lots show at cost.
- **Date/period scope**: Live inventory snapshot. No period filter.
- **Empty state behavior**: "No active inventory." or "No inventory with price data." depending on which filter eliminates all rows.
- **Phase 5 dependency**: No. Uses live `batches` table. Archived batches excluded by grid SQL. ✅ Build now.

---

### 8. Client Sales History Report

- **Capability ID**: CAP-021 (Reports route, Report 7; Recipe R7)
- **Operator description**: What does each client owe and how often do they buy? Client balance and open invoice count so the owner can see who is current and who is carrying a balance.
- **Source data**: `queries.grid({ view: 'clients' })` → `customers` joined with `invoices`
- **Math formula**:
  ```
  For each customer:
    current_balance  = row.balance
                       -- This is the live denormalized balance on the customers table
                       -- Positive = client owes us money; negative = buyer credit on file
    credit_limit     = row.creditLimit
    open_invoices    = row.invoiceCount
                       -- Count of invoices for this customer (all statuses in current SQL)
    headroom         = row.creditLimit - row.balance
                       -- Available credit before limit hit; may be negative if over limit

  Sort: row.balance DESC (highest debt at top, matches existing clients grid SQL)
  ```
  **Important gap**: `row.invoiceCount` in the current clients grid SQL counts ALL invoices (no status filter). For a "Client Sales History" report, this should count only open/partial invoices to show active exposure. A separate total invoice count column could show history volume. This is an Open Question — see below.
- **Date/period scope**: Live client ledger state. No period filter. To get historical sales volume by client, the operator would need to query `sales_orders` grouped by `customerId` — this is NOT currently in the ReportsRouteShell implementation. The current implementation shows balance/debt, not sales volume.
- **Empty state behavior**: "No clients recorded." If all clients have $0 balance, show the list anyway — zero balance is useful information (no one owes us).
- **Phase 5 dependency**: No. Uses live `customers` and `invoices` tables. ✅ Build now.

---

## Build-Now vs. Hold Matrix

| Report / KPI | Can build now? | Phase 5 dependency | Notes |
|---|---|---|---|
| Dashboard Today Focus panel | ✅ Yes | None | urgencyScore logic already in DashboardView.tsx; add focused top-3 panel at page top |
| Revenue (sales totals by status) | ✅ Yes (base) | Period filter only | Base aggregation works now; period-scoped filter needs CAP-020 archive data |
| Aging Inventory (by age bucket) | ✅ Yes | None | `ageDays` pre-computed server-side; filter to `availableQty > 0` before grouping |
| Payables Due (by payment status) | ✅ Yes | None | Add overdue bucket and grand total; formula is correct already |
| Cash Movement (by direction + method) | ✅ Yes | None | Filter to `status = 'posted'` rows only; all-time for MVP |
| Vendor Performance (by vendor name) | ✅ Yes | None | Filter to non-paid/voided bills for outstanding_balance column |
| Category Analytics (by category) | ✅ Yes | None | Filter to `status IN ('posted','ready')` AND `availableQty > 0`; null-price lots show at cost |
| Client Sales History (balance + invoices) | ✅ Yes | None | Fix: invoiceCount should filter to open/partial only; add headroom column |
| Source-row drilldowns from Reports | ⚠️ Partial | None | Dashboard drilldowns exist for 5 keys; Reports route does not yet link grid rows to drilldown views |
| Report CSV export | ✅ Yes | None | `csvExport` query and HTTP export route exist; need deterministic column ordering |
| Period-scoped Revenue filter | 🔴 Hold | CAP-020 archive data | Need `archive_runs` with locked periods before "this month" filter is accurate |
| Search/suggestion freshness (CAP-015/016) | 🔴 Hold | BE-006, BE-007 (deferred) | Per registry decisions; add only if direct queries become stale/slow |

---

## Open Questions for Evan

1. **Revenue report — posted invoices vs. posted sales orders**: The current Revenue report sums `sales_orders.total` grouped by order status. Should "revenue" be defined as posted sales orders, posted invoices, or both? These can diverge (an order can be posted without an invoice, or an invoice can exist without a matching order). Recommendation: define revenue as `invoices WHERE status IN ('open','partial','paid')` total for financial accuracy, with sales orders as a secondary "pipeline" view.

2. **Client Sales History — sales volume vs. balance**: The current "Client Sales History" report shows customer AR balance (what they owe), not actual sales volume (what they've bought). These are different numbers. Should this report show:
   - (a) AR balance + open invoice count (current behavior — shows who owes what)
   - (b) Lifetime sales total by customer from `sales_orders` (shows who buys the most)
   - (c) Both in separate columns?
   The operator vocabulary ("sales history") implies (b) or (c), but the current data source only cleanly gives (a).

3. **Cash movement period scope**: Cash Movement currently aggregates all-time posted payments. In practice, an operator wants "this week" or "this month" cash flow. Should Phase 6 add a period filter chip (e.g., "This month / Last 30 days / All time") using `createdAt` on the payments rows? This does NOT require Phase 5 closeout data — it's a client-side date filter. Recommendation: add a simple "Last 30 days / All time" toggle as a parameter chip.

4. **Drilldown linkage from Reports route**: The Dashboard has `queries.drilldown({ metricKey })` for 5 metric keys. The Reports route (`ReportsRouteShell`) lets users select rows from the aggregation grid but currently shows a drawer with a generic `report` entity type rather than routing to the actual source rows. Should Reports row-selection open the same source-row drilldown (e.g., selecting a status group in Revenue → shows those sales orders)? This requires either routing to the Sales view with a status pre-filter, or adding a dedicated `queries.drilldown` key per report type.

5. **Aging inventory — age measured from `createdAt` vs. `intakeDate`**: The grid SQL computes `ageDays = floor(extract(epoch from (now() - b.created_at)) / 86400)`. However, `batches.intake_date` (the date product physically arrived) may be earlier than `created_at` (when the batch record was posted). For aging purposes, should age be measured from `intake_date` (physical arrival) or `created_at` (system posting date)? For operators managing inventory freshness (e.g., cannabis), physical arrival is the correct reference point. This may require a small server-side SQL change.
