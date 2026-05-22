# Persona: Connector Actor

## Who They Are
The Connector Actor is a VIP, live, or mobile surface that submits requests to
TERP Operator but does NOT directly mutate the ledger. They might be a driver
submitting a delivery confirmation, a remote buyer placing a request, or an
external system sending an order. Their requests land in the Connector review queue
for a human operator to route, approve, or reject.

## Operating Style
- Submits requests via a Connector surface (not the main operator console)
- Cannot post sales, allocate payments, or reverse commands
- Expects a confirmation that their request was received
- Their requests are visible in the Processors/Connector view for internal operators

## Primary Views
- **Processors** (`view: 'processors'`) — where connector requests are reviewed by operators

## Command Families Used
- `CMD-CONNECTOR` — submitConnectorRequest (review/routing only; no ledger mutations)

## What Good Looks Like
- A submitted request appears in the Processors view for review within seconds
- The request can be approved, rejected, or routed without mutating the ledger first
- Review history is visible on the request row
- "No ledger write yet" state is explicitly visible — operator knows no financial action has occurred

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- Approved and Routed actions look identical — operator cannot tell the difference
- No review history visible on the request row
- Request disappears from queue after approval with no trace
- "Ledger not yet written" state not surfaced clearly to the reviewing operator

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- **Connector record must exist before any connector flows can run.** This is NOT
  created by the seed. Create a connector via Money → Processors before running
  any scenario in this directory. See Prerequisites in each scenario file.
- State-based routing — see `_shared/navigation-primer.md`

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-submit-connector-request-normal.md` | normal | Submit a connector request; verify it appears in Processors queue for review |
| `02-request-routing-edge.md` | edge-case | Route a request to a specific destination; verify routing destination is visible before confirming |
| `03-safe-default-no-ledger-write-error.md` | error-path | Verify no ledger entry created when a connector request is submitted but not yet approved |
