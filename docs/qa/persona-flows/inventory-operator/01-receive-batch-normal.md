# Inventory Operator — Receive Batch (Normal Path)

## Meta
- **Persona:** Inventory Operator
- **Scenario type:** normal
- **Risk tier:** Normal
- **Command families touched:** CMD-INTAKE, CMD-PO
- **Estimated run time:** 8–10 minutes
- **Last validated:** not yet run

---

## Persona Context
A vendor delivery has arrived. The Inventory Operator needs to create intake rows,
verify the product details match the delivery, mark the rows ready, and post the
receipt. After posting, the batch must appear in Inventory as Live.

## Scenario
Happy-path receiving: create intake rows for a vendor delivery, mark them ready,
process the receipt, and verify the batch appears in Inventory with correct status
and quantity.

---

## Prerequisites
> Use **Emerald Triangle Supply** as the vendor (active vendor in seed data).
> No existing Live batches required — this flow creates one.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Intake (Procure → Intake or ⌘2).

---

## Flow Steps

### Step 1 — Create intake rows for the delivery
**Action:** Use the Quick Start bar "Receive" button or the Add Row action in the Intake grid to create new intake rows. Set vendor to **Emerald Triangle Supply**, product name to "Intake Test Flower", quantity to 25 units, unit cost to $12.00.
**Expected signal:** New intake row(s) appear in the Intake grid with the vendor name, product name, quantity, and cost. Status should be `Draft`.

### Step 2 — Fill in required fields
**Action:** Verify all required fields are filled: vendor, product name, quantity, unit cost, and any required category or lot information. Complete any empty required fields inline.
**Expected signal:** All required fields populated. No validation warnings visible on the row.

### Step 3 — Mark rows as Ready
**Action:** Select the intake row(s) and mark them Ready (via row action menu or keyboard shortcut).
**Expected signal:** Row status advances to `Ready`. The row remains in the Intake grid — it has NOT been posted yet.

### Step 4 — Process (post) the receipt
**Action:** Select the Ready row(s) and process/post the receipt.
**Expected signal:** A toast confirms the receipt was processed. The intake rows may move to a "Received" or archived status in the Intake grid.

### Step 5 — Verify the batch appeared in Inventory
**Action:** Navigate to Inventory (⌘5). Search or filter for "Intake Test Flower".
**Expected signal:** A new batch row appears with product "Intake Test Flower", status `Live`, available quantity 25, vendor "Emerald Triangle Supply".

### Step 6 — Verify batch details are correct
**Action:** Examine the batch row in Inventory for accuracy.
**Expected signal:** Unit cost ($12.00), quantity (25), vendor (Emerald Triangle Supply), and status (Live) all match what was entered in Intake. No data corruption.

---

## Pass Criteria
- [ ] Intake rows created with correct vendor, product, quantity, cost
- [ ] Rows marked Ready without auto-posting
- [ ] Receipt processed with a confirming toast
- [ ] Batch appears in Inventory with status `Live` and correct quantity
- [ ] Batch details match intake data exactly

---

## Failure Modes to Watch For
- **Batch not appearing after posting:** Critical — intake processed but Inventory unchanged
- **Wrong quantity in Inventory:** Data transformation error during posting
- **No toast on post:** Silent posting — UX gap
- **Rows auto-posted on mark Ready:** Incorrect behavior — posting should be a separate action

---

## Related Flows
- `inventory-operator/02-flagged-batch-edge.md` — edge case on this same flow
- `_cross-persona/01-purchase-to-payment-lifecycle.md` — this flow embedded in the full lifecycle
