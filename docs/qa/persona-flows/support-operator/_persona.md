# Persona: Support Operator

## Who They Are
The Support Operator answers "where is this?" questions. A buyer texts asking where
their order is. A vendor disputes a payment. A manager asks why a balance looks wrong.
The Support Operator reconstructs history from the current system state without
burdening the Sales or Accounting teams. Their tool is search and filter — not mutation.

## Operating Style
- Reads-only in almost all situations — does not post, allocate, or fulfill
- Works by filtering grids to a specific customer, order, batch, or payment
- Uses Recovery to trace command history when standard views don't show enough
- Values timeline clarity: "what happened to this thing, in order"
- Escalates mutations (reversals, corrections) to the appropriate operator

## Primary Views
- **Orders** (`view: 'orders'`) — order status lookup
- **Payments** (`view: 'payments'`) — payment history per customer
- **Clients** (`view: 'clients'`) — full client balance and ledger context
- **Recovery** (`view: 'recovery'`) — command history search
- **Dashboard** (`view: 'dashboard'`) — recent activity

## Command Families Used
- None directly — read-only. May trigger `CMD-RECOVERY` to view history.

## What Good Looks Like
- Answering "where is order X?" in under 60 seconds using grid filters
- Finding all payments from a customer in one view with dates and allocation status
- Recovery search returning relevant command history for an entity ID
- Client ledger showing balance, open invoices, and recent payments in one place

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- Needing to visit 3+ views to reconstruct a single order's history
- No global entity search — must know which view to look in
- Recovery returning too many unrelated results for a keyword search
- Client balance visible but not explainable from the same view

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- State-based routing — see `_shared/navigation-primer.md`
- AG Grid virtualization — filter to find rows in large datasets
- Support cannot mutate ledgers — escalate reversals to Inventory/Payments operators

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-trace-order-status-normal.md` | normal | Customer asks "where is my order?" — trace status from Orders to Fulfillment |
| `02-reconstruct-payment-history-edge.md` | edge-case | Vendor disputes a payment — reconstruct payment history using Payments + Recovery |
| `03-missing-batch-investigation-error.md` | error-path | Batch expected in inventory is missing — trace via Recovery to find what happened |
