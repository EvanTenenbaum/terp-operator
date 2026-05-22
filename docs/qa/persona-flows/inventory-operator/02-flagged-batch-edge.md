# Inventory Operator — Flagged Batch (Edge Case)

## Meta
- **Persona:** Inventory Operator
- **Scenario type:** edge-case
- **Risk tier:** Deep QA
- **Command families touched:** CMD-INTAKE
- **Estimated run time:** 8–10 minutes
- **Last validated:** not yet run

---

## Persona Context
A vendor delivery arrives with a discrepancy — the quantity doesn't match the
manifest, or there's an unexpected product in the delivery. The Inventory Operator
flags the row rather than posting it, investigates, and then either resolves the
flag and posts with corrected data, or rejects the row entirely.

## Scenario
Tests the flag workflow: creating a suspicious intake row, flagging it, verifying
it does NOT auto-post while flagged, resolving the flag, and posting with corrected
data.

---

## Prerequisites
> No special setup required. Use any vendor from the seed data.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Intake (⌘2).

---

## Flow Steps

### Step 1 — Create a suspicious intake row
**Action:** Create a new intake row. Enter vendor as **Fogline Farms**, product name "Flagged Test Product", quantity 100 (deliberately high — simulating a discrepancy), unit cost $5.00.
**Expected signal:** New intake row appears in Draft status.

### Step 2 — Flag the row
**Action:** Flag the row (via row action menu, right-click, or flag icon). Add a note: "Quantity doesn't match manifest — only 60 units received."
**Expected signal:** Row status changes to `Flagged` (or similar). The flag reason/note is visible on the row or in a detail view.

### Step 3 — Verify the flagged row does NOT auto-post
**Action:** Check the Intake grid. Attempt to mark the flagged row as Ready.
**Expected signal:** The flagged row remains in Intake — it should NOT auto-post or advance to Ready without explicit operator action. If the flag can be bypassed silently, note as a finding.

### Step 4 — Navigate to Inventory to confirm no batch was created
**Action:** Navigate to Inventory (⌘5). Search for "Flagged Test Product".
**Expected signal:** No batch exists for "Flagged Test Product" — the flagged intake row has not created any inventory.

### Step 5 — Resolve the flag and correct the data
**Action:** Return to Intake. Clear the flag on the row. Update the quantity from 100 to 60 (the correct received amount).
**Expected signal:** Flag is cleared. Row status returns to `Draft` or `Ready`. Quantity is now 60.

### Step 6 — Post the corrected receipt
**Action:** Mark the row Ready and process the receipt.
**Expected signal:** Toast confirms posting. Navigate to Inventory — a batch appears with quantity 60, not 100.

---

## Pass Criteria
- [ ] Flagged row visibly marked with flag status and note
- [ ] Flagged row does NOT auto-post or create inventory
- [ ] Flag can be resolved and data corrected inline
- [ ] Posted batch in Inventory shows corrected quantity (60, not 100)
- [ ] Original flag note preserved or accessible in history

---

## Failure Modes to Watch For
- **Flag auto-clears on mark Ready:** Flagged row should resist ready-marking — UX issue
- **Batch created despite flagged status:** Critical — inventory created from flagged row
- **Flag note lost after resolution:** Audit trail issue
- **No flag action available:** Feature gap — note as product gap in Linear

---

## Related Flows
- `inventory-operator/01-receive-batch-normal.md` — the normal path for context
- `inventory-operator/03-reversal-after-bad-post-error.md` — what to do if a bad row was already posted
