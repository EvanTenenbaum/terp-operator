# Connector Actor — Submit Connector Request (Normal Path)

## Meta
- **Persona:** Connector Actor
- **Scenario type:** normal
- **Risk tier:** Normal
- **Command families touched:** CMD-CONNECTOR
- **Estimated run time:** 6–8 minutes
- **Last validated:** not yet run

---

## Persona Context
A connector (external surface) is submitting a request to the operator. The request
should land in the Processors/Connector review queue where an operator can act on it.
The connector itself cannot mutate any ledger — it can only submit for review.

## Scenario
Create a connector record (if not present), submit a test connector request, and
verify the request appears in the Processors queue for review. Then approve or route it.

---

## Prerequisites
> **A connector record must be created manually before this flow.**
> Navigate to Money → Processors. Check if any connectors/processors are listed.
> If none exist, create one: click "Add Processor" or equivalent, name it
> "Test Connector", set type to a connector type, and save.
> Note the connector name for use in the flow.

---

## Pre-Run Checklist
- [ ] A connector/processor record exists in Money → Processors
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Processors (Money → Processors).

---

## Flow Steps

### Step 1 — Confirm connector record exists
**Action:** In the Processors view, verify the "Test Connector" (or named connector) is listed.
**Expected signal:** The connector appears with its name and type visible.

### Step 2 — Submit a test connector request
**Action:** Submit a test request through the connector. This may be via: a "Submit Request" action on the connector row, a dedicated connector request form, or a Quick Start action.
Note: if the submission surface is an external/mobile surface, document what is visible from the internal Processors view instead.
**Expected signal:** Either: (A) a request submission form appears and accepts input, OR (B) the Processors view shows how an incoming connector request would appear. If the submission UI is not accessible from the main console, note as known — document the review side.

### Step 3 — Verify the request appears in the queue
**Action:** Check the Processors/Connector view for the submitted request (or existing requests if submission was not possible from the main console).
**Expected signal:** Request row(s) are visible with: connector name, request type, status (Pending/Submitted), and timestamp. If no requests are visible, check if there is a separate connector requests view or inbox.

### Step 4 — Review the request details
**Action:** Select a request row and examine its details.
**Expected signal:** Request details are visible: what was requested, who submitted it, when, and current status. A "no ledger write yet" indicator or equivalent should be visible — the request has not mutated any financial records yet.

### Step 5 — Approve or route the request
**Action:** Approve the request (or route it to the appropriate operator queue).
**Expected signal:** Request status changes from Pending to Approved/Routed. Toast confirms. The request is traceable after approval.

---

## Pass Criteria
- [ ] Connector record confirmed in Processors view
- [ ] Connector request visible in the review queue (submitted or pre-existing)
- [ ] Request details readable: source, type, status, timestamp
- [ ] "No ledger write" state visible before approval
- [ ] Approval/routing action available and executes without error

---

## Failure Modes to Watch For
- **No connector requests visible despite connector record existing:** Routing/display bug
- **Approved and Routed actions indistinguishable:** UX gap
- **No "pre-approval / no ledger write" state visible:** High gap — operators may act on incorrect assumptions
- **Request disappears after approval with no trace:** Audit trail bug

---

## Related Flows
- `connector-actor/02-request-routing-edge.md` — routing-specific edge case
- `connector-actor/03-safe-default-no-ledger-write-error.md` — verifying no premature ledger write
