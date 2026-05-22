# Support Operator — Missing Batch Investigation (Error Path)

## Meta
- **Persona:** Support Operator
- **Scenario type:** error-path
- **Risk tier:** Normal
- **Command families touched:** CMD-RECOVERY (read-only investigation)
- **Estimated run time:** 6–8 minutes
- **Last validated:** not yet run

---

## Persona Context
A Sales Operator reports that a batch they expected to be in Inventory is gone or
shows a different status than expected. The Support Operator investigates using
Recovery and the Inventory view to determine what happened — without making changes.

## Scenario
Trace the history of a batch that is missing from Inventory or in an unexpected
status. Use Recovery to find the commands that affected it.

---

## Prerequisites
> A batch that has been through some activity is ideal (e.g., the "Intake Test Flower"
> batch from inventory-operator flows, or any batch with a posted receipt).
> If no batches exist, use Recovery to investigate the empty state itself.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Inventory (⌘5).

---

## Flow Steps

### Step 1 — Search for the target batch
**Action:** In Inventory, search or filter for "Intake Test Flower" (or the name of any batch you know was created in a prior flow).
**Expected signal:** The batch appears with its current status. Note the status and quantity.

### Step 2 — If batch is missing or has unexpected status, go to Recovery
**Action:** Navigate to Recovery (Admin → Recovery). Search for the batch product name.
**Expected signal:** Recovery returns command history entries for this batch — intake posting, any reversals, status changes, etc.

### Step 3 — Read the command history timeline
**Action:** Review the commands in chronological order. Identify what sequence of actions led to the current state.
**Expected signal:** The command history is readable and in chronological order. Each command shows timestamp, type, and operator (or system) that ran it.

### Step 4 — Identify the last command that changed the batch state
**Action:** Find the most recent command in the history that affected the batch status or quantity.
**Expected signal:** The command type, timestamp, and result are visible. The transition is explainable from the history alone.

### Step 5 — Document findings for escalation
**Action:** Write a brief summary of what happened to the batch: "Batch was posted on [date], reversed on [date] by [command], current status [X] is expected/unexpected."
**Expected signal:** All information needed for the summary was obtainable without any mutations or operator assistance.

---

## Pass Criteria
- [ ] Inventory search returns the batch or clearly shows it is absent
- [ ] Recovery search returns relevant command history for the batch
- [ ] Command history is in chronological order and readable
- [ ] Complete batch lifecycle reconstructable from Recovery alone

---

## Failure Modes to Watch For
- **Recovery returns no results for a batch with known history:** Audit trail gap
- **Command history not in chronological order:** UX issue
- **Cannot search Recovery by product name or batch ID:** High UX gap
- **Batch in unexpected state with no Recovery history explaining it:** Data integrity issue

---

## Related Flows
- `inventory-operator/03-reversal-after-bad-post-error.md` — creates reversals visible in Recovery
