# Photographer / Readiness — Missing Media Blocker (Edge Case)

## Meta
- **Persona:** Photographer / Readiness Operator
- **Scenario type:** edge-case
- **Risk tier:** Normal
- **Command families touched:** CMD-INTAKE
- **Estimated run time:** 6–8 minutes
- **Last validated:** not yet run

---

## Persona Context
A Sales Operator is trying to share a catalog with a buyer but some products don't
have photos yet. The Photographer needs to identify which Live batches are blocking
catalog readiness and flag them so the team knows what needs to be photographed next.

## Scenario
Identify Live inventory batches that are missing media/photos, and flag them as
blocking catalog readiness. Verify the flag is visible to the Sales team.

---

## Prerequisites
> Live batches must exist. At least one should have no media status (likely true
> if photos haven't been added yet). If all batches have media, use one from flow 01
> and clear its media status before running this flow.

---

## Pre-Run Checklist
- [ ] At least one Live batch with no/missing media status
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Inventory (⌘5).

---

## Flow Steps

### Step 1 — Find Live batches missing media
**Action:** In Inventory, filter for Live batches with no media status or "No Photos" status.
**Expected signal:** One or more Live batches without media are visible. If no filter for media status exists, note as a Medium UX finding.

### Step 2 — Identify the catalog blocker
**Action:** Note the batch names that are missing media. These are the catalog blockers.
**Expected signal:** Batch names and product types are clearly visible. The missing media status is unambiguous.

### Step 3 — Flag the blocking batch
**Action:** Attempt to flag a batch as "Media Missing" or "Needs Photography" or equivalent. This may be a row action, status update, or tag.
**Expected signal:** A flag or status indicating "needs photography" is applied to the batch. If no flag mechanism exists, note as a product gap (Linear).

### Step 4 — Navigate to Sales to check visibility
**Action:** Navigate to Sales (⌘3). Check if the flagged batch is surfaced with any readiness warning.
**Expected signal (ideal):** Sales view shows a warning or indicator that the batch is not catalog-ready due to missing media.
**Expected signal (acceptable gap):** No readiness warning in Sales view. Document as Medium gap.

### Step 5 — Document all missing-media batches
**Action:** Return to Inventory. Note the count of Live batches missing media.
**Expected signal:** All missing-media batches are identifiable from a single filter operation or column scan.

---

## Pass Criteria
- [ ] Missing-media Live batches identifiable without visiting each batch individually
- [ ] Flag or status mechanism exists to mark "needs photography" (or gap filed if absent)
- [ ] Sales view readiness warning documented (present or gap)

---

## Failure Modes to Watch For
- **No way to filter batches by media status:** Medium UX gap — must check each batch individually
- **No flag mechanism for "needs photography":** Product gap — file in Linear
- **Flagged batch appears in Sales catalog without warning:** Data integrity gap

---

## Related Flows
- `photographer-readiness/01-batch-photo-session-normal.md` — updating media status
