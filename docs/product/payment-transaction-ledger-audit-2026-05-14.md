# Payment Transaction Ledger Audit

Date: 2026-05-14
Source screenshot: `/Users/evan/Library/Application Support/CleanShot/media/media_VW0WGMuUjn/CleanShot 2026-05-14 at 13.43.00.png`
Live app checked: `http://127.0.0.1:5173` Payments route
Current app screenshot: `/tmp/terp-agro-payment-ledger-current.png`

## Operator Contract From Screenshot And Notes

The operator is replacing a two-sided spreadsheet ledger:

- Receiving Ledger: `Date | Entity receiving cash from | Amount | Notes`
- Paying ledger: `Date | Entity paying cash to | Amount | Notes`

The TERP Agro version must keep that row-entry speed while adding system intelligence:

- Date defaults to today but remains editable.
- Transactions auto-add from normal workflows where money is already captured.
- Operators can still add manual rows directly in the ledger.
- The system knows the selected entity type: customer, vendor, staff, other.
- Transaction type options are filtered by entity type.
- Vendor transaction types include down payment, loan, and product payment.
- Product payment requires an adjacent allocation target: open PO or FIFO.
- Operators can customize or add transaction types from a sidebar action.
- Receiving and paying sides are collapsible so the operator can focus.

## Current TERP Agro Ledger Reality

TERP Agro already has useful money primitives:

- `payments`: customer-side money rows with `direction`, `category`, `method`, `amount`, `unappliedAmount`, `locationBucket`, `allocationIntent`, `impactPreview`, and notes.
- `payment_allocations`: links customer payments to invoices, including FIFO support through `allocatePayment`.
- `client_ledger_entries`: customer balance history for invoices, credits, and payment allocation effects.
- `vendor_bills` and `vendor_payments`: vendor-side payable and payout trail.
- `command_journal`: audit/reversal substrate for money commands.
- `QuickLedgerGrid`: draft row-entry surface with date autofill, amount, counterparty, document, allocation, impact, trace, and commit.
- `queries.paymentAllocationPreview`, `queries.vendorPayments`, `queries.relationshipSummary`, and `queries.grid('payments')` expose pieces of the current ledger.

But the current app does not match the screenshot's mental model:

- Payments route is customer/money-in first; vendor payouts are a separate bill/payment path.
- The posted Payments grid does not show paying-side vendor payments in the same ledger.
- Quick Ledger has one wide mixed row grid, not two collapsible receiving/paying ledgers.
- Entity type is implied by direction, not selected explicitly.
- Transaction type choices are hard-coded in the client.
- Vendor product payment targets vendor bills, not open POs or FIFO PO allocation.
- Custom transaction types have no persistent admin/sidebar model.
- Manual quick rows are draft-only UI state until committed; there is no saved incomplete ledger draft row.

## Reuse Vs Rebuild Decision

Do not rebuild the money-posting core. Reuse the existing audited commands, allocation logic, vendor bill/payable trail, command journal, and relationship summary data.

Rebuild the ledger surface and add a thin unified ledger layer. Reusing `QuickLedgerGrid` as-is would cost more than rebuilding the workbench because the new UX is two-sided, collapsible, entity-aware, and requires configurable transaction types. The right move is to reuse its patterns and helpers, not its component shape.

Recommended build shape:

- New or refactored `TransactionLedgerWorkbench` for Payments.
- New unified query, for example `queries.transactionLedger`, that returns normalized receiving and paying rows from `payments`, `vendor_payments`, `correction_journal_entries`, and future manual drafts.
- New transaction type registry, either a table or seed-backed config, with entity-type compatibility and default allocation behavior.
- Existing commands remain the posting authority: `logPayment`, `allocatePayment`, `createVendorBill`, `scheduleVendorPayment`, `recordVendorPayment`, and `createCorrectionJournalEntry`.
- Add small adapter commands only where existing commands cannot represent the ledger action, especially vendor product payment by open PO/FIFO and staff/other transactions.

## Atomic Backlog

1. Unified transaction ledger projection
   - Build a query that returns both receiving and paying rows in one normalized shape.
   - Include source type, source id, direction, date, entity label/id/type, amount, notes, method/bucket, transaction type, allocation target, status, and command id where available.

2. Two-sided collapsible ledger workbench
   - Replace the current Payments prelude layout with receiving and paying ledgers that can collapse independently.
   - Preserve dense table-first behavior; no wireframes or decorative panels.

3. Manual ledger row entry with editable autofilled date
   - Each side supports adding a row inline.
   - Date defaults to today, can be edited, and is posted through existing commands when possible.

4. Entity-aware transaction type selector
   - Selecting an entity sets entity type.
   - Transaction type dropdown changes based on entity type: customer, vendor, staff, other.

5. Vendor product payment allocation target
   - Vendor `product_payment` exposes the adjacent target column: open PO, specific PO, or FIFO.
   - If existing vendor bill flow is the right accounting backend, create or link payable rows from PO allocation without forcing the operator to start from the vendor bill screen.

6. Custom transaction type sidebar
   - Sidebar action allows adding/editing transaction types.
   - Type includes direction, allowed entity types, default method/bucket, default allocation behavior, and whether it requires approval.

7. Auto-add ledger rows from existing workflows
   - Posted customer payments, buyer credits/down payments, vendor payouts, correction entries, PO receipts/vendor bills, and approved/scheduled payout events appear automatically in the unified ledger.

8. Relationship and allocation carry-forward
   - Selecting customer/vendor/staff/other opens contextual drawer tabs with open invoices, open POs/payables, prior transactions, and allocation impact.

9. Audit and reversal continuity
   - Every committed ledger row links to command history and reversal/void/offset behavior appropriate to the source command.

10. Verification and migration fixtures
   - Seed fixtures must include screenshot-like small cash rows, vendor product payments, staff/other rows, customer payments, buyer credits, loans, and open PO FIFO cases.
   - E2E must cover manual row creation, auto-added rows, collapsible sides, entity-filtered transaction types, vendor product payment open PO/FIFO selection, and custom type creation.

## Non-Goals

- Do not replace audited posting commands with a free-form spreadsheet write path.
- Do not make the ledger a static spreadsheet clone; preserve row speed but keep command auditability.
- Do not expose sales price in procurement/payment allocation flows.
- Do not force every lightweight correction into PO/invoice allocation when it is genuinely staff/other/manual.

## Risk Notes

- Biggest accounting risk: a unified surface could hide that customer payments and vendor payouts currently have different backends.
- Biggest UX risk: too many dropdowns could slow the spreadsheet-like row entry this is meant to preserve.
- Biggest data-model risk: custom transaction types need enough structure to guide commands, not just display labels.
