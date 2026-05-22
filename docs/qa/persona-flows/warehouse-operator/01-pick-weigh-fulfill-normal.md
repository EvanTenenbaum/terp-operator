# Warehouse Operator — Pick, Weigh, Fulfill (Normal Path)

## Meta
- **Persona:** Warehouse Operator
- **Scenario type:** normal
- **Risk tier:** Normal
- **Command families touched:** CMD-FULFILLMENT
- **Estimated run time:** 6–8 minutes
- **Last validated:** not yet run

---

## Persona Context
An order is in the queue. The Warehouse Operator picks the product, weighs and packs it,
records the actual weight, and marks the order fulfilled. The queue should update
immediately after completion.

## Scenario
Happy-path fulfillment: find an open order in the Fulfillment queue, record weigh-and-pack
details, and mark fulfilled. Verify the order status updates across the system.

---

## Prerequisites
> A posted sales order must exist in the fulfillment queue. Complete
> `sales-operator/01-instant-sale-normal.md` first to create a posted sale.
> The sale for Canyon Market should appear in the Fulfillment queue after posting.

---

## Pre-Run Checklist
- [ ] At least one open order in the Fulfillment view
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Fulfillment (Sell → Fulfillment).

---

## Flow Steps

### Step 1 — Find the open order in the queue
**Action:** In the Fulfillment view, locate the order for Canyon Market from the prerequisite sale.
**Expected signal:** The order appears in the Fulfillment queue with product, ordered quantity, and customer name visible. Status indicates it is open and ready for fulfillment.

### Step 2 — Review the fulfillment line
**Action:** Expand or select the fulfillment line to see the pick details — product name, ordered quantity, and any pack instructions.
**Expected signal:** Line details are visible. Ordered quantity and product name match the sale from prerequisites.

### Step 3 — Record weigh-and-pack
**Action:** Enter the actual weight/quantity packed (use the ordered quantity as actual — this is a clean flow, no discrepancy). Confirm the pack.
**Expected signal:** The actual weight/quantity is recorded on the line. A confirmation or "packed" indicator appears.

### Step 4 — Mark the order fulfilled
**Action:** Mark the entire order as fulfilled.
**Expected signal:** Order status changes to `Fulfilled`. Toast confirms. The order should leave the active Fulfillment queue (or be visually marked complete).

### Step 5 — Verify order status in Orders view
**Action:** Navigate to Orders (Sell → Orders). Find the Canyon Market order.
**Expected signal:** Order shows status `Fulfilled`. The fulfillment date/time is recorded.

### Step 6 — Verify inventory quantity decreased
**Action:** Navigate to Inventory (⌘5). Check the batch used in the sale.
**Expected signal:** The batch's available quantity decreased by the fulfilled amount. If quantity is unchanged, file as a Critical finding.

---

## Pass Criteria
- [ ] Order found in Fulfillment queue matching the prerequisite sale
- [ ] Weigh-and-pack recorded inline without leaving the Fulfillment view
- [ ] Order marked Fulfilled with confirming toast
- [ ] Order status shows Fulfilled in Orders view
- [ ] Inventory quantity decreased by fulfilled amount

---

## Failure Modes to Watch For
- **Order not in Fulfillment queue:** Sync issue between Sales and Fulfillment
- **No inline weight entry:** Weight requires a modal — UX friction
- **Inventory not decreasing after fulfillment:** Critical — inventory not updated
- **Order remains in queue after fulfillment:** Queue refresh issue

---

## Related Flows
- `sales-operator/01-instant-sale-normal.md` — prerequisite: creates the order
- `_cross-persona/01-purchase-to-payment-lifecycle.md` — this flow embedded in the lifecycle
