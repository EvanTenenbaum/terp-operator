# Persona Flow QA Framework — Design Spec

**Date:** 2026-05-22
**Status:** Approved — ready for implementation planning
**AQA:** Passed (5 findings identified and resolved — see AQA section)

---

## Purpose

A reusable, expandable, AI-agent-executable QA framework for TERP Operator. Gives autonomous browser agents (natural-language, goal-oriented) systematic instructions to replicate real operator persona flows, verify system logic and business rules, triage findings into the right tracking system, and produce a graded run report Evan can read in under 30 seconds.

---

## Design Constraints

- **Agent type:** Natural-language AI browser agent (e.g. `live-website-human-qa`). Steps are action + expected signal, not CSS selectors.
- **App routing:** State-based, not URL-based. Navigation is sidebar/QuickStart only. See `_shared/navigation-primer.md`.
- **Starting state:** `pnpm db:seed:realistic` (100-day realistic scenario). All prerequisite entities are named in `_shared/seed-state-reference.md`.
- **Personas:** 8 operator personas, each with 3+ scenarios (normal, edge-case, error-path). Plus a `_cross-persona/` directory for lifecycle flows.
- **Trigger model:** On-demand. An agent or Evan invokes any flow at any time by loading the file and running it.
- **Tracking:** GitHub Issues for bugs; Linear for product/capability gaps. Linear MCP preferred; fallback to local stub file if MCP unavailable.

---

## Directory Structure

```
docs/qa/persona-flows/
│
├── REGISTRY.md                          ← master index; one row per scenario; dispatch instructions
│
├── _shared/
│   ├── navigation-primer.md             ← BLOCKING PREREQUISITE — state-based routing, sidebar nav,
│   │                                       AG Grid patterns, blocker vs. known constraint
│   ├── seed-state-reference.md          ← BLOCKING PREREQUISITE — concrete entity names/IDs/balances
│   │                                       from pnpm db:seed:realistic; must be authored from real output
│   ├── scenario-template.md             ← blank scenario file for new flows
│   └── persona-template.md              ← blank persona file for new personas
│
├── _cross-persona/
│   ├── README.md                        ← explains cross-persona flows and why they exist
│   ├── 01-purchase-to-payment-lifecycle.md   ← Critical: Inventory→Sales→Warehouse→Payments
│   └── 02-intake-reversal-mid-sale.md        ← Critical: batch reversal while order is active
│
├── owner-manager/
│   ├── _persona.md
│   ├── 01-morning-triage-normal.md
│   ├── 02-exception-approval-edge.md
│   └── 03-period-closeout-full-lifecycle.md
│
├── sales-operator/
│   ├── _persona.md
│   ├── 01-instant-sale-normal.md
│   ├── 02-customer-credit-hold-edge.md
│   └── 03-no-available-inventory-error.md
│
├── inventory-operator/
│   ├── _persona.md
│   ├── 01-receive-batch-normal.md
│   ├── 02-flagged-batch-edge.md
│   └── 03-reversal-after-bad-post-error.md
│
├── payments-accounting/
│   ├── _persona.md
│   ├── 01-log-and-allocate-payment-normal.md
│   ├── 02-unapplied-balance-edge.md
│   └── 03-vendor-bill-payment-lifecycle.md
│
├── warehouse-operator/
│   ├── _persona.md
│   ├── 01-pick-weigh-fulfill-normal.md
│   ├── 02-weight-discrepancy-edge.md
│   └── 03-partial-fulfillment-error.md
│
├── support-operator/
│   ├── _persona.md
│   ├── 01-trace-order-status-normal.md
│   ├── 02-reconstruct-payment-history-edge.md
│   └── 03-missing-batch-investigation-error.md
│
├── photographer-readiness/
│   ├── _persona.md
│   ├── 01-batch-photo-session-normal.md
│   ├── 02-missing-media-blocker-edge.md
│   └── 03-catalog-readiness-sweep-normal.md
│
└── connector-actor/
    ├── _persona.md
    ├── 01-submit-connector-request-normal.md
    ├── 02-request-routing-edge.md
    └── 03-safe-default-no-ledger-write-error.md
```

**Total at launch:** 24 persona scenarios + 2 cross-persona lifecycle flows = 26 flows.

---

## Blocking Prerequisites (must exist before any flow is runnable)

