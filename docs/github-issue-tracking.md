# GitHub Issue Tracking

GitHub Issues are the TERP Agro source of truth for backlog, to-do, and known-issue tracking.

## Issue Types

- **Backlog item**: planned product, UX, workflow, or architecture work.
- **To-do**: a small concrete follow-up with a clear action.
- **Known issue**: confirmed or suspected bug, runtime failure, confusing UX, data drift, or test gap.

Use the forms in `.github/ISSUE_TEMPLATE/` so every issue has enough context for another agent to pick it up without re-discovery.

## Agent Workflow

1. Search before creating:

   ```bash
   gh issue list --state open --search "<keywords>"
   ```

2. Choose the right form:

   ```bash
   gh issue create --template backlog_item.yml --title "Backlog: <operator outcome>"
   gh issue create --template todo.yml --title "To-do: <specific task>"
   gh issue create --template known_issue.yml --title "Known issue: <short symptom>"
   ```

3. Label consistently:

   - Tracking: `tracking:backlog`, `tracking:todo`, `tracking:known-issue`
   - Status: `status:needs-triage`, `status:ready`, `status:blocked`, `status:in-progress`, `status:verified`
   - Source: `source:agent`, `source:annotation`
   - Area: `area:ux`, `area:runtime`, `area:data`, `area:qa`
   - Risk: `risk:high`

4. Keep issue bodies evidence-first:

   - Route, command, component, file path, or exact workflow step.
   - Expected vs actual behavior for issues.
   - Acceptance criteria for backlog and to-do work.
   - Verification commands or browser proof.
   - Links to artifacts, screenshots, traces, PRs, docs, or commits.

5. Close with proof:

   ```bash
   gh issue comment <number> --body "Closed with evidence: <command/browser/deploy proof>."
   gh issue close <number> --comment "Closed with evidence: <summary>."
   ```

## Triage Rules

- Keep runtime bugs separate from annotation-driven UX/product work.
- Mark uncertain findings as `status:needs-triage`; do not silently bury them in chat.
- If demo data drift causes a false failure, classify it as `fixture gap` in a Known issue.
- If a test is missing for a real workflow, classify it as `coverage gap`.
- If the app works as designed but the design is insufficient, classify it as `product gap`.
- If the expectation was wrong or obsolete, classify it as `expectation gap`.

## Labels

The desired label set lives in `.github/labels.yml`. If labels are missing in GitHub, sync them with:

```bash
while IFS='|' read -r name color description; do
  gh label create "$name" --color "$color" --description "$description" --force
done <<'LABELS'
tracking:backlog|1d76db|Planned product, UX, workflow, or architecture work.
tracking:todo|0e8a16|Small concrete follow-up task.
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
