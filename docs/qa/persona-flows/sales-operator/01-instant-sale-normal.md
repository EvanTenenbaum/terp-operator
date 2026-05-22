# Sales Operator — Instant Sale (Normal Path)

## Meta
- **Persona:** Sales Operator
- **Scenario type:** normal
- **Risk tier:** Normal
- **Command families touched:** CMD-SALES
- **Estimated run time:** 6–8 minutes
- **Last validated:** not yet run

---

## Persona Context
The Sales Operator is building a quick order for a known buyer. They know what the
buyer wants, the product is in inventory, and their goal is Draft → Posted with as
few actions as possible.

## Scenario
Happy-path sale: find a customer in good standing, find a Live inventory batch,
create a sale, add a line item, confirm it, and post it. Verifies the core sales
workflow end-to-end with no blockers.

---

## Prerequisites
> See `_shared/seed-state-reference.md`.
> A Live inventory batch must exist. If none, follow the intake setup steps in
> seed-state-reference.md to create one before running this flow.
> Use **Canyon Market** as the customer (good standing, $905,000 limit, $0 balance).

---

## Pre-Run Checklist
- [ ] At least one Live batch confirmed in Inventory view (⌘5)
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Sales (Sell → Sales or ⌘3).

---

## Flow Steps

### Step 1 — Start a new sale
**Action:** Use the Quick Start bar ("New Sale") or ⌘K command palette to begin a new sale. Select **Canyon Market** as the customer.
**Expected signal:** A new Draft sale row appears in the Sales grid with "Canyon Market" as the customer and status `Draft`.

### Step 2 — Open the Inventory Finder and locate the batch
**Action:** With the draft sale selected, open the InventoryFinderPanel or use the Add Line action. Find the Live batch created in prerequisites.
**Expected signal:** The Live batch appears in the finder with correct product name, available quantity, and price.

### Step 3 — Add the line item to the sale
**Action:** Select the batch from the finder and add it as a line item.
**Expected signal:** A line item row appears under the sale with product name, quantity, and a calculated price. Sale total updates.

### Step 4 — Confirm the sale
**Action:** Use the confirm action (row action menu, command palette, or confirm button).
**Expected signal:** Sale status advances to `Confirmed`. A toast confirms the action. Status is visible in the grid row without a page reload.

### Step 5 — Post the sale
**Action:** Use the post action on the confirmed sale.
**Expected signal:** Sale status advances to `Posted`. Toast confirms. Canyon Market's balance in Clients view increases by the sale amount.

### Step 6 — Verify the posted order
**Action:** Check the Orders view (Sell → Orders) for the newly posted order.
**Expected signal:** Order appears with status `Posted` or `Open`. Customer, product, quantity, and total match what was entered.

---

## Pass Criteria
- [ ] Draft sale created with Canyon Market as customer
- [ ] Live batch found via InventoryFinder and added as line item
- [ ] Sale advanced Draft → Confirmed → Posted with toasts at each step
- [ ] Posted order visible in Orders view with correct details
- [ ] Canyon Market balance increased by sale amount after posting

---

## Failure Modes to Watch For
- **No inventory in finder despite Live batches existing:** Filter or data loading issue
- **Silent confirm:** Status advances with no toast — UX gap
- **Balance not updating:** Client balance unchanged after posting — ledger bug
- **Order not visible in Orders view:** Data sync issue

---

## Related Flows
- `sales-operator/02-customer-credit-hold-edge.md` — edge case on this same flow
- `_cross-persona/01-purchase-to-payment-lifecycle.md` — this flow embedded in the full lifecycle
