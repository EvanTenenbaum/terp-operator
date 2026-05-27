# Persona Flow QA Run Report — 2026-05-27 (all scope)

**Date:** 2026-05-27  
**Branch:** main (commit a8092cc — "Merge pull request #399 from EvanTenenbaum/codex/crikket-feedback-20260526")  
**Scope:** all (26 flows)  
**Environment:** DigitalOcean fast runner — ephemeral Postgres (realistic 100-day seed)  
**App URL:** http://100.104.134.78:5173  
**Login:** owner@terpagro.local / terp-demo  
**Run method:** `pnpm exec playwright test tests/e2e/persona-flow-qa.spec.ts --project=chromium --workers=1`  

---

## Overall Grade: C+ (72/100)

| Metric | Value |
|--------|-------|
| Tests run | 26 |
| Passed | 21 |
| Failed | 5 |
| Pass rate | 80.8% |
| Score (adversarial) | 72/100 |

**Score reducers applied:**
- X1 Critical cross-persona failure: -15 (Critical flow fail)
- SO1 test assertion regression: -5 (Normal flow, test spec drift)
- SO2 test assertion regression: -5 (Deep QA flow, test spec drift)
- WO1 wrong assertion expectation: -3 (test spec issue, not product bug)

**⚠️ SHIP GATE: INVALID — X1 (Critical) failed. Both cross-persona flows must pass for a valid ship gate.**

---

## Seed State (at run time)

Key deviations from scenario defaults:
- **Canyon Market**: balance $949,873 vs $905,000 limit — OVER LIMIT (not a good-standing customer in this seed)
- **Good-standing customer**: Capitol Cure ($33,104 / $80,000 limit) — used correctly in tests
- **Live batches**: 0 (all batches from 100-day seed already closed/sold through)
- **Open orders**: 521 sales, 172 POs
- **Known missing**: connector record (no Processor seeded), East Bay Select at $0 limit (not set)

---

## Results by Flow

### ⚠️ Critical Flows (required for ship gate)

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| X1 – Cross-Persona: Purchase-to-Payment Lifecycle | ❌ **FAIL** | 36.0s | Navigation to Intake fails after PO approval |
| X2 – Cross-Persona: Intake Reversal Mid-Sale | ✅ Pass | 16.4s | |
| Flow 12 / PA3 – Vendor Bill Payment Lifecycle | ✅ Pass | 4.6s | |

### Owner / Manager

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| OM1 – Morning Triage Normal | ✅ Pass | 4.4s | |
| OM2 – Exception Approval Edge | ✅ Pass | 12.9s | |
| OM3 – Period Closeout Full Lifecycle | ✅ Pass | 6.2s | |

### Sales Operator

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| SO1 – Instant Sale Normal | ❌ **FAIL** | 18.9s | "Sales Orders" text gone after customer select — test spec drift |
| SO2 – Customer Credit Hold Edge | ❌ **FAIL** | 52.4s | "Sales Orders" text not found on 2nd navigation — test spec drift |
| SO3 – No Available Inventory Error | ✅ Pass | 19.8s | |

### Inventory Operator

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| IO1 – Receive Batch Normal | ✅ Pass | 7.6s | |
| IO2 – Flagged Batch Edge | ✅ Pass | 7.6s | |
| IO3 – Reversal After Bad Post | ✅ Pass | 12.3s | |

### Payments / Accounting

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| PA1 – Log and Allocate Payment | ✅ Pass | 8.6s | |
| PA2 – Unapplied Balance Edge | ✅ Pass | 7.7s | |
| PA3 – Vendor Bill Payment Lifecycle (Critical) | ✅ Pass | 4.6s | |

### Warehouse Operator

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| WO1 – Pick, Weigh, Fulfill Normal | ❌ **FAIL** | 24.8s | Wrong test assertion: expects "Fulfillment Lines" to disappear after goInventory, but it remains |
| WO2 – Weight Discrepancy Edge | ✅ Pass | 9.5s | |
| WO3 – Partial Fulfillment Error | ✅ Pass | 14.5s | |

### Support Operator

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| SUP1 – Trace Order Status Normal | ❌ **FAIL** | 42.1s | "Sales Orders" text not found after Orders+Fulfillment navigation — test spec drift |
| SUP2 – Reconstruct Payment History Edge | ✅ Pass | 10.4s | |
| SUP3 – Missing Batch Investigation Error | ✅ Pass | 10.1s | |

### Photographer / Readiness

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| PHOTO1 – Batch Photo Session Normal | ✅ Pass | 8.2s | |
| PHOTO2 – Missing Media Blocker Edge | ✅ Pass | 9.5s | |
| PHOTO3 – Catalog Readiness Sweep | ✅ Pass | 7.6s | |

### Connector Actor

