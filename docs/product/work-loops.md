# TERP Agro Work Loops

Date: 2026-05-12
Status: active PM map

The work loops are the organizing model for frontend, backend, QA, and roadmap sequencing. They keep TERP Agro from becoming a pile of pages and commands.

## Loop 1: Buy

Operator moment: the office decides what to purchase before physical product arrives.

Core entities:

- Purchase orders
- Purchase order lines
- Vendors
- Pricing/cost expectations
- Expected arrival dates

Primary surface:

- Purchase Orders

Canonical path:

1. Start New PO from Keel or Purchase Orders.
2. Choose vendor.
3. Add planned product lines in grid form.
4. Approve when the buy is real.
5. Receive approved lines into draft intake rows when product arrives.

Non-negotiables:

- New PO is separate from receiving.
- PO receiving creates draft intake only.
- Payables do not post until intake receipt posts.
- PO header context stays visible while lines are edited.

## Loop 2: Receive

Operator moment: product physically arrives and must become inventory only after counts/costs are verified.

Core entities:

- Purchase orders (required starting point — see TER-1658)
- Batches / inventory lots
- Purchase receipts
- Purchase receipt lines
- Vendor bills
- Inventory movements

Primary surface:

- Purchase Orders → Intake (PO-first path)

Canonical path:

1. Select an approved Purchase Order and choose "Receive against PO" to create draft intake rows from PO lines.
2. Preserve shorthand, source code, raw marker, ownership, arrival, qty, cost, notes.
3. Mark rows Ready.
4. Preview receipt totals from selection.
5. Post receipt.
6. Write inventory movements and payable/consignment obligations.

Non-negotiables:

- `intake_qty` is immutable after posting.
- `available_qty` is live and derived by movement.
- Ownership is separate from arrival.
- **Receiving requires a formal PO (TER-1658, 2026-06-12).** Ad-hoc batch creation without a PO is rejected by the backend. The "Receive Inventory" Keel chip launches the PO-first picker flow ("Receive against PO").

> **Doc sync note (UX-A09, 2026-06-12):** The pre-TER-1658 non-negotiable "Vendor receipt can be generated from selected rows without requiring a formal PO" has been removed. PO-first intake is now official policy per Execution Decision 3 (ext-review-remediated branch). The Keel chip is renamed "Receive against PO" and targets the purchase-orders/intake PO-picker flow.

## Loop 3: Sell

Operator moment: a customer asks what is available, gets a price/catalog/quote, and an order is confirmed/postable.

Core entities:

- Customers
- Sales orders
- Sales order lines
- Inventory lots
- Pricing basis
- Invoices

Primary surfaces:

- Sales
- Orders
- Inventory Finder

Canonical path:

1. Start from customer, remembered product text, or inventory slice.
2. Keep customer balance, credit, notes, recent buying, and pricing context adjacent.
3. Search/slice inventory quickly.
4. Add draft sale lines.
5. Resolve inventory and price.
6. Confirm order.
7. Post sale, decrement inventory, create invoice, update client ledger.

Non-negotiables:

- New Sale must be incredibly easy to start.
- Product Finder is a shared primitive, not just a Sales side panel.
- Customer-facing outputs hide internal cost/margin/floors.
- Confirmed pricing basis must not silently reprice later.

## Loop 4: Collect/Pay

Operator moment: money comes in or goes out and must be traceable, allocatable, and explainable.

Core entities:

- Payments
- Payment allocations
- Invoices
- Vendor bills
- Vendor payments
- Client ledger entries

Primary surfaces:

- Payments
- Vendor Payouts
- Client Ledger

Canonical path:

1. Start Money In or Money Out from Keel.
2. Enter money in a ledger row.
3. Preview impact.
4. Allocate FIFO, selected invoice/bill, unapplied, or buyer credit.
5. Record ledger consequence.
6. Keep buckets/files visible.

Non-negotiables:

- Money movement should feel like appending ledger rows.
- Negative client payment means buyer credit/down payment and must self-label.
- Scheduled vendor payout means a real event exists.
- Vendor payout is traceable to bill/receipt/PO/sellout trigger.

## Loop 5: Fulfill

Operator moment: warehouse turns posted order lines into picked, weighed, bagged, labeled, and fulfilled work.

Core entities:

- Pick lists
- Fulfillment lines
- Sales order lines
- Bag manifest
- Label print state
- Connector scan requests

Primary surface:

- Fulfillment

Canonical path:

1. Allocate posted order to fulfillment.
2. Generate pick list.
3. Pack/weigh lines inline.
4. Assign bag.
5. Print labels.
6. Mark fulfilled with tracking if needed.

Non-negotiables:

- Warehouse view must be low-decision.
- Pack inputs belong on the selected line.
- Labels/manifests are consequences of selected work.
- Mobile scan connectors submit requests; they do not directly mark committed packed status.

## Loop 6: Recover/Close

Operator moment: something is wrong, needs correction, or the period must be safely locked and archived.

Core entities:

- Command journal
- Correction journal entries
- Backup snapshots
- Period locks
- Archive runs
- Support packets

Primary surfaces:

- Recovery
- Closeout

Canonical path:

1. Start recovery from row history when possible.
2. Search commands only when row origin is unknown.
3. Preview reversal or retry impact.
4. Post correction when needed.
5. Preview closeout period.
6. Refuse unsafe rows.
7. Lock and archive with verified control totals.

Non-negotiables:

- Recovery starts from the row whenever possible.
- Restore from backup is read-only preview in the app.
- Archive cannot shrink active data until verification passes.
- Unsafe rows must be refused, not warned past.

## Loop 7: Decide

Operator moment: owner needs daily truth and period/reporting context.

Primary surfaces:

- Dashboard
- Reports

Non-negotiables:

- Metrics have plain-language definitions.
- KPI drilldowns route to source rows.
- Reports are calm projections, not separate workflow engines.
- Owner focus should rank the next few actions, not flood the page with charts.

## Loop 8: Support

Operator moment: someone asks "what happened?" and the operator must reconstruct status quickly.

Primary surfaces:

- Command palette
- Global search
- Relationship drawer
- Row command history
- Recovery

Non-negotiables:

- Search must accept remembered fragments.
- Support answers must be customer-safe when copied.
- Relationship reality is directional: buyer debt and vendor exposure are not silently netted.
- Connector review history is part of status reconstruction.
