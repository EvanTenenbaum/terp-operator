# Sales Operator — Customer Credit Hold (Edge Case)

## Meta
- **Persona:** Sales Operator
- **Scenario type:** edge-case
- **Risk tier:** Deep QA
- **Command families touched:** CMD-SALES, CMD-PAYMENTS
- **Estimated run time:** 8–10 minutes
- **Last validated:** not yet run

---

## Persona Context
The Sales Operator is trying to place an order for a customer who has exceeded their
credit limit. The system must surface this clearly so the operator can either resolve
it or redirect the buyer — not silently create a sale that posts an invoice to an
over-limit customer.

## Scenario
Tests the credit hold block: what happens when a sale is attempted for a customer
whose balance exceeds their credit limit. Verifies the block fires before any
financial state changes and that the error message is specific.

---

## Prerequisites
> **No credit-hold customer exists in the seed by default.**
> Setup: Navigate to Clients view (Sell → Client Ledger or search "Clients"). Find
> **East Bay Select**. Edit their credit limit to $0 (or $1) so that any new sale
> will trigger a credit hold. This can be done via inline edit in the Clients grid
> or via the client detail drawer.
>
> Also ensure a Live inventory batch exists (see `_shared/seed-state-reference.md`
> intake setup steps).

---

## Pre-Run Checklist
- [ ] East Bay Select credit limit set to $0 (confirmed in Clients view)
- [ ] At least one Live batch exists in Inventory
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Sales (⌘3).

---

## Flow Steps

### Step 1 — Start a new sale for the credit-hold customer
**Action:** Begin a new sale. Select **East Bay Select** as the customer.
**Expected signal:** A new Draft sale row appears with East Bay Select as the customer. No error yet — the block should trigger at confirmation or post, not at draft creation.

### Step 2 — Add a line item
**Action:** Add a Live inventory batch as a line item. Set quantity to at least 1 unit.
**Expected signal:** Line item row appears with product, quantity, and calculated price. Draft sale total updates.

### Step 3 — Attempt to confirm or post the sale
**Action:** Try to confirm or post the sale.
**Expected signal:** The system blocks the action. A toast, inline message, or modal should appear communicating that East Bay Select has exceeded their credit limit. The sale must remain in `Draft` status — it must NOT advance to `Confirmed` or `Posted`.

### Step 4 — Verify the block message is informative
**Action:** Read the error/block message carefully. Note exactly what it says.
**Expected signal:** The message should identify: (1) that this is a credit limit issue, (2) the customer name, (3) ideally the current balance, credit limit, or amount over limit. A generic "An error occurred" message is a High finding.

### Step 5 — Check the Clients view for context
**Action:** Navigate to Clients and find East Bay Select.
**Expected signal:** Their record shows credit limit ($0 as set) and current balance. The numbers explain why the sale was blocked.

### Step 6 — Attempt any available resolution path
**Action:** Return to the sale. Try any available resolution — credit limit adjustment, exception request, or partial payment that would bring balance under limit.
**Expected signal (pass):** If a resolution path exists, it works and the sale can proceed.
**Expected signal (acceptable gap):** If no resolution path exists in the current build, document this as a product gap in Linear — not a test failure.

### Step 7 — Verify no phantom state was created
**Action:** Check Sales grid, Orders view, and Clients balance for any residue from the blocked attempt.
**Expected signal:** No `Confirmed` or `Posted` row for this sale. No invoice created. East Bay Select balance unchanged (still $0 since no sale posted). The only trace is the `Draft` row.

---

## Pass Criteria
- [ ] Credit block triggered before any financial state change
- [ ] Block message is specific — credit-related and customer-identified
- [ ] No phantom invoice or confirmed-order row created
- [ ] East Bay Select balance unchanged after blocked attempt
- [ ] Resolution path either works OR documented as product gap in Linear

---

## Failure Modes to Watch For
- **Silent block:** Sale silently stays Draft with no message — High UX gap
- **Generic error message:** "Something went wrong" — High UX gap, file as GitHub issue
- **Phantom confirmation:** Sale advances past Draft despite block — Critical data integrity bug
- **Balance mismatch:** Clients view shows different numbers than what triggered the block — data consistency bug

---

## Related Flows
- `sales-operator/01-instant-sale-normal.md` — run first for baseline understanding
- `payments-accounting/02-unapplied-balance-edge.md` — payments side of credit resolution
- `owner-manager/02-exception-approval-edge.md` — approval path if exception workflow exists