### `_shared/seed-state-reference.md`

Must be authored from actual `pnpm db:seed:realistic` output. Do not hand-author. Required schema:

```markdown
# Seed State Reference
> Generated from: pnpm db:seed:realistic (last confirmed: YYYY-MM-DD)

## Customers
| Name | Credit Limit | Current Balance | Over Limit? | Status |
|------|-------------|-----------------|-------------|--------|

## Vendors
| Name | Active POs | Outstanding Bills |
|------|-----------|------------------|

## Live Inventory Batches (available for sale)
| Batch ID | Product | Qty | Status | Vendor |
|----------|---------|-----|--------|--------|

## Existing Invoices / Open Payments
| Customer | Invoice ID | Amount | Status |
|----------|-----------|--------|--------|

## Known Entities Missing from Seed
(List anything a scenario needs that the seed does not create — e.g., connector records.)
(Scenario must include a setup step to create it.)
```

### `_shared/navigation-primer.md`

Distilled from existing `docs/qa/navigation-guide.md`. Required schema:

```markdown
# Navigation Primer

## Golden rule
State-based routing. Never use browser URL to reach a view.
Navigate via sidebar or Quick Start bar only.

## Reaching each primary view
| View | Sidebar path | Hotkey |
|------|-------------|--------|
| Sales | Sidebar → Sales | Cmd+N |
| Intake | Sidebar → Intake | ... |
| ... | ... | ... |

## AG Grid interaction patterns
- Select a row: single click
- Edit an inline cell: double-click or Enter on selected cell
- Move between cells: Tab
- Virtualization: rows not in DOM until scrolled into view — filter or scroll before interacting
- Copy/paste: Cmd+C / Cmd+V on selected range

## Navigation blocker vs. known constraint
- Blocker: the app prevents reaching a view at all → file as finding
- Known constraint: reaching the view requires a prior step or scroll → not a finding, note it
```

---

## Scenario File Format

Every scenario file follows this template exactly. The template file lives at `_shared/scenario-template.md`.

```markdown
# [Persona Name] — [Scenario Title]

## Meta
- **Persona:** [Persona name]
- **Scenario type:** [normal | edge-case | error-path | cross-persona]
- **Risk tier:** [Normal | Deep QA | Critical]
- **Command families touched:** [CMD-XXX, CMD-YYY]
- **Estimated run time:** [N–M minutes]
- **Last validated:** [YYYY-MM-DD]

---

## Persona Context
[2–4 sentences: who this person is, what they want to accomplish in this scenario,
how they operate. Reference _persona.md for full detail.]

---

## Scenario
[1–3 sentences: what situation is being tested and why it matters.]

---

## Prerequisites
> Assumes `pnpm db:seed:realistic` has been run.
> See `_shared/seed-state-reference.md` for available entity names and balances.

[Any specific setup steps needed for this scenario that aren't in the seed.
If setup is needed, write it as numbered steps the agent executes before the flow begins.]

---

## Pre-Run Checklist
- [ ] `pnpm db:seed:realistic` confirmed (or seed entities verified to exist)
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If YES: file product gaps via MCP tool.
      If NO: write Linear stubs to `docs/qa/runs/YYYY-MM-DD-linear-pending.md`
      and flag in run report header as ⚠️ LINEAR MCP UNAVAILABLE

---

## Starting State
[Which view to navigate to. What filter or state to set before step 1.]
See `_shared/navigation-primer.md` if you need navigation help.

---

## Flow Steps

### Step 1 — [Step name]
**Action:** [What to do — verb-led, goal-oriented. Do not prescribe exact selectors.]
**Expected signal:** [What the agent observes to confirm the action worked.]

### Step 2 — [Step name]
**Action:** [...]
**Expected signal:** [...]

[Continue for all steps. Typical range: 5–10 steps for normal flows, up to 15 for lifecycle flows.]

---

## Pass Criteria
- [ ] [Measurable criterion 1]
- [ ] [Measurable criterion 2]
- [ ] [All critical state changes visible in the grid or toast]
- [ ] [No phantom rows, invoices, or status changes from blocked actions]

---

## Failure Modes to Watch For
- **[Mode name]:** [What it looks like and what it means — bug, gap, or ambiguous]

---

## Findings Format
For every finding, record:
```
FINDING: [one-line description]
Severity: [Critical | High | Medium | Low]
Step: [N]
Observed: [what actually happened]
Expected: [what should have happened]
Evidence: [screenshot saved to docs/qa/runs/screenshots/YYYYMMDD-[slug].png or DOM note]
```

---

## Related Flows
- `[path/to/flow.md]` — [why it's related]
```

