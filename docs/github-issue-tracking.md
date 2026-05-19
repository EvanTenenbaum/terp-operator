# GitHub Issue Tracking

GitHub Issues are the TERP Operator source of truth for **bugs, runtime failures, data drift, test gaps, confusing UX, and other problems**.

They are **not** for feature development, sub-roadmaps, epics, or capability proposals. That work belongs in repo roadmap docs under `docs/roadmap/`.

## Issue Type

- **Known issue**: confirmed or suspected bug, runtime failure, confusing UX, data drift, or test gap.

Use the `Known issue` form in `.github/ISSUE_TEMPLATE/known_issue.yml` so every issue has enough context for another agent to pick it up without re-discovery.

## Agent Workflow

1. Search before creating:

   ```bash
   gh issue list --state open --search "<keywords>"
   ```

2. Classify before tracking:

   - Is this a bug, failure, gap, or problem? → Open a Known issue.
   - Is this a feature, epic, or capability proposal? → Add or update a doc in `docs/roadmap/` instead.

3. Create with the Known issue form:

   ```bash
   gh issue create --template known_issue.yml --title "Known issue: <short symptom>"
   ```

4. Label consistently:

   - Tracking: `tracking:known-issue`
   - Status: `status:needs-triage`, `status:ready`, `status:blocked`, `status:in-progress`, `status:verified`
   - Source: `source:agent`, `source:annotation`
   - Area: `area:ux`, `area:runtime`, `area:data`, `area:qa`
   - Risk: `risk:high`

5. Keep issue bodies evidence-first:

   - Route, command, component, file path, or exact workflow step.
   - Expected vs actual behavior.
   - Verification commands or browser proof.
   - Links to artifacts, screenshots, traces, PRs, docs, or commits.

6. Close with proof:

   ```bash
   gh issue comment <number> --body "Closed with evidence: <command/browser/deploy proof>."
   gh issue close <number> --comment "Closed with evidence: <summary>."
   ```

## Triage Rules

- Keep runtime bugs separate from annotation-driven UX/product work.
- Mark uncertain findings as `status:needs-triage`; do not silently bury them in chat.
- If demo data drift causes a false failure, classify it as `fixture gap` in a Known issue.
- If a test is missing for a real workflow, classify it as `coverage gap`.
- If the app works as designed but the design is insufficient, classify it as `product gap`. A product gap tracks a shortfall in current behavior — not a proposal for new capability. If correcting the gap requires designing new functionality, route to `docs/roadmap/` instead.
- If the expectation was wrong or obsolete, classify it as `expectation gap`.

## Labels

The desired label set lives in `.github/labels.yml`. If labels are missing in GitHub, sync them with:

```bash
while IFS='|' read -r name color description; do
  gh label create "$name" --color "$color" --description "$description" --force
done <<'LABELS'
tracking:known-issue|d73a4a|Confirmed or suspected bug, runtime failure, confusing UX, data drift, or test gap.
status:needs-triage|fbca04|Needs owner, priority, or scope decision.
status:ready|0e8a16|Ready for implementation.
status:blocked|b60205|Blocked by missing input, runtime, dependency, or decision.
status:in-progress|5319e7|Actively being worked.
status:verified|006b75|Closed or ready to close with evidence.
source:agent|bfdadc|Created or updated by an agent.
source:annotation|c5def5|Came from live annotation or screen feedback.
area:ux|c2e0c6|User experience or interface behavior.
area:runtime|f9d0c4|Runtime, server, browser, or environment behavior.
area:data|d4c5f9|Database, seed, fixture, migration, or data shape.
area:qa|fef2c0|Tests, verification, coverage, or release gates.
risk:high|b60205|High workflow, data, money, auth, or deploy risk.
LABELS
```
