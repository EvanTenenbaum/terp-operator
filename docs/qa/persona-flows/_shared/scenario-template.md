# [Persona Name] — [Scenario Title]

## Meta
- **Persona:** [Persona name]
- **Scenario type:** [normal | edge-case | error-path | cross-persona]
- **Risk tier:** [Normal | Deep QA | Critical]
- **Command families touched:** [CMD-XXX, CMD-YYY]
- **Estimated run time:** [N–M minutes]
- **Last validated:** [not yet run]

---

## Persona Context
[2–4 sentences: who this person is, what they want to accomplish in this scenario,
how they operate. Reference _persona.md for full detail.]

---

## Scenario
[1–3 sentences: what situation is being tested and why it matters.]

---

## Prerequisites
> Assumes `pnpm db:seed:realistic` has been run (or entities verified per `_shared/seed-state-reference.md`).
> See `_shared/seed-state-reference.md` for available entity names and known setup requirements.

[Any specific setup steps needed for this scenario. Write setup as numbered steps
the agent executes before the flow begins.]

---

## Pre-Run Checklist
- [ ] Seed entities confirmed (see `_shared/seed-state-reference.md`)
- [ ] App running at `http://127.0.0.1:5173`
- [ ] Linear MCP available? If YES: file product gaps via MCP tool.
      If NO: write Linear stubs to `docs/qa/runs/YYYY-MM-DD-linear-pending.md`
      and flag in run report header as ⚠️ LINEAR MCP UNAVAILABLE

---

## Starting State
[Which view to navigate to. What filter or state to apply before step 1.]
See `_shared/navigation-primer.md` for navigation help.

---

## Flow Steps

### Step 1 — [Step name]
**Action:** [Verb-led, goal-oriented instruction. Do not prescribe exact CSS selectors.]
**Expected signal:** [What the agent observes to confirm the action worked.]

### Step 2 — [Step name]
**Action:** [...]
**Expected signal:** [...]

[Typical range: 5–10 steps for normal/edge flows, up to 15 for lifecycle flows.]

---

## Pass Criteria
- [ ] [Measurable criterion]
- [ ] [All critical state changes visible in grid or toast]
- [ ] [No phantom rows, invoices, or status changes from blocked actions]

---

## Failure Modes to Watch For
- **[Mode name]:** [What it looks like and what it signals — bug, gap, or ambiguous]

---

## Findings Format

For every finding, record:

```
FINDING: [one-line description]
Severity: [Critical | High | Medium | Low]
Step: [N]
Observed: [what happened]
Expected: [what should have happened]
Evidence: [screenshot at docs/qa/runs/screenshots/YYYYMMDD-[persona]-step[N]-[slug].png or DOM note]
```

---

## Related Flows
- `[path/to/flow.md]` — [why it's related]
