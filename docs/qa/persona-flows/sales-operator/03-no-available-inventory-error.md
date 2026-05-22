# Sales Operator — No Available Inventory (Error Path)

## Meta
- **Persona:** Sales Operator
- **Scenario type:** error-path
- **Risk tier:** Normal
- **Command families touched:** CMD-SALES
- **Estimated run time:** 5–6 minutes
- **Last validated:** not yet run

---

## Persona Context
The Sales Operator receives a buyer request for a product that turns out to be
unavailable. The system must surface this clearly so the operator can redirect
the buyer — not silently create a sale with a zero-quantity or phantom line item.

## Scenario
Tests system behavior when a sale is attempted for a product with no Live inventory.
The operator should receive a clear, specific block — not an empty state or a
silent zero-quantity reservation.

---

## Prerequisites
> Identify a product name that has NO Live batches (status Depleted, Sold, or simply
> not present). If all products have Live inventory, temporarily set one batch to
> Depleted via the Inventory grid before starting.

---

## Pre-Run Checklist
- [ ] Confirmed: at least one product has no Live inventory available
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Sales (⌘3).

---

## Flow Steps

### Step 1 — Start a new sale
**Action:** Begin a new sale for Canyon Market.
**Expected signal:** Draft sale row appears.

### Step 2 — Search for the unavailable product in InventoryFinder
**Action:** Open InventoryFinder and search for the product with no Live inventory.
**Expected signal:** The product either does not appear, or appears with quantity 0 and a non-Live status. If it appears as sellable with Live status despite having no stock, file as a data bug.

### Step 3 — Attempt to add the unavailable product as a line item
**Action:** Try to add the out-of-stock product as a line item.
**Expected signal:** System either prevents adding (with a clear availability message) or adds it with a zero-quantity warning. A silent add with no indication of unavailability is a finding.

### Step 4 — Attempt to confirm the sale with the unavailable line item
**Action:** Try to confirm the sale.
**Expected signal:** System blocks confirmation with a message specifically identifying the inventory issue — product name, current availability, and why confirmation failed. A generic "cannot confirm" message is a High finding.

### Step 5 — Verify no reservation was created
**Action:** Check the Inventory view for the out-of-stock product.
**Expected signal:** No reservation exists. Quantity unchanged. The failed sale created no phantom reservation.

---

## Pass Criteria
- [ ] InventoryFinder correctly shows the product as unavailable or absent
- [ ] Attempt to confirm blocked with specific message (product + availability reason)
- [ ] No phantom reservation created in Inventory
- [ ] Draft sale can be safely deleted or left without corrupting ledger state

---

## Failure Modes to Watch For
- **Product appears as Live in finder despite no stock:** Cache or data bug
- **Silent confirm with zero-quantity line:** Sale confirms with $0 or zero-quantity — Critical
- **Generic error:** "Cannot confirm order" with no product/inventory detail — High UX gap

---

## Related Flows
- `sales-operator/01-instant-sale-normal.md` — the successful counterpart
- `inventory-operator/01-receive-batch-normal.md` — how inventory gets created