---

## Persona Context File Format (`_persona.md`)

Every persona directory has one `_persona.md`. Template at `_shared/persona-template.md`.

```markdown
# Persona: [Name]

## Who They Are
[2–3 sentences: background, what their job is, what they care about.]

## Operating Style
- [Bullet: how they interact with the app — keyboard-first, grid-native, etc.]
- [Bullet: tolerance for friction / interruption]
- [Bullet: trust signals they rely on]

## Primary Views
- **[View name]** (`view: 'viewKey'`) — [why they're here]

## Command Families Used
- `CMD-XXX` — [what they use it for]

## What Good Looks Like
- [Concrete signal: e.g., "New sale draft created in under 30 seconds from zero"]

## What Friction Looks Like
(Flag these as findings even when the flow technically completes.)
- [Concrete friction signal: e.g., "Grid loses sort/filter state after a command runs"]

## Known System Constraints
(These are not bugs. Do not file findings for them.)
- State-based routing — see `_shared/navigation-primer.md`
- AG Grid virtualization — scroll or filter to bring rows into DOM
- Financial rounding — totals may vary ±$0.01–$0.26

## Scenarios in This Directory
| File | Type | Covers |
|------|------|--------|
| `01-[name].md` | normal | [one-line description] |
| `02-[name].md` | edge-case | [one-line description] |
| `03-[name].md` | error-path | [one-line description] |
```

---

## REGISTRY.md Format

The master dispatch and governance surface. Updated every time a flow is added.

```markdown
# TERP Operator Persona Flow Registry

> To run a specific flow:
> "Load `docs/qa/persona-flows/[path]` and `_shared/navigation-primer.md`
>  and `_shared/seed-state-reference.md`, confirm seed state, then execute."
>
> To run all Critical-tier flows:
> Filter table below by Risk = Critical. Load and execute each in order.
>
> Prerequisites for all flows:
> `pnpm db:seed:realistic` confirmed. App live at `http://127.0.0.1:5173`.

---

## Cross-Persona Flows (Critical — required for all ship decisions)

| # | File | Type | Risk | Commands | Est. Time |
|---|------|------|------|----------|-----------|
| X1 | `_cross-persona/01-purchase-to-payment-lifecycle.md` | cross-persona | Critical | CMD-INTAKE,CMD-SALES,CMD-FULFILLMENT,CMD-PAYMENTS | 25 min |
| X2 | `_cross-persona/02-intake-reversal-mid-sale.md` | cross-persona | Critical | CMD-INTAKE,CMD-SALES,CMD-RECOVERY | 20 min |

## Persona Flows

