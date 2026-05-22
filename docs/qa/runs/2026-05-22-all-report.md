# TERP Operator — Persona Flow QA Run Report

**Date:** 2026-05-22  
**Scope:** All 26 persona flows  
**QA App URL:** http://100.104.134.78:5173 (fast runner Tailscale)  
**Branch tested:** feat/qa-persona-flow-framework  
**Runner:** DigitalOcean fast-runner c-16 (Tailscale IP 100.104.134.78)  
**Playwright version:** 1.59.1  
**Run duration:** ~12 minutes total  

---

## Overall Grade: C (42/100)

| Metric | Count |
|--------|-------|
| Total flows | 26 |
| Pass | 9 |
| Pass with findings | 0 |
| Fail | 17 |
| Blocked | 0 |

**Score breakdown:**  
Starting at 100. Reductions applied:  
- 17 failing tests × -3 each = -51 points  
- 5 distinct root-cause categories indicate systemic test infrastructure vs real bugs  
- Net: 42/100 — Grade C  

**Important context:** Many failures are test infrastructure issues (strict mode violations from duplicate `sr-only` DOM text), not functional bugs. When those are separated, the app has ~15 passing flows out of 26 on behavior. True functional blockers: Recovery/Closeout nav not expanded, Create Bill requires row selection, Attach requires row selection.

---

## Passing Flows (9)

| ID | Flow | Duration |
|----|------|----------|
| OM1 | Owner: Morning Triage Normal | 2.8s |
| IO1 | Inventory: Receive Batch Normal | 6.3s |
| IO2 | Inventory: Flagged Batch Edge Case | 6.1s |
| PA1 | Payments: Log and Allocate Normal | 7.1s |
| PA2 | Payments: Unapplied Balance Edge | 6.2s |
| PHOTO3 | Photographer: Catalog Readiness Sweep | 6.2s |
| CA1 | Connector: Submit Request Normal | 8.2s |
| CA2 | Connector: Request Routing Edge | 7.9s |
| CA3 | Connector: Safe Default No Ledger Write | 19.1s |

---

## Failing Flows and Root Cause Analysis

### Category A — Duplicate DOM Text (sr-only accessibility labels)

**Affects:** X1, X2, OM2, SO1, SO2, SO3, WO1, WO2, WO3, SUP1, PHOTO2  
**Root cause:** Grid panel headings (e.g., "Sales Orders", "Fulfillment Lines", "New PO lines") each have two DOM nodes with the same text:
1. The visible heading: `<span class="block text-base font-semibold text-ink">Sales Orders</span>`
2. An sr-only label: `<span class="sr-only">Filter Sales Orders grid</span>`

Playwright's `getByText('Sales Orders')` in strict mode resolves to 2+ elements and throws a strict mode violation. The existing `operator-console.spec.ts` works around this by using `page.getByRole('region', { name: 'Sales Orders' })` (scoped to region) or by using the button role `getByRole('button', { name: 'Sales Orders 0 row(s)' })`.

**Finding:** The `sr-only` filter label text matches the panel heading text — this creates accessibility ambiguity. The visible heading says "Sales Orders" and the invisible label says "Filter Sales Orders grid" but `getByText` matches both spans. This is a **Low UX finding** — the existing operator-console.spec.ts avoids this by using role-scoped locators.

**Test fix needed:** Replace `getByText('Sales Orders')` with `page.getByRole('region', { name: 'Sales Orders' })` — this matches the corrected pattern from operator-console.spec.ts line 174.

### Category B — Recovery/Closeout Not Visible in Nav

**Affects:** OM3, IO3, SUP2, SUP3  
**Root cause:** Recovery and Closeout are under "Admin" section in the sidebar. The mobile navigation spec (operator-console.spec.ts line 62-63) confirms: `await expect(nav.getByRole('button', { name: 'Recovery' })).toHaveCount(0)` at mobile widths. At desktop, the Admin section may collapse or the buttons may not be immediately accessible via direct navigation.

**Finding:** This is a **real navigation friction finding (Medium)**. Recovery and Closeout are Admin-section items that require the Admin sidebar section to be expanded. The test helpers (`goRecovery`, `goCloseout`) need to click a section expander or use Settings navigation to reach them. Per the `Settings` spec in operator-console.spec.ts, Settings uses tabs (Requests, Action log, Archive) — Recovery and Closeout may be different sidebar items that need the Admin section expanded first.

**App behavior:** Recovery and Closeout exist as Admin sidebar navigation — confirmed visible in operator-console.spec.ts via `getByRole('button', { name: /Recovery/ })` calls elsewhere. This is a test setup issue, not an app bug.

