# Photographer / Readiness — Catalog Readiness Sweep (Normal Path)

## Meta
- **Persona:** Photographer / Readiness Operator
- **Scenario type:** normal
- **Risk tier:** Normal
- **Command families touched:** — (read-only sweep)
- **Estimated run time:** 5–6 minutes
- **Last validated:** not yet run

---

## Persona Context
Before a major sales push, the Photographer does a full sweep of inventory to
determine which batches are catalog-ready (have photos, are Live, are priced) vs.
blocked (missing media, wrong status). The result tells the Sales team what they
can and cannot share with buyers today.

## Scenario
Full read-only sweep: using Inventory filters alone, determine the count of
catalog-ready vs. not-ready Live batches and document the findings. Tests whether
the system provides the information needed for this assessment in a single session.

---

## Prerequisites
> Some Live batches should exist. Having a mix of media-ready and not-ready batches
> is ideal but not required. Document whatever state is present.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Inventory (⌘5).

---

## Flow Steps

### Step 1 — Count all Live batches
**Action:** In Inventory, filter for status = Live. Note the total count.
**Expected signal:** The filter works and shows a count (or row count) of Live batches.

### Step 2 — Identify catalog-ready batches
**Action:** Further filter or identify batches that have: (1) Live status AND (2) media/photos present AND (3) a price set. Note the count of batches meeting all three criteria.
**Expected signal:** If the system supports multi-criteria filtering, the count is obtainable in one filter operation. If not, document the number of filter steps required.

### Step 3 — Identify catalog-blocked batches
**Action:** Find batches that are Live but missing one or more of: media, price, or other required catalog attribute.
**Expected signal:** The blocking batches are identifiable. Note what is missing for each.

### Step 4 — Document readiness ratio
**Action:** Calculate: (catalog-ready count) / (total Live count) = readiness percentage.
**Expected signal:** This number is obtainable from the system in under 5 minutes without external tools.

### Step 5 — Assess ease of sweep
**Action:** Reflect on how many steps were required to get the readiness ratio. Was it achievable in a single filter, or did it require multiple steps and manual counting?
**Expected signal:** Ideally achievable in 1-2 filter operations. If it required 5+ steps or manual counting of rows, note as a Medium friction finding.

---

## Pass Criteria
- [ ] Total Live batch count obtainable from Inventory filter
- [ ] Catalog-ready vs. blocked batches distinguishable (or gap documented)
- [ ] Readiness ratio obtainable in under 5 minutes
- [ ] Friction level for the sweep documented (fast / acceptable / slow)

---

## Failure Modes to Watch For
- **Cannot filter Inventory by media status:** Medium gap — sweep requires manual row inspection
- **No batch count visible:** UX gap — grid shows rows but no summary count
- **Readiness requires visiting 3+ views:** High friction finding

---

## Related Flows
- `photographer-readiness/01-batch-photo-session-normal.md` — updating the statuses this sweep reads
- `photographer-readiness/02-missing-media-blocker-edge.md` — addressing the blockers found in the sweep
