# Warehouse Operator — Weight Discrepancy (Edge Case)

## Meta
- **Persona:** Warehouse Operator
- **Scenario type:** edge-case
- **Risk tier:** Deep QA
- **Command families touched:** CMD-FULFILLMENT
- **Estimated run time:** 8–10 minutes
- **Last validated:** not yet run

---

## Persona Context
The Warehouse Operator weighs the product and finds the actual weight is significantly
different from the ordered quantity. The system should handle this gracefully —
either warning, blocking, or accepting with a note — but not silently accepting a
wildly wrong weight that would create invoice discrepancies.

## Scenario
Tests the system's response when actual packed weight/quantity differs significantly
from the ordered amount. Documents whether the system warns, blocks, or accepts silently.

---

## Prerequisites
> A posted sales order must exist. Use the Canyon Market order from flow 01,
> or create a new one via sales-operator/01-instant-sale-normal.md.

---

## Pre-Run Checklist
- [ ] Open order in Fulfillment queue
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Fulfillment (Sell → Fulfillment).

---

## Flow Steps

### Step 1 — Find the order and note the ordered quantity
**Action:** Locate the open order. Note the ordered quantity (e.g., 5 units ordered).
**Expected signal:** Ordered quantity visible on the fulfillment line.

### Step 2 — Enter a significantly different actual weight/quantity
**Action:** In the weight/quantity entry field, enter a value significantly different from the ordered amount — e.g., if 5 units ordered, enter 50 (10× over) or 1 (80% under).
**Expected signal:** Note the system's response: does it warn, block, flag, or silently accept?

### Step 3 — Document the system response
**Action:** Observe and record what happens after entering the discrepant quantity.
**Expected signal (ideal):** System warns that actual quantity differs significantly from ordered quantity. Offers confirmation before proceeding.
**Expected signal (acceptable):** System accepts the discrepant weight but flags it for review.
**Expected signal (finding):** System silently accepts with no warning — file as Medium finding (data integrity risk).

### Step 4 — Proceed with the discrepant quantity
**Action:** If the system allows it (with or without warning), proceed to mark the order fulfilled with the discrepant quantity.
**Expected signal:** Order marked fulfilled. The fulfilled quantity recorded matches what was entered (not silently corrected back to ordered quantity).

### Step 5 — Verify the actual vs. ordered discrepancy is visible
**Action:** Check the Orders view and the fulfillment record for the order. Look for any discrepancy notation.
**Expected signal:** The fulfilled quantity differs from the ordered quantity and this difference is visible somewhere in the order record or fulfillment history.

---

## Pass Criteria
- [ ] System response to discrepant weight is documented (warn / accept-with-flag / silent)
- [ ] Actual quantity recorded correctly matches what was entered
- [ ] Discrepancy visible in order record (not silently normalized)
- [ ] If silent acceptance: filed as Medium finding

---

## Failure Modes to Watch For
- **Silent acceptance of 10× quantity:** No warning for a major discrepancy — Medium finding
- **System corrects quantity to ordered amount:** Silently normalizes — High finding (data mutation without operator action)
- **Order cannot be fulfilled with discrepant weight:** Blocks completely — note as finding if no override path

---

## Related Flows
- `warehouse-operator/01-pick-weigh-fulfill-normal.md` — clean path for baseline