| # | Persona | File | Type | Risk | Commands | Est. Time |
|---|---------|------|------|------|----------|-----------|
| 1 | Owner / Main Manager | `owner-manager/01-morning-triage-normal.md` | normal | Normal | CMD-SALES,CMD-INTAKE | 10 min |
| 2 | Owner / Main Manager | `owner-manager/02-exception-approval-edge.md` | edge-case | Deep QA | CMD-SALES,CMD-PAYMENTS | 12 min |
| 3 | Owner / Main Manager | `owner-manager/03-period-closeout-full-lifecycle.md` | full-lifecycle | Deep QA | CMD-CLOSEOUT | 20 min |
| 4 | Sales Operator | `sales-operator/01-instant-sale-normal.md` | normal | Normal | CMD-SALES | 8 min |
| 5 | Sales Operator | `sales-operator/02-customer-credit-hold-edge.md` | edge-case | Deep QA | CMD-SALES,CMD-PAYMENTS | 10 min |
| 6 | Sales Operator | `sales-operator/03-no-available-inventory-error.md` | error-path | Normal | CMD-SALES | 6 min |
| 7 | Inventory Operator | `inventory-operator/01-receive-batch-normal.md` | normal | Normal | CMD-INTAKE,CMD-PO | 10 min |
| 8 | Inventory Operator | `inventory-operator/02-flagged-batch-edge.md` | edge-case | Deep QA | CMD-INTAKE | 10 min |
| 9 | Inventory Operator | `inventory-operator/03-reversal-after-bad-post-error.md` | error-path | Deep QA | CMD-INTAKE,CMD-RECOVERY | 12 min |
| 10 | Payments / Accounting | `payments-accounting/01-log-and-allocate-payment-normal.md` | normal | Deep QA | CMD-PAYMENTS | 10 min |
| 11 | Payments / Accounting | `payments-accounting/02-unapplied-balance-edge.md` | edge-case | Deep QA | CMD-PAYMENTS | 12 min |
| 12 | Payments / Accounting | `payments-accounting/03-vendor-bill-payment-lifecycle.md` | full-lifecycle | Critical | CMD-VENDOR,CMD-PAYMENTS | 15 min |
| 13 | Warehouse Operator | `warehouse-operator/01-pick-weigh-fulfill-normal.md` | normal | Normal | CMD-FULFILLMENT | 8 min |
| 14 | Warehouse Operator | `warehouse-operator/02-weight-discrepancy-edge.md` | edge-case | Deep QA | CMD-FULFILLMENT | 10 min |
| 15 | Warehouse Operator | `warehouse-operator/03-partial-fulfillment-error.md` | error-path | Deep QA | CMD-FULFILLMENT | 10 min |
| 16 | Support Operator | `support-operator/01-trace-order-status-normal.md` | normal | Normal | — (read-only) | 6 min |
| 17 | Support Operator | `support-operator/02-reconstruct-payment-history-edge.md` | edge-case | Normal | — (read-only) | 8 min |
| 18 | Support Operator | `support-operator/03-missing-batch-investigation-error.md` | error-path | Normal | CMD-RECOVERY | 8 min |
| 19 | Photographer / Readiness | `photographer-readiness/01-batch-photo-session-normal.md` | normal | Normal | CMD-INTAKE | 8 min |
| 20 | Photographer / Readiness | `photographer-readiness/02-missing-media-blocker-edge.md` | edge-case | Normal | CMD-INTAKE | 8 min |
| 21 | Photographer / Readiness | `photographer-readiness/03-catalog-readiness-sweep-normal.md` | normal | Normal | — (read-only) | 6 min |
| 22 | Connector Actor | `connector-actor/01-submit-connector-request-normal.md` | normal | Normal | CMD-CONNECTOR | 8 min |
| 23 | Connector Actor | `connector-actor/02-request-routing-edge.md` | edge-case | Normal | CMD-CONNECTOR | 8 min |
| 24 | Connector Actor | `connector-actor/03-safe-default-no-ledger-write-error.md` | error-path | Deep QA | CMD-CONNECTOR | 10 min |

---

## Coverage Summary

| Persona | Flows | Normal | Edge | Error/Lifecycle |
|---------|-------|--------|------|-----------------|
| _Cross-persona | 2 | — | — | 2 |
| Owner / Main Manager | 3 | 1 | 1 | 1 |
| Sales Operator | 3 | 1 | 1 | 1 |
| Inventory Operator | 3 | 1 | 1 | 1 |
| Payments / Accounting | 3 | 1 | 1 | 1 |
| Warehouse Operator | 3 | 1 | 1 | 1 |
| Support Operator | 3 | 1 | 1 | 1 |
| Photographer / Readiness | 3 | 2 | 1 | — |
| Connector Actor | 3 | 1 | 1 | 1 |
| **Total** | **26** | **9** | **8** | **9** |

---

## Adding a New Flow (5 steps)
1. Create file in the correct persona directory with next number prefix.
2. Use `_shared/scenario-template.md` as the base.
3. Add a row to the flow index table above.
4. Update the Coverage Summary counts.
5. If a new command family is introduced that spans two persona domains, add a cross-persona flow too.

## Adding a New Persona (5 steps)
1. Create `docs/qa/persona-flows/<persona-slug>/` directory.
2. Write `_persona.md` using `_shared/persona-template.md`.
3. Write at least one scenario file.
4. Add the persona to the Coverage Summary.
5. Note the addition in `docs/design-system/decisions-log.md`.

