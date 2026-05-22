# Connector Actor — Request Routing (Edge Case)

## Meta
- **Persona:** Connector Actor
- **Scenario type:** edge-case
- **Risk tier:** Normal
- **Command families touched:** CMD-CONNECTOR
- **Estimated run time:** 6–8 minutes
- **Last validated:** not yet run

---

## Persona Context
A connector request has arrived and needs to be routed to a specific operator or queue —
not just generically approved. The reviewing operator needs to see the available
routing destinations before committing, to ensure the request goes to the right place.

## Scenario
Tests the routing path: verify that available routing destinations are visible before
a route is confirmed, and that the routed request shows its destination.

---

## Prerequisites
> A connector record must exist (see flow 01 Prerequisites).
> A pending connector request should exist — use flow 01 to create one if needed.

---

## Pre-Run Checklist
- [ ] Connector record and at least one pending request exist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Processors (Money → Processors).

---

## Flow Steps

### Step 1 — Find a pending connector request
**Action:** In the Processors view, find a request with status Pending.
**Expected signal:** Pending request visible with source, type, and timestamp.

### Step 2 — Initiate routing (do not confirm yet)
**Action:** Select the "Route" action (or equivalent) on the pending request. Before confirming, examine what routing destinations are available.
**Expected signal:** A list of routing destinations is shown — e.g., Sales queue, Intake queue, specific operators, or other connectors. If only a generic "Route" button exists with no destination selection, note as a UX gap.

### Step 3 — Select a specific routing destination
**Action:** Choose a specific routing destination from the available options.
**Expected signal:** The selected destination is confirmed before submission (shown in a preview or confirmation step).

### Step 4 — Confirm the routing
**Action:** Confirm the routing.
**Expected signal:** Request status changes to Routed. The routing destination is visible on the request row after routing (not just in a transient confirmation).

### Step 5 — Verify the routed request is traceable
**Action:** Find the routed request in the Processors view or its destination queue.
**Expected signal:** The request shows its routing destination. A reviewer can see where it went without checking Recovery.

---

## Pass Criteria
- [ ] Routing destinations visible before confirmation
- [ ] Specific destination selectable (not just generic Route)
- [ ] Request shows routing destination after routing is complete
- [ ] Routed request traceable without Recovery lookup

---

## Failure Modes to Watch For
- **Route action with no destination selection:** Medium UX gap
- **Routing destination not visible on request row after routing:** Audit trail gap
- **Routed request disappears from Processors view:** Traceability bug

---

## Related Flows
- `connector-actor/01-submit-connector-request-normal.md` — creates the request to route
