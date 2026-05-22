# Payments / Accounting — Log and Allocate Payment (Normal Path)

## Meta
- **Persona:** Payments / Accounting Operator
- **Scenario type:** normal
- **Risk tier:** Deep QA
- **Command families touched:** CMD-PAYMENTS
- **Estimated run time:** 8–10 minutes
- **Last validated:** not yet run

---

## Persona Context
A customer payment has arrived. The Payments/Accounting Operator logs it, selects
FIFO allocation to apply it to the oldest open invoice, and verifies the client
balance decreases by the payment amount.

## Scenario
Happy-path payment: log a payment from Canyon Market, allocate it FIFO, and verify
the balance update. Requires an open invoice to allocate against.

---

## Prerequisites
> An open invoice for Canyon Market must exist. Complete `sales-operator/01-instant-sale-normal.md`
> first to create a posted sale and its invoice. Note the invoice amount.
> Use **Canyon Market** as the customer.

---

## Pre-Run Checklist
- [ ] At least one open invoice exists for Canyon Market (from a posted sale)
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Payments (Money → Payments or ⌘4).

---

## Flow Steps

### Step 1 — Note Canyon Market's current balance
**Action:** Before logging the payment, navigate to Clients and note Canyon Market's current balance. Then return to Payments.
**Expected signal:** Balance is a positive number (outstanding from the posted sale). Note this number for verification in Step 6.

### Step 2 — Begin logging a payment
**Action:** Use the "Money in" Quick Start button or the log payment action in the Payments view. Select **Canyon Market** as the customer.
**Expected signal:** A payment entry form or draft row appears with Canyon Market selected.

### Step 3 — Enter payment details
**Action:** Enter payment amount equal to the invoice amount (noted in prerequisites). Select payment method (e.g., cash or check). Select allocation intent: FIFO.
**Expected signal:** Payment details are filled in. FIFO allocation is selected.

### Step 4 — Submit the payment
**Action:** Log/submit the payment.
**Expected signal:** Toast confirms payment logged. A payment row appears in the Payments grid with Canyon Market's name, the amount, and a status indicating it was received.

### Step 5 — Check allocation status
**Action:** Examine the payment row or find the allocation status. If FIFO didn't auto-allocate, manually allocate to the open invoice.
**Expected signal (ideal):** Payment is automatically allocated to the oldest open invoice. Allocation status shows "Allocated" or equivalent.
**Expected signal (known issue):** FIFO did not auto-allocate (known issue DYN-H3). Manually allocate — note this is a known issue, do NOT re-file. Manual allocation should succeed.

### Step 6 — Verify Canyon Market's balance decreased
**Action:** Navigate to Clients. Find Canyon Market. Check their current balance.
**Expected signal:** Balance is now $0 (or near $0 if rounding). It decreased by the payment amount logged in Step 3.

---

## Pass Criteria
- [ ] Payment logged with Canyon Market, correct amount, FIFO intent
- [ ] Payment allocated to open invoice (automatically or manually)
- [ ] Canyon Market balance decreased by payment amount
- [ ] Allocation visible with status "Allocated" (not "Unapplied")

---

## Failure Modes to Watch For
- **FIFO doesn't auto-allocate:** Known issue DYN-H3 — note but do not re-file
- **Balance unchanged after allocation:** Critical — allocation succeeded but balance not updated
- **Duplicate payment logged on retry:** Idempotency issue — check for double entries
- **Allocation fails on manual attempt:** High — blocking the core payment flow

---

## Related Flows
- `sales-operator/01-instant-sale-normal.md` — prerequisite: creates the invoice
- `payments-accounting/02-unapplied-balance-edge.md` — what happens if FIFO skipped
