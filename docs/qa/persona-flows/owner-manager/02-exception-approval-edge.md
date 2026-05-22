# Owner / Main Manager — Exception Approval (Edge Case)

## Meta
- **Persona:** Owner / Main Manager
- **Scenario type:** edge-case
- **Risk tier:** Deep QA
- **Command families touched:** CMD-SALES, CMD-PAYMENTS
- **Estimated run time:** 10–12 minutes
- **Last validated:** not yet run

---

## Persona Context
The Owner handles exceptions operators cannot self-approve. In this scenario, a
sale requires Owner approval before it can be confirmed or posted — either due to
a below-floor price, a credit override request, or another exception condition.

## Scenario
Tests the exception/approval path. If this path is not fully implemented, the
scenario documents the current state and files a product gap — it does NOT treat
a missing feature as a bug.

---

## Prerequisites
> App running. No specific seed entities required beyond existing customers.
> Setup: create a Draft sale at an unusually low price as described in Step 2.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Dashboard (⌘1), then Sales (⌘3).

---

## Flow Steps

### Step 1 — Look for an exception queue or approval-pending indicator
**Action:** Check the Dashboard and Sales view for any "pending approval," "exception," "below floor," or "requires review" indicator.
**Expected signal (feature exists):** A badge, queue count, or row status indicating an exception awaiting approval.
**Expected signal (feature not yet built):** No such indicator. Note as product gap and proceed to Step 2.

### Step 2 — Create a test sale at an unusually low price
**Action:** Create a new sale for Canyon Market. Add a line item and set the price to an unusually low value (e.g., $0.01/unit or significantly below any visible floor indicator).
**Expected signal:** System either (A) blocks the price entry with a floor warning, (B) flags the row with an exception indicator, or (C) accepts the price silently. Document which behavior occurs.

### Step 3 — Attempt to confirm the sale
**Action:** Try to confirm or post the low-price sale.
**Expected signal (good):** System blocks and surfaces an approval request path — a message directing the Owner, or a "Request approval" action.
**Expected signal (acceptable gap):** System allows the sale at any price with no floor enforcement. File as product gap in Linear (not a GitHub bug).

### Step 4 — If an approval path exists, complete it as the Owner
**Action:** Find the approval request (Dashboard queue, row action, or notification). Approve it.
**Expected signal:** After Owner approval, the sale can be confirmed and posted. The approval is logged in command history.

### Step 5 — Verify audit trail
**Action:** Check Recovery (Admin → Recovery) or the row's command history for the exception event.
**Expected signal:** The low-price sale and any exception/approval events are visible in command history with timestamps.

---

## Pass Criteria
- [ ] Current behavior of price floor system documented (enforced / not enforced / partial)
- [ ] If approval path exists: Owner can approve, sale proceeds, approval is audited
- [ ] If no approval path: finding filed as product gap in Linear (not GitHub)
- [ ] No silent acceptance of a $0 or negative-price sale that creates a corrupted invoice

---

## Failure Modes to Watch For
- **Silent zero-price acceptance:** $0 sale posts a $0 invoice with no flag — data integrity concern
- **Approval blocks but offers no path forward:** Exception blocked with no way to resolve — High UX gap
- **Approval not audited:** Owner approves but no record in command history — audit integrity bug

---

## Related Flows
- `sales-operator/01-instant-sale-normal.md` — normal sale for baseline comparison
- `owner-manager/03-period-closeout-full-lifecycle.md` — another Owner decision flow
