# Persona: Payments / Accounting Operator

## Who They Are
The Payments/Accounting Operator handles all money movement: logging payments from
customers, allocating them to invoices, paying vendor bills, and reconciling balances.
They live in the Payments and Vendor Payouts views. Their work is traceable,
reversible, and must match the physical ledger exactly — a $1 discrepancy is a
real problem that needs investigation, not rounding.

## Operating Style
- Works methodically: log payment first, then allocate, then verify balance
- Expects FIFO allocation to work automatically when selected
- Checks client balance before and after every money movement
- Treats unapplied balance as a flag, not a normal state
- Trusts explicit allocation status ("Allocated", "Unapplied") over inferred balance math

## Primary Views
- **Payments** (`view: 'payments'`) — log and allocate customer payments
- **Vendor Payouts** (`view: 'vendorPayouts'`) — pay vendor bills
- **Clients** (`view: 'clients'`) — verify client balance and allocation history
- **Recovery** (`view: 'recovery'`) — reverse a misapplied payment

## Command Families Used
- `CMD-PAYMENTS` — logPayment, allocatePayment, unallocatePayment, refundPayment
- `CMD-VENDOR` — approveBill, scheduleBill, payBill, voidBill

## What Good Looks Like
- Payment logged and allocated to the correct invoice in under 60 seconds
- FIFO allocation works automatically when selected and applies to oldest invoice first
- Client balance updates immediately after allocation
- Vendor bill payment creates a clear ledger entry with source bill reference
- Unapplied payments are surfaced prominently, not buried

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- Logging a payment and allocating it are separated by too many steps
- FIFO is selected but allocation does not happen automatically
- Client balance does not update after allocation without a page refresh
- Unapplied balance not clearly distinguished from credit balance in the grid

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- State-based routing — see `_shared/navigation-primer.md`
- FIFO allocation known issue: `logPayment` with `allocationIntent='fifo'` may not auto-allocate (open issue DYN-H3). If FIFO does not allocate automatically, manually allocate and note the known issue — do not re-file it.
- Financial rounding — totals may vary ±$0.01–$0.26

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-log-and-allocate-payment-normal.md` | normal | Log customer payment, allocate FIFO, verify balance |
| `02-unapplied-balance-edge.md` | edge-case | Payment logged but not allocated — find and allocate unapplied balance |
| `03-vendor-bill-payment-lifecycle.md` | full-lifecycle | Create vendor bill → approve → schedule → pay → verify ledger |