| Flow | Result | Time | Notes |
|------|--------|------|-------|
| CA1 – Submit Request Normal | ✅ Pass | 9.6s | |
| CA2 – Request Routing Edge | ✅ Pass | 9.4s | |
| CA3 – Safe Default No Ledger Write (Deep QA) | ✅ Pass | 20.9s | |

---

## Findings

### FINDING-1 — X1 Navigation Regression After PO Approval
**Severity:** High  
**Flow:** X1 (Critical)  
**Step:** Step 3 — Navigate to Intake after approving PO  
**Observed:** After clicking "Approve PO" and waiting 1s, `goIntake()` clicks the Intake nav button but "Intake queue" text never appears within 30s  
**Expected:** Intake view loads with "Intake queue" heading  
**Hypothesis:** After PO approval, the UI enters a state (success overlay, workspace modal, or route-change handler) that intercepts the Intake navigation click  
**Note:** IO1 passes with identical `goIntake()` navigation when starting from a clean state — so the function works in isolation  
**Action:** GitHub Issue — regression/blocker for X1 ship gate

### FINDING-2 — Sales View Heading Disappears During New Sale Workspace
**Severity:** Medium (test spec drift — UI behavior is correct, test expectation is wrong)  
**Flows:** SO1, SO2, SUP1  
**Observed:** `getByText('Sales Orders')` fails after opening a new sale workspace (SO1), after returning from Clients view with an active sale (SO2), and after Orders+Fulfillment navigation (SUP1)  
**Expected (test):** "Sales Orders" visible in main content  
**Actual product behavior:** When a sale workspace is open, the main content area shows the workspace rather than the list heading — "Sales Orders" is not visible  
**Action:** Update test spec — use a less view-specific selector that works in both workspace-open and list states. Track in GitHub Issues as test-spec drift.

### FINDING-3 — WO1 Incorrect Assertion: Fulfillment Lines Expected Hidden After goInventory
**Severity:** Low (test spec issue)  
**Flow:** WO1  
**Line 770:** `expect(page.getByText('Fulfillment Lines').first().isVisible()).toBe(false)` after `goInventory(page)`  
**Observed:** "Fulfillment Lines" text is still visible after navigating to Inventory  
**Expected (test):** Text should be hidden  
**Actual:** Either the text persists in the DOM (sidebar/label), or navigation doesn't fully replace the content. The prior line `goInventory(page)` doesn't assert a specific Inventory heading, so no positive assertion was checked.  
**Action:** Fix test assertion — either assert the Inventory view heading appeared (positive) rather than Fulfillment Lines disappeared (negative), or remove the incorrect assertion.

### FINDING-4 — `run-persona-qa.sh` Hardcodes Tailscale IP Breaking Browser Tests
**Severity:** Medium (environment/tooling)  
**File:** `scripts/run-persona-qa.sh`  
**Observed:** `PLAYWRIGHT_BASE_URL=http://100.104.134.78:5173` causes all 26 tests to time out at their full configured duration. With `reuseExistingServer: true` and no `PLAYWRIGHT_BASE_URL` override, tests run at localhost and complete correctly.  
**Root cause:** Playwright's browser session can't reach the Tailscale IP from within the fast-runner job (different network context), while the Mac mini can reach it fine via curl.  
**Action:** Remove `PLAYWRIGHT_BASE_URL` from `run-persona-qa.sh` and let Playwright's webServer config handle it via localhost.

---

## Infrastructure Notes

- **Port conflicts on fresh runner:** First qa:env:setup run failed due to leftover postgres on port 5432 from a prior job. Needed `docker rm -f` cleanup before retry.
- **App survived job timeout:** After qa:env:setup's 5-minute fast-runner timeout, the app process (PID 471647) and postgres container continued running — cleanup trap in bash script did NOT fire on SIGTERM from fast-runner. This was actually beneficial for this run (tests reused the running server), but is a cleanup gap to note.
- **Playwright webServer fix:** Using `PLAYWRIGHT_SKIP_WEB_SERVER=1` + Tailscale IP breaks tests; using `reuseExistingServer: true` with no override works correctly.

---

## Ship Gate Status

```
⚠️ SHIP GATE: INVALID
Reason: X1 (Cross-Persona: Purchase-to-Payment Lifecycle) FAILED
Requirement: Both X1 and X2 must pass for a valid ship gate.
X2: ✅ PASSED
X1: ❌ FAILED (navigation regression after PO approval — needs investigation)
```

To clear this gate:
1. Investigate and fix X1 finding (FINDING-1): PO approval → Intake navigation regression
2. Fix test spec drift in SO1/SO2/SUP1 (FINDING-2): "Sales Orders" text assertion
3. Fix WO1 test assertion (FINDING-3)
4. Re-run with scope=`critical` to confirm X1 passes
5. Full scope re-run to confirm 26/26 before ship decision

---

*Run executed: 2026-05-27 by OpenCode PM agent*  
*Fast runner job: fast-runner/qa-all26-20260527T092832*
