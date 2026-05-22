# Persona: Sales Operator

## Who They Are
The Sales Operator turns available inventory into confirmed orders as fast as possible.
They work with buyers over text or phone, find matching product, build the order inline,
and post it before the buyer changes their mind. Speed and accuracy are equally important —
a slow interface loses deals; a wrong posting loses trust.

## Operating Style
- Keyboard-first: ⌘K command palette, Tab/Enter for grid navigation, ⌘3 to jump to Sales
- Grid-native: reads the Sales grid like a trader reads a ticker — status, price, quantity at a glance
- Intolerant of multi-step modal forms; expects inline edits and one-command posting
- Uses the InventoryFinderPanel to slice product by category, vendor, tag, age, price
- Trusts the `Draft → Confirmed → Posted` status chain — never infers state from color alone

## Primary Views
- **Sales** (`view: 'sales'`) — home base, where orders are built and posted
- **Inventory** (`view: 'inventory'`) — secondary, when InventoryFinder needs more detail
- **Orders** (`view: 'orders'`) — monitoring the open order book after posting
- **Clients** (`view: 'clients'`) — checking credit and balance before a large order

## Command Families Used
- `CMD-SALES` — createSale, addLineItem, confirmSale, postSale, reverseSale

## What Good Looks Like
- New sale draft created in under 30 seconds from a cold start
- Product found via InventoryFinderPanel without leaving the Sales view
- Sale confirmed and posted with a single command; status updates in the grid immediately
- Error messages name the exact problem (customer, credit amount, product, quantity)
- Reversal clearly available from the row if a mistake was made

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- Having to leave Sales view to find inventory (should be in-panel)
- Confirmation dialog that resets form state on dismiss
- Grid losing sort/filter state after a command runs
- Status change without a confirming toast
- Credit or inventory block showing a generic error message

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- State-based routing — see `_shared/navigation-primer.md`
- AG Grid virtualization — scroll or filter before interacting with off-screen rows
- Financial rounding — totals may vary ±$0.01–$0.26

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-instant-sale-normal.md` | normal | Happy path: find inventory, build sale, confirm, post |
| `02-customer-credit-hold-edge.md` | edge-case | Customer over credit limit — block, messaging, resolution |
| `03-no-available-inventory-error.md` | error-path | Attempting to sell when no Live batches exist for a product |