## Shared Resources
| File | Purpose |
|------|---------|
| `_shared/navigation-primer.md` | State-based routing, nav sequences, AG Grid patterns |
| `_shared/seed-state-reference.md` | Concrete entity names/IDs/balances from realistic seed |
| `_shared/scenario-template.md` | Blank scenario file |
| `_shared/persona-template.md` | Blank persona file |
```

---

## Findings Triage Process

The agent applies this decision tree to every finding, at each step and again at run end.

### Decision Tree

```
Is this a bug, breakage, or data integrity problem?
│
├── YES → GitHub Issue
│         gh issue list --state open --search "[keywords]"  (dedup first)
│         If new: gh issue create --title "Known issue: [symptom]"
│                                  --label "bug"
│                                  --body [standard body below]
│         If duplicate: gh issue comment [N] --body [evidence update]
│
└── NO → Missing capability, UX gap, or behavior that should exist?
          │
          ├── YES → Linear Issue
          │         If Linear MCP available: create via MCP tool
          │           - Project: TERP Operator, Team: Terpcorp (TER)
          │           - Map to nearest CAP-XXX or CMD-XXX registry ID if one exists
          │           - Label: product-gap or ux-gap
          │         If Linear MCP unavailable: append stub to
          │           docs/qa/runs/YYYY-MM-DD-linear-pending.md
          │           and flag run report header ⚠️ LINEAR MCP UNAVAILABLE
          │
          └── NO → Is it a known constraint in _persona.md or navigation-primer?
                    │
                    ├── YES → Not a finding. Note: "known constraint confirmed."
                    │
                    └── NO → GitHub Issue with label: needs-triage
                              (Evan classifies it)
```

### Standard GitHub Issue Body

```
**Persona flow:** docs/qa/persona-flows/[path]
**Step:** [N]
**Observed:** [what happened]
**Expected:** [what should have happened]
**Evidence:** docs/qa/runs/screenshots/YYYYMMDD-[slug].png (or DOM note)
**Repro:** pnpm db:seed:realistic → [ordered steps]
**Seed entities used:** [customer/vendor/batch names from seed-state-reference.md]
```

### Screenshot Naming Convention

All screenshots saved to: `docs/qa/runs/screenshots/`
Naming: `YYYYMMDD-[persona-slug]-step[N]-[slug].png`
Example: `20260522-sales-operator-step3-credit-block-no-message.png`

---

## Run Report + Grading System

### Scenario-Level Grades

| Grade | Meaning |
|-------|---------|
| ✅ Pass | All pass criteria met, no findings |
| 🟡 Pass with findings | Pass criteria met; non-blocking findings filed |
| 🔴 Fail | One or more pass criteria not met |
| ⬛ Blocked | Could not complete — environment, seed, or navigation blocker |

### Run-Level Health Score

```
Base: 100

Deductions (cumulative, floor 0):
  −20  per Critical finding  (phantom state, financial corruption, data integrity)
  −10  per High finding      (blocked user path, wrong/missing error, broken status)
  −5   per Medium finding    (friction, UX gap, missing resolution path)
  −2   per Low finding       (cosmetic, copy, non-blocking confusion)
  −5   per Blocked scenario  (could not run at all)

Grade thresholds:
  90–100 → A   ship-ready
  75–89  → B   shippable with tracked gaps
  60–74  → C   notable gaps; review before shipping
  40–59  → D   significant failures; do not ship
  < 40   → F   critical failures; stop
```

### Ship-Gate Validity Rule

A grade is only **VALID FOR SHIP DECISION** when:
1. All Critical-tier flows registered in REGISTRY.md were run (or explicitly marked `not-applicable` with a reason).
2. Both cross-persona flows (`_cross-persona/01` and `_cross-persona/02`) were run.

If either condition is unmet, the grade header shows:
```
## Overall Grade: B (82/100)
## ⚠️ SHIP GATE: INVALID — [reason: e.g. "cross-persona/01 not run"]
```

### Run Report File

Saved to: `docs/qa/runs/YYYY-MM-DD-[scope]-report.md`

```markdown
# QA Run Report — [Date]

**Scope:** [e.g., "Full suite — all 26 flows" or "Sales Operator — 3 flows"]
**Run by:** [agent name / session ID]
**Seed state:** pnpm db:seed:realistic confirmed ✓ (or ✗ with note)
**App:** http://127.0.0.1:5173
**Linear MCP:** Available ✓  |  Unavailable ⚠️ (stubs at docs/qa/runs/YYYY-MM-DD-linear-pending.md)

---

