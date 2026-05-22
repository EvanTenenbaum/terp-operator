# Warehouse Operator — Partial Fulfillment (Error Path)

## Meta
- **Persona:** Warehouse Operator
- **Scenario type:** error-path
- **Risk tier:** Deep QA
- **Command families touched:** CMD-FULFILLMENT
- **Estimated run time:** 8–10 minutes
- **Last validated:** not yet run

---

## Persona Context
An order has multiple line items but only some are physically available to ship today.
The Warehouse Operator needs to fulfill the available lines and leave the remaining
lines open — without prematurely closing the order or losing the remaining pick lines.

## Scenario
Tests partial fulfillment: an order with multiple line items where only some can
be fulfilled immediately. Verifies the order stays open until all lines are fulfilled,
and the partially-fulfilled lines are tracked correctly.

---

## Prerequisites
> A posted sales order with multiple line items must exist.
> Create a sale with 2 different line items via sales-operator/01-instant-sale-normal.md
> (add two different products). Post the sale.

---

## Pre-Run Checklist
- [ ] Order with 2+ line items in Fulfillment queue
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Fulfillment (Sell → Fulfillment).

---

## Flow Steps

### Step 1 — Find the multi-line order
**Action:** Locate the order with multiple line items in the Fulfillment queue.
**Expected signal:** Order visible with 2 or more fulfillment lines, each showing product name and ordered quantity.

### Step 2 — Fulfill only the first line item
**Action:** Record weigh-and-pack for the first line item only. Mark ONLY that line as packed/fulfilled — do NOT mark the entire order as fulfilled yet.
**Expected signal:** First line shows as packed or fulfilled. Second line remains open.

### Step 3 — Attempt to mark the order fulfilled with one open line
**Action:** Attempt to mark the entire order as fulfilled while the second line is still open.
**Expected signal (ideal):** System warns or blocks — "Order has unfulfilled lines." Does not allow marking the full order fulfilled with open lines.
**Expected signal (acceptable):** System allows partial fulfillment mark and shows a partial status.
**Expected signal (finding):** System marks the entire order as Fulfilled despite open lines — file as High finding.

### Step 4 — Complete fulfillment of the second line
**Action:** Record weigh-and-pack for the second line item. Mark it as packed/fulfilled.
**Expected signal:** Second line marked fulfilled. Both lines now show fulfilled status.

### Step 5 — Mark the complete order fulfilled
**Action:** Mark the entire order as fulfilled.
**Expected signal:** Order status changes to `Fulfilled`. Toast confirms. Order leaves the active queue.

### Step 6 — Verify order status in Orders view
**Action:** Check the Orders view for this order.
**Expected signal:** Order shows `Fulfilled` status. Both line items are visible as fulfilled. No open lines remain.

---

## Pass Criteria
- [ ] Multi-line fulfillment tracked per line, not only at the order level
- [ ] Order does NOT prematurely show as Fulfilled with open lines
- [ ] Both lines can be fulfilled in sequence
- [ ] Final Fulfilled status reflects complete fulfillment of all lines
- [ ] Inventory decreases for both fulfilled lines

---

## Failure Modes to Watch For
- **Premature full Fulfilled on partial completion:** High — order marked Fulfilled with open lines
- **Second line disappears after first is fulfilled:** Data integrity bug
- **No per-line tracking visible:** UX gap — operator can't tell which lines are done
- **Inventory decrements only on full order close, not per-line:** Logic issue

---

## Related Flows
- `warehouse-operator/01-pick-weigh-fulfill-normal.md` — single-line baseline
