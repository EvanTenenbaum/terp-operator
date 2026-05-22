# Cross-Persona — Full Purchase-to-Payment Lifecycle

## Meta
- **Persona:** Cross-persona (Inventory Operator → Sales Operator → Warehouse Operator → Payments/Accounting)
- **Scenario type:** cross-persona
- **Risk tier:** Critical
- **Command families touched:** CMD-PO, CMD-INTAKE, CMD-SALES, CMD-FULFILLMENT, CMD-PAYMENTS
- **Estimated run time:** 20–25 minutes
- **Last validated:** not yet run

---

## Scenario

Tests the full commercial lifecycle of a single unit of product: from purchase order
through intake, inventory, sales order, fulfillment, and final payment allocation.
Verifies that each handoff between persona domains produces consistent state —
no phantom records, correct status progressions, and accurate financial ledger entries
at the end.

---

## Prerequisites

> See `_shared/seed-state-reference.md` for available entity names.
>
> Required entities:
> - One vendor (use **Emerald Triangle Supply**)
> - One customer in good standing (use **Canyon Market** — $0 balance, $905,000 limit)

No Live batches are required at start — this flow creates them via PO + Intake.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Canyon Market and Emerald Triangle Supply confirmed in their respective views
- [ ] Linear MCP available? If not, write stubs to `docs/qa/runs/YYYY-MM-DD-linear-pending.md`

---

## Starting State

Navigate to Purchase Orders (Procure → Purchase Orders).
You are beginning as the **Inventory Operator** persona.

---

## Flow Steps

### Step 1 — [Inventory Operator] Create a new Purchase Order
**Action:** Create a new PO for **Emerald Triangle Supply**. Add one line item: product name "Test Flower", quantity 50 units, unit cost $10.00. Save as Draft.
**Expected signal:** A new PO row appears in the Purchase Orders grid with vendor "Emerald Triangle Supply" and status `Draft`. Line item visible.

### Step 2 — [Inventory Operator] Finalize and approve the PO
**Action:** Finalize the PO (advance from Draft), then approve it.
**Expected signal:** PO status advances to `Approved`. No error toasts. Line items are locked for editing.

### Step 3 — [Inventory Operator] Receive the PO into Intake
**Action:** Use the "Receive" or "Receive against PO" action on the approved PO. Navigate to Intake (⌘2) to confirm receiving rows were created.
**Expected signal:** Intake rows appear referencing the PO and vendor "Emerald Triangle Supply". Status is `Draft` or `Ready`.

### Step 4 — [Inventory Operator] Process the intake receipt
**Action:** Mark the intake rows Ready if needed, then post/process the receipt.
**Expected signal:** Toast confirms the receipt was processed. Navigate to Inventory (⌘5) — a new batch appears with product "Test Flower", status `Live`, quantity 50.

### Step 5 — [Sales Operator] Create a sale using the new inventory
**Action:** Switch to Sales persona. Navigate to Sales (⌘3). Create a new sale for **Canyon Market**. Add a line item selecting the "Test Flower" batch from Step 4.
**Expected signal:** Draft sale row with Canyon Market as customer. Line item shows "Test Flower", quantity, and a calculated price.

### Step 6 — [Sales Operator] Confirm and post the sale
**Action:** Confirm the sale, then post it.
**Expected signal:** Sale status advances to `Posted`. Toast confirms. An invoice/transaction ledger entry is created. Canyon Market's balance in Clients view increases by the sale amount.

### Step 7 — [Warehouse Operator] Fulfill the order
**Action:** Switch to Warehouse Operator persona. Navigate to Fulfillment (Sell → Fulfillment). Find the fulfillment row for the Canyon Market order. Enter actual weight/pack details and mark the order fulfilled.
**Expected signal:** Fulfillment row status changes to `Fulfilled`. Order in Orders view changes to `Fulfilled`. Inventory batch quantity for "Test Flower" decreases by the fulfilled amount.

### Step 8 — [Payments/Accounting] Log and allocate payment
**Action:** Switch to Payments/Accounting persona. Navigate to Payments (⌘4). Log a payment from Canyon Market for the full invoice amount. Allocate it to the invoice from Step 6.
**Expected signal:** Payment logged and allocated. Canyon Market's balance in Clients view returns to $0 or near $0. No unapplied balance remains.

### Step 9 — Verify end-state consistency
**Action:** Check four surfaces: (1) Inventory — "Test Flower" quantity reflects fulfillment, (2) Orders view — order shows `Fulfilled`, (3) Clients — Canyon Market balance at $0, (4) Payments — payment fully allocated.
**Expected signal:** All four checks pass. No orphaned Draft rows for this transaction chain.

---

## Pass Criteria
- [ ] PO created, finalized, and approved without error
- [ ] Intake processed, batch appeared in Inventory with status `Live` and correct quantity
- [ ] Sale posted, invoice created, Canyon Market balance increased
- [ ] Fulfillment completed, inventory quantity decreased correctly
- [ ] Payment logged and fully allocated, Canyon Market balance back to $0
- [ ] No phantom rows, duplicate invoices, or orphaned Drafts at any stage
- [ ] All status transitions visible as explicit grid labels (not color-only)

---

## Failure Modes to Watch For
- **Batch not appearing after intake:** Critical — intake processed but Inventory unchanged
- **Inventory quantity not decreasing after fulfillment:** Critical — fulfillment marked complete but inventory unchanged
- **Client balance not updating after payment:** High — payment logged but balance unchanged
- **Duplicate invoice on re-post:** Critical — idempotency failure
- **Status stall at any step:** High — command execution failure

---

## Findings Format
```
FINDING: [description]
Severity: [Critical | High | Medium | Low]
Step: [N]
Observed: [what happened]
Expected: [what should have happened]
Evidence: [screenshot at docs/qa/runs/screenshots/YYYYMMDD-cross-persona-step[N]-[slug].png]
```

---

## Related Flows
- `inventory-operator/01-receive-batch-normal.md` — isolated intake flow
- `sales-operator/01-instant-sale-normal.md` — isolated sale flow
- `warehouse-operator/01-pick-weigh-fulfill-normal.md` — isolated fulfillment flow
- `payments-accounting/01-log-and-allocate-payment-normal.md` — isolated payment flow