## Coverage
- Flows registered: 26
- Flows in scope: [N]
- Flows run: [N]
- Flows skipped: [N] ([list with reason: out-of-scope | blocked | deferred])
- Critical-tier flows run: [N] / [total Critical in REGISTRY]
- Cross-persona flows run: [N] / 2

---

## Overall Grade: [Letter] ([Score]/100)
## Ship Gate: [VALID ✓ | INVALID ⚠️ — reason]

---

## Per-Persona Summary

| Persona | Flows | ✅ Pass | 🟡 Pass w/ findings | 🔴 Fail | ⬛ Blocked |
|---------|-------|---------|---------------------|---------|-----------|
| _Cross-persona | 2 | | | | |
| Owner / Main Manager | 3 | | | | |
| Sales Operator | 3 | | | | |
| Inventory Operator | 3 | | | | |
| Payments / Accounting | 3 | | | | |
| Warehouse Operator | 3 | | | | |
| Support Operator | 3 | | | | |
| Photographer / Readiness | 3 | | | | |
| Connector Actor | 3 | | | | |
| **Total** | **26** | | | | |

---

## Score Breakdown
- Base: 100
- [List each deduction: "1× Critical finding (−20): [one-line description]"]
- **Final: [score]**

---

## Findings

### 🔴 Critical / High
| # | Finding | Persona | Step | Severity | Filed |
|---|---------|---------|------|----------|-------|

### 🟡 Medium / Low
| # | Finding | Persona | Step | Severity | Filed |
|---|---------|---------|------|----------|-------|

---

## Blocked Scenarios
| # | Scenario | Reason | Action taken |
|---|----------|--------|-------------|

---

## Actions Taken
- GH #[N] created — [severity], [one-line]
- Linear [TER-N] created — [product gap, CMD-XXX]
- [Any updates to seed-state-reference.md or navigation-primer.md]

---

## Recommendations
[Ordered by priority. First item should be the highest-severity unresolved finding.]
```

---

## Governance & Expansion Model

### Three Triggers That Require a Framework Update

| Trigger | Required action |
|---------|----------------|
| New command family ships | Add ≥1 scenario to persona(s) that use it + REGISTRY row. If it spans two persona domains, add a cross-persona flow. |
| New persona emerges | Create directory + `_persona.md` + ≥1 scenario + Coverage Summary row. |
| QA finding exposes untested path | Add scenario covering that path. Reference the GH/Linear issue that surfaced it in the scenario's Meta block. |

### Three Things That Do NOT Require a Framework Update

- Bug fixes that don't change the flow sequence (the scenario's expected signal already describes correct behavior)
- UI polish that doesn't change the step sequence
- Seed data changes — update `seed-state-reference.md` only

### Staleness

The `Last validated` date in every scenario's Meta block is the freshness signal.
- Scenarios not run in **30+ days**: mark as `⚠️ stale — needs validation pass` in REGISTRY.md.
- Stale scenarios are still runnable; their findings may include regressions introduced since last run.

### Linear Linkage

When a Linear ticket ships a new capability:
- The ticket description should reference the scenario file(s) that cover it.
- This closes the loop: "we built it" → "we have a reusable way to verify it."

### The Expansion Rule

> Every new capability that changes operator behavior gets a scenario file before it is considered done.

---

## AQA Review Summary

AQA run on 2026-05-22 against full design brief. Five findings, all resolved before spec was finalized.

| Finding | Severity | Resolution |
|---------|----------|-----------|
| Grade inflation — no coverage gate or ship-gate validity | Critical | Added Coverage block + Ship Gate validity rule to report format |
| `seed-state-reference.md` undefined | High | Elevated to blocking prerequisite with required schema |
| No cross-persona scenarios — ERP boundary bugs untested | High | Added `_cross-persona/` directory with 2 Critical-tier lifecycle flows; gated ship decisions on these |
| Linear MCP fallback undefined | Medium | Added pre-run checklist + fallback stub path + report header flag |
| `navigation-primer.md` undefined | Medium | Elevated to blocking prerequisite with required schema; distilled from existing `docs/qa/navigation-guide.md` |

AQA report: `/Users/evantenenbaum/.codex-runs/claude-qa/20260522T170846Z-var-folders-3f-v25vpwrx1mvg63nw1bf2bdyc0000gn-t-opencode-persona-0953ea/report.md`
