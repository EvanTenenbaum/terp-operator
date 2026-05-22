# Inventory Operator — Reversal After Bad Post (Error Path)

## Meta
- **Persona:** Inventory Operator
- **Scenario type:** error-path
- **Risk tier:** Deep QA
- **Command families touched:** CMD-INTAKE, CMD-RECOVERY
- **Estimated run time:** 10–12 minutes
- **Last validated:** not yet run

---

## Persona Context
A receipt was posted with wrong data — wrong quantity, wrong vendor, or wrong product.
The Inventory Operator needs to reverse the posting, restore inventory to its
pre-posting state, and re-post with corrected data.

## Scenario
Tests the reversal path: find a posted batch, reverse its receipt, verify inventory
returns to the correct state, then create and post a corrected intake row.

---

## Prerequisites
> A posted batch must exist. Complete `01-receive-batch-normal.md` first to create
> the "Intake Test Flower" batch, then use that batch for this flow.

---

## Pre-Run Checklist
- [ ] "Intake Test Flower" batch exists in Inventory with status Live, quantity 25
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Inventory (⌘5). Locate the "Intake Test Flower" batch.

---

## Flow Steps

### Step 1 — Find the batch to reverse
**Action:** In the Inventory view, find the "Intake Test Flower" batch. Note its current quantity (should be 25 from flow 01) and status (Live).
**Expected signal:** Batch visible with quantity 25 and status `Live`.

### Step 2 — Access the reversal path
**Action:** Look for a "Reverse", "Undo Receipt", or "Command History" action on the batch row. This may be via row action menu, right-click context menu, or by navigating to Recovery (Admin → Recovery) and searching for the batch.
**Expected signal:** A reversal action or command history is accessible. If reversal is ONLY available via Recovery and not from the row itself, note as a Medium friction finding (but continue via Recovery).

### Step 3 — Initiate the reversal
**Action:** Initiate the receipt reversal for the "Intake Test Flower" batch.
**Expected signal:** System confirms the reversal intent. A toast or confirmation dialog appears before execution.

### Step 4 — Confirm the reversal
**Action:** Confirm the reversal when prompted.
**Expected signal:** Reversal executes. Toast confirms. The batch in Inventory should either disappear or show quantity 0 and a reversed/archived status.

### Step 5 — Verify Inventory state after reversal
**Action:** In Inventory, search for "Intake Test Flower".
**Expected signal:** The batch no longer shows as `Live` with quantity 25. Either absent from Live view, showing quantity 0, or status `Archived`/`Reversed`. The reversal fully unwound the original posting.

### Step 6 — Create and post a corrected intake row
**Action:** Navigate to Intake (⌘2). Create a new intake row with corrected data: vendor Emerald Triangle Supply, product "Intake Test Flower", quantity 20 (corrected amount), unit cost $12.00. Mark Ready and post.
**Expected signal:** New batch appears in Inventory with quantity 20 and status `Live`. This represents the corrected receipt.

---

## Pass Criteria
- [ ] Reversal action accessible from the batch row or via Recovery
- [ ] Reversal executes with a confirmation step (no silent reversal)
- [ ] Inventory quantity returns to 0 or batch removed after reversal
- [ ] Corrected receipt can be created and posted after reversal
- [ ] Corrected batch appears with quantity 20 in Inventory

---

## Failure Modes to Watch For
- **Reversal unavailable from row:** Medium friction — only accessible via Recovery
- **Silent reversal:** Reversal completes with no confirmation step — UX gap
- **Inventory not updated after reversal:** Critical — batch still shows quantity 25 after reversal
- **Cannot post corrected receipt after reversal:** Blocking error — system in invalid state

---

## Related Flows
- `inventory-operator/01-receive-batch-normal.md` — prerequisite: creates the batch to reverse
- `_cross-persona/02-intake-reversal-mid-sale.md` — reversal when a sale holds the inventory
