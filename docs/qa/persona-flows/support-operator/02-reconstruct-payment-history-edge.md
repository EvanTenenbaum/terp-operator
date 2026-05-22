# Support Operator — Reconstruct Payment History (Edge Case)

## Meta
- **Persona:** Support Operator
- **Scenario type:** edge-case
- **Risk tier:** Normal
- **Command families touched:** — (read-only)
- **Estimated run time:** 6–8 minutes
- **Last validated:** not yet run

---

## Persona Context
A vendor or customer is disputing a payment — claiming they paid more or less than
the system shows. The Support Operator needs to reconstruct the full payment history
using the Payments view and Recovery, without making any changes.

## Scenario
Reconstruct the complete payment history for Canyon Market: find all payments, their
allocation status, and verify the history matches the current client balance. Use
Recovery to fill in gaps the standard view doesn't show.

---

## Prerequisites
> At least one payment for Canyon Market must exist (from
> `payments-accounting/01-log-and-allocate-payment-normal.md`).

---

## Pre-Run Checklist
- [ ] At least one logged payment for Canyon Market exists
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Payments (⌘4).

---

## Flow Steps

### Step 1 — Find all payments for Canyon Market
**Action:** In the Payments view, filter or search for Canyon Market. Find all payment rows.
**Expected signal:** Payment rows are visible with amount, date, payment method, and allocation status. All payments for Canyon Market are returned.

### Step 2 — Note payment details
**Action:** For each payment row, note: date, amount, allocation status (allocated/unapplied), and the invoice it was applied to (if visible).
**Expected signal:** Allocation status is clearly labeled per row. The applied invoice reference is visible (or accessible from the row).

### Step 3 — Cross-reference with client balance
**Action:** Navigate to Clients (Sell → Client Ledger). Find Canyon Market. Note their current balance.
**Expected signal:** The balance matches the sum of (invoices - payments) based on the payment history noted in Step 2. If the math doesn't reconcile, note as a data consistency finding.

### Step 4 — Check Recovery for additional context
**Action:** Navigate to Recovery (Admin → Recovery). Search for "Canyon Market" or the payment IDs noted in Step 2.
**Expected signal:** The logPayment and allocatePayment commands appear in Recovery history with timestamps. This confirms the system's audit trail matches the visible payment data.

### Step 5 — Document the reconstructed history
**Action:** Write a brief summary of Canyon Market's payment history as you would tell it to the vendor/customer: "You paid $X on [date], allocated to invoice [Y]. Balance is now $Z."
**Expected signal:** All the information needed for this summary was obtainable from the system in under 8 minutes.

---

## Pass Criteria
- [ ] All Canyon Market payments found in Payments view by filter
- [ ] Allocation status and invoice reference visible per payment row
- [ ] Client balance mathematically reconciles with payment history
- [ ] Recovery shows payment command history for audit trail
- [ ] Complete history reconstructable in under 8 minutes

---

## Failure Modes to Watch For
- **Payments not filterable by customer:** High UX gap
- **Allocation status not shown per payment:** Medium UX gap
- **Balance doesn't reconcile with payment history:** Data integrity bug
- **Recovery has no payment command history:** Audit trail gap

---

## Related Flows
- `payments-accounting/01-log-and-allocate-payment-normal.md` — creates the payments being traced
