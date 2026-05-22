# Support Operator — Trace Order Status (Normal Path)

## Meta
- **Persona:** Support Operator
- **Scenario type:** normal
- **Risk tier:** Normal
- **Command families touched:** — (read-only)
- **Estimated run time:** 5–6 minutes
- **Last validated:** not yet run

---

## Persona Context
A buyer has texted asking where their order is. The Support Operator needs to find
the order, determine its current status, and reconstruct the timeline to give an
accurate answer — all without mutating any data.

## Scenario
Find a specific order in the system, trace its status from Sales through Fulfillment,
and document the complete status chain. Verifies that order status is readable and
traceable without needing to contact other team members.

---

## Prerequisites
> A posted sales order must exist (ideally in Fulfilled status from flow
> `warehouse-operator/01-pick-weigh-fulfill-normal.md`, or any Posted order from
> `sales-operator/01-instant-sale-normal.md`).
> Use **Canyon Market** as the customer to search for.

---

## Pre-Run Checklist
- [ ] At least one order for Canyon Market exists in a non-Draft status
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Orders (Sell → Orders).

---

## Flow Steps

### Step 1 — Find the Canyon Market order
**Action:** In the Orders view, filter or search for orders associated with **Canyon Market**. Find the most recent order.
**Expected signal:** The order is visible with customer name, status, order date, and total amount shown.

### Step 2 — Read the order status
**Action:** Note the current status of the order (e.g., Posted, Fulfilled, etc.).
**Expected signal:** Status is explicitly labeled on the row — not inferred from color alone.

### Step 3 — Check fulfillment status
**Action:** Navigate to Fulfillment (Sell → Fulfillment) and search for the same order.
**Expected signal:** If the order is fulfilled, it should appear (possibly in a completed/archived view). If not yet fulfilled, it should be in the active queue. Document what status is shown in Fulfillment.

### Step 4 — Cross-reference with Sales view
**Action:** Navigate to Sales (⌘3) and find the same order.
**Expected signal:** The order appears in Sales with consistent status matching what was seen in Orders.

### Step 5 — Document the complete status chain
**Action:** Record the order's status as seen in: Orders view, Fulfillment view, and Sales view.
**Expected signal:** All three views show consistent, non-contradictory status for the same order. If statuses differ between views, note as a data consistency finding.

---

## Pass Criteria
- [ ] Order found by customer name filter in under 2 filter operations
- [ ] Status explicitly labeled (not color-only)
- [ ] Fulfillment status consistent with Orders status
- [ ] Sales status consistent with Orders status
- [ ] Support operator can reconstruct order timeline without mutation access

---

## Failure Modes to Watch For
- **Order not findable by customer name:** Search/filter gap — High UX issue
- **Status inconsistent across views:** Data sync bug
- **No status label (color-only):** UX gap — accessibility and clarity issue
- **Requires 4+ view visits to reconstruct simple status:** High friction finding

---

## Related Flows
- `sales-operator/01-instant-sale-normal.md` — creates the order to trace
- `warehouse-operator/01-pick-weigh-fulfill-normal.md` — fulfills the order being traced
