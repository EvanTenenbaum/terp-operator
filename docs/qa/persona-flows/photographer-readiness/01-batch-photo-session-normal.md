# Photographer / Readiness — Batch Photo Session (Normal Path)

## Meta
- **Persona:** Photographer / Readiness Operator
- **Scenario type:** normal
- **Risk tier:** Normal
- **Command families touched:** CMD-INTAKE
- **Estimated run time:** 6–8 minutes
- **Last validated:** not yet run

---

## Persona Context
A photo session has just been completed. The Photographer needs to mark the photographed
batches as media-ready in the system so Sales can include them in customer catalogs.

## Scenario
Find batches in Inventory that need photos, update their media status to reflect
that photos have been taken, and verify the status update is visible.

---

## Prerequisites
> At least one Live batch must exist in Inventory (create via intake setup if needed,
> see `_shared/seed-state-reference.md`).

---

## Pre-Run Checklist
- [ ] At least one Live batch confirmed in Inventory
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Inventory (⌘5).

---

## Flow Steps

### Step 1 — Identify the media readiness column or indicator
**Action:** In the Inventory grid, look for a column indicating media/photo status (e.g., "Media Status", "Photos", "Readiness", or similar).
**Expected signal (feature visible):** A media status column is visible in the grid. Batches without photos show a "no media" or empty status.
**Expected signal (feature not built):** No media column visible. Document as a product gap in Linear and proceed to note the gap — this is not a test failure.

### Step 2 — Find batches without photos
**Action:** If a media column exists, filter for batches where media status is empty, "No Photos", or equivalent.
**Expected signal:** One or more Live batches with missing media status are visible.

### Step 3 — Update media status for a batch
**Action:** Select a batch that needs photos. Update its media status to indicate photos have been taken (e.g., "Photographed", "Media Ready", or upload a test photo URL).
**Expected signal:** The media status updates inline or via a drawer. The change is visible in the grid row after saving.

### Step 4 — Verify the status update persisted
**Action:** Reload or navigate away and back to the Inventory view. Find the same batch.
**Expected signal:** The updated media status is still showing — the change persisted.

### Step 5 — Check if Sales view reflects the updated readiness
**Action:** Navigate to Sales (⌘3). Check if the batch with updated media status is now surfaced as catalog-ready or has a readiness indicator.
**Expected signal (ideal):** Sales view shows the batch with a "media ready" indicator.
**Expected signal (acceptable gap):** Sales view does not show media status. Document as Medium gap — catalog readiness not surfaced where sales decisions are made.

---

## Pass Criteria
- [ ] Media status column located in Inventory (or gap filed if absent)
- [ ] Batch media status updated successfully (or gap filed if update unavailable)
- [ ] Status update persisted after navigation
- [ ] Sales view readiness surfacing documented (present or gap)

---

## Failure Modes to Watch For
- **No media column in Inventory:** Product gap — file in Linear, not GitHub
- **Media status update not saving:** Bug — file in GitHub
- **Status reverts after navigation:** Data persistence bug

---

## Related Flows
- `photographer-readiness/02-missing-media-blocker-edge.md` — identifying the gaps
- `photographer-readiness/03-catalog-readiness-sweep-normal.md` — the full sweep
