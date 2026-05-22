# Payments / Accounting — Unapplied Balance (Edge Case)

## Meta
- **Persona:** Payments / Accounting Operator
- **Scenario type:** edge-case
- **Risk tier:** Deep QA
- **Command families touched:** CMD-PAYMENTS
- **Estimated run time:** 10–12 minutes
- **Last validated:** not yet run

---

## Persona Context
A payment was logged without allocation — either because FIFO failed (known issue DYN-H3)
or because the operator chose "unapplied" as the intent. The operator must now find
the unapplied balance and manually allocate it to the correct invoice.

## Scenario
Tests the unapplied balance identification and manual allocation path. Verifies that
unapplied payments are surfaced prominently enough to find and that manual allocation
works correctly.

---

## Prerequisites
> An unapplied payment must exist. Either:
> (A) Run flow 01 and confirm FIFO didn't auto-allocate (leaving an unapplied balance), OR
> (B) Log a new payment with Canyon Market with allocation intent set to "Unapplied".
> Also requires an open invoice for Canyon Market.

---

## Pre-Run Checklist
- [ ] An unapplied payment for Canyon Market exists in Payments view
- [ ] An open invoice for Canyon Market exists
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Payments (⌘4).

---

## Flow Steps

### Step 1 — Identify the unapplied payment
**Action:** In the Payments view, look for unapplied payments — filter by customer "Canyon Market" or look for an "Unapplied" status indicator.
**Expected signal:** The unapplied payment is visible and clearly labeled as unapplied (not buried in the grid or labeled ambiguously). If it requires multiple filter steps to find, note as a Medium friction finding.

### Step 2 — Examine the unapplied payment details
**Action:** View the details of the unapplied payment — amount, date, payment method.
**Expected signal:** All payment details are visible. The unapplied amount is clear.

### Step 3 — Manually allocate the payment to an invoice
**Action:** Select the unapplied payment and initiate manual allocation. Choose the open invoice for Canyon Market to allocate against.
**Expected signal:** An allocation dialog or inline action appears showing the available invoice(s). Select the correct invoice.

### Step 4 — Confirm the allocation
**Action:** Confirm the allocation.
**Expected signal:** Toast confirms allocation. Payment status changes from "Unapplied" to "Allocated". The unapplied balance clears.

### Step 5 — Verify Canyon Market's balance
**Action:** Navigate to Clients and check Canyon Market's balance.
**Expected signal:** Balance decreased by the allocated amount. No unapplied balance remains for Canyon Market.

---

## Pass Criteria
- [ ] Unapplied payment identifiable in Payments view without excessive searching
- [ ] Manual allocation path accessible and functional
- [ ] Payment status changes from Unapplied to Allocated after allocation
- [ ] Canyon Market balance decreased by payment amount
- [ ] No unapplied balance remains after successful allocation

---

## Failure Modes to Watch For
- **Unapplied payment not visible or hard to find:** Medium friction — surfacing is inadequate
- **Manual allocation fails:** High — core payment functionality blocked
- **Balance label ambiguous:** "Unapplied balance" not clearly distinguished from "credit balance" — Medium UX gap
- **Balance not updating after allocation:** Critical — allocation executed but balance unchanged

---

## Related Flows
- `payments-accounting/01-log-and-allocate-payment-normal.md` — the flow that creates the unapplied balance
