# Cross-Persona — Intake Reversal While Sale Holds Inventory

## Meta
- **Persona:** Cross-persona (Sales Operator → Inventory Operator → Sales Operator)
- **Scenario type:** cross-persona
- **Risk tier:** Critical
- **Command families touched:** CMD-SALES, CMD-INTAKE, CMD-RECOVERY
- **Estimated run time:** 15–20 minutes
- **Last validated:** not yet run

---

## Scenario

Tests shared-state integrity when an Inventory Operator attempts to reverse a
posted batch receipt while a Sales Operator has an active sale reserving inventory
from that batch. The system must either:
- (A) Block the reversal with a clear explanation citing the active reservation, OR
- (B) Cascade-cancel the reservation safely with a warning and confirmation

Under no circumstances should the reversal silently succeed and leave a sale order
pointing at inventory that no longer exists.

---

## Prerequisites

> A Live inventory batch must exist before starting.
> Follow intake setup steps in `_shared/seed-state-reference.md` to create one,
> OR complete cross-persona flow 01 Steps 1–4 first.
>
> Use **Canyon Market** as the customer (good-standing, $0 balance).

---

## Pre-Run Checklist
- [ ] At least one Live inventory batch confirmed in Inventory view
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State

Navigate to Sales (⌘3). You are beginning as the **Sales Operator** persona.

---

## Flow Steps

### Step 1 — [Sales Operator] Create a draft sale reserving the target batch
**Action:** Create a new sale for Canyon Market. Add a line item using the Live batch identified in prerequisites. Do NOT post — leave the sale in Draft or Confirmed status.
**Expected signal:** Draft sale row visible with the batch's product as a line item. Inventory view should show a reduced available quantity for that batch (reservation).

### Step 2 — Record the sale and batch identifiers
**Action:** Note the sale identifier (e.g., order number or grid row) and the batch product name for later verification.
**Expected signal:** Both identifiers are visible in their respective grids.

### Step 3 — [Inventory Operator] Attempt to reverse the intake that created the target batch
**Action:** Switch to Inventory Operator persona. Navigate to Recovery (Admin → Recovery) or use the command history on the batch row in Inventory. Find the intake/receipt command that created the batch. Attempt to reverse it.
**Expected signal (correct — block):** System blocks the reversal with a specific message citing active reservations. Batch status unchanged.
**Expected signal (correct — cascade):** System warns that reversing will affect the active sale, requires confirmation, then executes: batch reversed AND sale line item removed or sale cancelled. Toast and audit trail show both actions.
**Expected signal (FAIL — silent):** Reversal completes with no warning but sale still references the reversed batch. File as Critical immediately.

### Step 4 — Verify sale state after reversal attempt
**Action:** Navigate back to Sales. Find the sale from Step 1.
**Expected signal:** If blocked: sale is unchanged, still in previous status, line item intact.
If cascaded: sale is cancelled or line item removed, with audit trail.
If silently succeeded: sale still shows the line item as if inventory exists — **Critical finding**.

### Step 5 — Verify inventory state
**Action:** Check Inventory view for the target batch.
**Expected signal:** If blocked: batch still `Live` with original quantity.
If cascaded: batch reversed/removed.

### Step 6 — Check Recovery for audit trail
**Action:** Navigate to Recovery (Admin → Recovery). Search for the batch product name or the reversal command.
**Expected signal:** The reversal attempt is visible in command history with its outcome. No silent untracked mutations.

---

## Pass Criteria
- [ ] Reversal either blocked with specific message OR cascaded with warning + full audit trail
- [ ] Under no circumstances did a silent reversal leave a sale referencing non-existent inventory
- [ ] Recovery view shows the reversal attempt in command history
- [ ] Inventory and sale states are internally consistent after the flow
- [ ] Error messages (if any) are specific — include batch/sale identifiers, not generic text

---

## Failure Modes to Watch For
- **Silent reversal with orphaned sale:** Most critical failure — reversal succeeds, sale still references reversed batch, no error
- **Generic block message:** "Cannot complete operation" with no specifics — High finding
- **No audit trail:** Reversal attempt not visible in Recovery — audit integrity bug
- **Cascade without warning:** Sale silently cancelled without user confirmation — High finding (data loss)

---

## Findings Format
```
FINDING: [description]
Severity: [Critical | High | Medium | Low]
Step: [N]
Observed: [what happened]
Expected: [what should have happened]
Evidence: [screenshot at docs/qa/runs/screenshots/YYYYMMDD-cross-persona-step[N]-[slug].png]
```

---

## Related Flows
- `inventory-operator/03-reversal-after-bad-post-error.md` — single-persona reversal
- `sales-operator/03-no-available-inventory-error.md` — sale with no inventory
- `_cross-persona/01-purchase-to-payment-lifecycle.md` — companion lifecycle flow
