# Owner / Main Manager — Period Closeout (Full Lifecycle)

## Meta
- **Persona:** Owner / Main Manager
- **Scenario type:** full-lifecycle
- **Risk tier:** Deep QA
- **Command families touched:** CMD-CLOSEOUT
- **Estimated run time:** 15–20 minutes
- **Last validated:** not yet run

---

## Persona Context
The Owner closes periods to lock the ledger, produce control totals, and archive
the period's activity. This is a careful, deliberate workflow — they review unsafe
rows before locking, confirm control totals match expectations, and archive cleanly.
A mistake here is hard to reverse, so the interface must surface blockers clearly.

## Scenario
Full period closeout lifecycle: review unsafe rows, handle blockers, confirm control
totals, lock the period, and archive. Tests that the Closeout view surfaces all
pre-lock requirements and that the lock/archive commands execute correctly.

---

## Prerequisites
> App running. No specific transaction data required — the Closeout view should
> render with the current period regardless of activity level.

---

## Pre-Run Checklist
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If not, activate stub fallback.

---

## Starting State
Navigate to Closeout (Admin → Closeout).

---

## Flow Steps

### Step 1 — Review the Closeout view
**Action:** Observe the Closeout view. Note what sections, controls, and status information are visible.
**Expected signal:** The view loads fully. Period information, control totals (or placeholders), and any unsafe/blocking rows are visible. The current period's date range is shown.

### Step 2 — Identify and examine unsafe rows
**Action:** Find the "unsafe rows" section or indicator. If unsafe rows are listed, click through to examine at least one.
**Expected signal:** Unsafe rows listed with enough detail to understand why they block closing. If unsafe rows exist but are not clickable, note as a friction finding.

### Step 3 — Resolve or acknowledge blockers
**Action:** For each unsafe row: navigate to the relevant view to resolve it, or document it as an intentional known-gap.
**Expected signal:** After resolving or acknowledging each blocker, the unsafe rows count decreases. If the Closeout view doesn't update after resolving a row elsewhere, note as a sync finding.

### Step 4 — Review control totals
**Action:** Review the displayed control totals (total sales, payments received, inventory value, etc.).
**Expected signal:** Control totals display numeric values. If totals show $0 when activity exists, note as a data calculation finding.

### Step 5 — Attempt to lock the period
**Action:** Initiate the period lock command.
**Expected signal:** If no unsafe rows remain: lock succeeds, status changes to `Locked`, confirmation toast appears.
If unsafe rows remain: lock is blocked with a specific message identifying what must be resolved first.

### Step 6 — Archive the locked period
**Action:** After a successful lock, initiate the archive command.
**Expected signal:** Archive completes. Period appears in the archive grid with its locked date and control totals. The active period resets to the next period.

---

## Pass Criteria
- [ ] Closeout view loaded with period data and control totals visible
- [ ] Unsafe rows identifiable with sufficient detail to act on
- [ ] Lock blocked correctly when unsafe rows exist
- [ ] Lock succeeds after unsafe rows resolved
- [ ] Archive completes and locked period visible in archive grid

---

## Failure Modes to Watch For
- **Unsafe rows listed but not clickable:** High UX gap — cannot drill through to fix
- **Lock with unsafe rows still present:** Critical — period locks despite unresolved blockers
- **Control totals showing $0 when activity exists:** High — calculation or data loading error
- **Archive with no confirmation or artifact:** UX gap

---

## Related Flows
- `owner-manager/01-morning-triage-normal.md` — daily orientation before closeout
- `payments-accounting/01-log-and-allocate-payment-normal.md` — resolving payment blockers before close