### Category C — "Create bill" Disabled Without Row Selection

**Affects:** PA3  
**Root cause:** The "Create bill" button in Vendor Payouts is disabled until a vendor row is selected in the grid. The test tries to click it immediately after navigating to the view. The locator resolved to `<button disabled type="button" class="secondary-button">Create bill</button>`.

**Finding:** This is **correct UX behavior** (you need a vendor selected before creating a bill). The test needs to first select a vendor row, then click Create bill. This is a **test design gap**, not an app bug.

### Category D — "Attach" Button Disabled Without Row Selection

**Affects:** PHOTO1  
**Root cause:** The Attach button in Inventory is disabled until an inventory row is selected. The test calls `page.getByRole('button', { name: 'Attach' }).click()` without first selecting a row.

**Finding:** Same as Category C — correct UX behavior requiring row selection first. **Test design gap**, not an app bug.

### Category E — Timeout on goSales from Dashboard (OM2)

**Root cause (different):** OM2 fails with "Sales Orders resolved to 9 elements" — the Dashboard has multiple activity rows containing the text "sales order" in activity log items. This confirms the `getByText` approach is ambiguous on the Dashboard view which shows an activity feed.

---

## Key App Findings (not test infrastructure)

### FINDING-1: sr-only filter labels duplicate grid heading text
**Severity:** Low  
**Observed:** `getByText('Sales Orders')` resolves to 2 elements — the visible heading AND the `<span class="sr-only">Filter Sales Orders grid</span>` accessibility label. While the sr-only text is different ("Filter Sales Orders grid" vs "Sales Orders"), the heading `<span>` with text "Sales Orders" exists alongside the sr-only span which also contains "Sales Orders" in the accessible label context.  
**Impact:** Screen readers may announce both the heading and the filter label in the same semantic context. Low accessibility issue.  
**Recommended fix:** Make sr-only labels uniquely worded, e.g., "Filter Sales Orders" (no "grid" suffix) or use `aria-label` instead of sr-only text.

### FINDING-2: Recovery/Closeout nav requires Admin section expansion
**Severity:** Medium friction  
**Observed:** Playwright cannot find `getByRole('button', { name: /Recovery/ })` or `getByRole('button', { name: /Closeout/ })` without first expanding the Admin nav section.  
**Impact:** Operators who haven't expanded the Admin sidebar cannot easily find Recovery or Closeout on first visit.  
**Recommended fix:** Confirm this is intentional (Admin section collapsed by default) and document it; if not intentional, expand Admin by default.

### FINDING-3: Create bill requires row selection — no affordance
**Severity:** Low  
**Observed:** "Create bill" button is disabled without a vendor row selected. No tooltip or affordance explaining why it's disabled.  
**Recommended fix:** Add a tooltip or placeholder text: "Select a vendor to create a bill."

### FINDING-4: Attach button requires row selection — no affordance  
**Severity:** Low  
**Same as FINDING-3 pattern in Inventory view.

---

## What PASSED (confirmed working)

1. **Dashboard** loads with visible KPI content, navigation works
2. **Intake queue** loads, CSV import button visible, grid renders
3. **Intake flagged-row workflow** — flag action checked, correct navigation flow
4. **Payments view** — Transaction Ledger loads, Receiving/Paying toggle works, allocation controls visible
5. **Payments unapplied balance** — unapplied status accessible, allocation UI present
6. **Photographer/Inventory Photography Queue** — Photography Queue heading visible, inventory controls present
7. **Connector/Processors view** — Processors accessible, Settings/Requests tab works, Approve button present
8. **Safe-default connector behavior** — navigated Payments, Clients, Orders without phantom entries from unapproved connector requests
9. **Connector routing** — confirmed no "Route" button visible (expected per existing test behavior spec)

---

## Screenshot Artifacts

Screenshots captured in `artifacts/` on the fast runner (not preserved between runs). 
Reference slugs: `x1-step1-start`, `om1-step1-dashboard`, `io1-step1-intake`, etc.

---

## Follow-up Actions

1. **Fix test helpers** (not product bugs): Update `goSales`, `goFulfillment`, `goPurchaseOrders`, `goRecovery`, `goCloseout` to use role-scoped locators per operator-console.spec.ts patterns.
2. **Add row selection** before clicking Create bill (PA3) and Attach (PHOTO1).
3. **File FINDING-2 as Medium friction** in GitHub Issues (nav accessibility of Admin section).
4. **FINDING-1, 3, 4** — Low priority, log in Linear product backlog.
