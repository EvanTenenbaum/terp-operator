# Payments / Accounting — Vendor Bill Payment Lifecycle (Full Lifecycle)

## Meta
- **Persona:** Payments / Accounting Operator
- **Scenario type:** full-lifecycle
- **Risk tier:** Critical
- **Command families touched:** CMD-VENDOR, CMD-PAYMENTS
- **Estimated run time:** 12–15 minutes
- **Last validated:** not yet run

---

## Persona Context
The Payments/Accounting Operator manages vendor bills: creating them, approving them,
scheduling payment, and recording payment. Each stage must produce a clear ledger entry
with a traceable source bill reference. A vendor bill paid without a proper audit trail
creates reconciliation problems.

## Scenario
Full vendor bill lifecycle: create a bill, approve it, schedule it, record payment,
and verify the full audit trail. This is a Critical-tier flow because it touches
financial records that must be accurate.

---

## Prerequisites
> Use **Emerald Triangle Supply** as the vendor (exists in seed data).
> No prior bills need to exist — this flow creates a new one.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Emerald Triangle Supply confirmed in Vendors/Vendor Payouts view
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Vendor Payouts (Money → Vendor Payouts).

---

## Flow Steps

### Step 1 — Create a new vendor bill
**Action:** Create a new vendor bill for **Emerald Triangle Supply**. Set amount to $500.00, due date to 30 days from today, description "Test Bill - Flower delivery".
**Expected signal:** A new bill row appears in the Vendor Payouts grid with vendor "Emerald Triangle Supply", amount $500.00, status `Draft` or `Created`.

### Step 2 — Approve the bill
**Action:** Select the bill and approve it.
**Expected signal:** Bill status advances to `Approved`. Toast confirms. The bill is now eligible for scheduling.

### Step 3 — Schedule the bill for payment
**Action:** Schedule the approved bill for payment (set a payment date).
**Expected signal:** Bill status advances to `Scheduled`. The payment date is visible on the row.

### Step 4 — Record the payment
**Action:** Record payment of the scheduled bill (mark as paid). Enter payment method and reference if required.
**Expected signal:** Bill status advances to `Paid`. Toast confirms. A vendor payment ledger entry is created referencing this bill.

### Step 5 — Verify the ledger entry
**Action:** Look for the vendor payment in the ledger or payment history. This may be in the Vendor Payouts history, Payments view, or a vendor-specific ledger.
**Expected signal:** A ledger entry exists showing $500.00 paid to Emerald Triangle Supply with a reference to the bill created in Step 1. The source bill is traceable.

### Step 6 — Verify idempotency — attempt to pay the bill again
**Action:** Find the paid bill and attempt to pay it again.
**Expected signal:** System blocks the second payment with a message indicating the bill is already paid. No duplicate payment ledger entry is created.

---

## Pass Criteria
- [ ] Bill created, approved, scheduled, and paid without errors
- [ ] Each status transition visible as explicit grid label
- [ ] Vendor payment ledger entry created with source bill reference
- [ ] Second payment attempt blocked (idempotency)
- [ ] No duplicate payment entries after idempotency test

---

## Failure Modes to Watch For
- **Phantom payment on re-pay attempt:** Critical — idempotency failure creates duplicate ledger entry
- **Ledger entry missing source bill reference:** High — payment not traceable to its bill
- **Status doesn't advance:** High — bill stuck at a status despite command execution
- **No toast on payment confirmation:** Medium UX gap

---

## Related Flows
- `payments-accounting/01-log-and-allocate-payment-normal.md` — customer payment counterpart
- `_cross-persona/01-purchase-to-payment-lifecycle.md` — full chain including vendor payment
