# Owner / Main Manager — Morning Triage (Normal Path)

## Meta
- **Persona:** Owner / Main Manager
- **Scenario type:** normal
- **Risk tier:** Normal
- **Command families touched:** CMD-SALES, CMD-INTAKE
- **Estimated run time:** 8–10 minutes
- **Last validated:** not yet run

---

## Persona Context
The Owner opens the console each morning to answer: "What needs my attention today?"
They expect the Dashboard to surface pending queues, recent activity, and health signals.
Their goal is to identify the top priority item, drill to it, and take one action.

## Scenario
Normal morning start. The Dashboard should surface pending items. The Owner reviews
the dashboard, identifies one actionable item, drills to the relevant view, and
either acts or confirms the state is correct.

---

## Prerequisites
> See `_shared/seed-state-reference.md`. No special setup required — customers and
> vendors exist. The Dashboard may show limited data if no recent activity exists;
> note any empty states as findings.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Dashboard (Decide → Dashboard or ⌘1).

---

## Flow Steps

### Step 1 — Read the Dashboard
**Action:** Observe the Dashboard without clicking anything first. Note what KPI cards, queue items, or pending indicators are visible.
**Expected signal:** The Dashboard loads fully (no spinner after 3 seconds). At least one metric, queue item, or recent activity entry is visible.

### Step 2 — Identify the top actionable item
**Action:** Find the most time-sensitive or highest-priority item on the Dashboard — a pending queue count, an overdue item, or a health alert.
**Expected signal:** At least one item is clearly labeled with a status or count that implies an action is needed. The item is identifiable by label alone, not by color inference only.

### Step 3 — Drill from Dashboard to relevant view
**Action:** Click the queue item, KPI card, or drill-down link to navigate to the relevant view.
**Expected signal:** The app navigates to the correct view and loads relevant rows. If no drill-down link exists and you must navigate manually, note this as a Medium friction finding.

### Step 4 — Locate the specific row
**Action:** In the destination view, locate the row corresponding to the Dashboard item.
**Expected signal:** The row is visible without extensive manual searching. If you had to apply multiple filters or scroll far, note as Medium friction.

### Step 5 — Verify row status and available actions
**Action:** Examine the row's status, key fields, and available actions.
**Expected signal:** Status matches what was shown on the Dashboard. The next available action is clear from the row without opening external docs.

### Step 6 — Return to Dashboard and verify count updated
**Action:** Navigate back to Dashboard (⌘1).
**Expected signal:** If you took an action in Step 5, the Dashboard count for that queue item decreased. If you only reviewed, the count is unchanged.

---

## Pass Criteria
- [ ] Dashboard loaded with visible content from available data
- [ ] At least one item identifiable as actionable (or empty state documented)
- [ ] Drill-down from Dashboard navigated correctly (or friction noted)
- [ ] Row in destination view consistent with Dashboard item
- [ ] Dashboard count reflects any action taken

---

## Failure Modes to Watch For
- **Empty Dashboard despite seed data:** Loading bug or data calculation error
- **Dashboard counts don't match view counts:** Data sync bug
- **No drill-down links at all:** High UX gap — Dashboard is read-only with no navigation
- **Status mismatch:** Dashboard says "Pending" but row shows "Completed" — stale cache

---

## Related Flows
- `sales-operator/01-instant-sale-normal.md` — the Sales view the Owner may drill into
- `owner-manager/02-exception-approval-edge.md` — escalated decision the Owner handles
