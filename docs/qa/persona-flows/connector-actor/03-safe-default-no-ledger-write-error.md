# Connector Actor — Safe Default: No Ledger Write Before Approval (Error Path)

## Meta
- **Persona:** Connector Actor
- **Scenario type:** error-path
- **Risk tier:** Deep QA
- **Command families touched:** CMD-CONNECTOR
- **Estimated run time:** 8–10 minutes
- **Last validated:** not yet run

---

## Persona Context
A fundamental safety property of the Connector system is that submitted requests
do NOT mutate the financial ledger until explicitly approved by an internal operator.
This flow verifies that property holds: a submitted but unapproved connector request
creates no invoices, no payments, no balance changes, and no inventory mutations.

## Scenario
Submit a connector request. Before approving it, verify no financial state was changed.
Then approve it and verify NOW the appropriate state change occurs (or confirm it still
doesn't — document which behavior the system actually implements).

---

## Prerequisites
> Connector record must exist (see flow 01 Prerequisites).
> Note Canyon Market's current balance before starting.

---

## Pre-Run Checklist
- [ ] Connector record confirmed
- [ ] Canyon Market balance noted (navigate to Clients and record current balance)
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Processors (Money → Processors).

---

## Flow Steps

### Step 1 — Submit a connector request (do NOT approve)
**Action:** Submit a new connector request for Canyon Market (or the customer associated with the connector). Leave it in Pending/Submitted status — do NOT approve or route it.
**Expected signal:** Request appears in the Processors queue with status Pending. No approval action has been taken.

### Step 2 — Check Payments view for any new entries
**Action:** Navigate to Payments (⌘4). Filter for Canyon Market.
**Expected signal:** No new payment entry exists from the connector request. The pending request has not created any payment record.

### Step 3 — Check Canyon Market's balance in Clients view
**Action:** Navigate to Clients. Find Canyon Market. Compare current balance to the pre-test balance noted in Prerequisites.
**Expected signal:** Balance is unchanged. The pending connector request has not altered the client balance.

### Step 4 — Check Orders view for any new entries
**Action:** Navigate to Orders (Sell → Orders). Filter for Canyon Market.
**Expected signal:** No new order entry from the connector request. The pending request has not created an order.

### Step 5 — Return to Processors and approve the request
**Action:** Navigate back to Processors. Approve the pending connector request.
**Expected signal:** Request status changes to Approved. If the connector request was intended to trigger a sale or payment, observe whether that now occurs. If no downstream action occurs even after approval, document this as a product gap (Linear) — the approval may not yet be wired to downstream processing.

### Step 6 — Re-check financial state after approval
**Action:** Check Payments, Orders, and Canyon Market balance again after approval.
**Expected signal:** Document what changed (if anything) after approval. The key result of this flow is documenting the before/after state accurately.

---

## Pass Criteria
- [ ] No Payments entry created before approval
- [ ] No Orders entry created before approval
- [ ] Canyon Market balance unchanged before approval
- [ ] Approval action available and executes
- [ ] Before/after state accurately documented

---

## Failure Modes to Watch For
- **Payment or order created before approval:** Critical — connector bypassed safe-default property
- **Balance changed before approval:** Critical — ledger mutation without operator action
- **No downstream action after approval:** Acceptable gap — document in Linear as approval not yet wired
- **"No ledger write yet" not visible on pending request:** High UX gap — operators acting blind

---

## Related Flows
- `connector-actor/01-submit-connector-request-normal.md` — baseline connector flow
- `payments-accounting/01-log-and-allocate-payment-normal.md` — the legitimate payment path for comparison
