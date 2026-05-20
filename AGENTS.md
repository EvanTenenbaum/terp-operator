# TERP Operator Agent Instructions

Follow `/Users/evantenenbaum/AGENTS.md` first, then this file. If a deeper `AGENTS.md` is added later, the deeper file wins for its subtree.

## Quick Start: Orientation & Design System

**Before substantial work, read:**

1. **[docs/agent-orientation/START_HERE.md](docs/agent-orientation/START_HERE.md)** — entry point. Architecture, dev workflow, domain concepts, code organization. ~5 minutes.
2. **[docs/design-system/INDEX.md](docs/design-system/INDEX.md)** — frontend patterns. Components, styling, state, AG Grid. Skim the section that matches your task.
3. **[docs/design-system/decisions-log.md](docs/design-system/decisions-log.md)** — recent design decisions you should respect.

These docs are the source of truth for component locations, the hybrid Tailwind+semantic-class styling system, and the `useCommandRunner` / `useUiStore` / tRPC contracts. They were rewritten from the actual codebase on 2026-05-18 (see the first decision-log entry for the spec-vs-reality story).

**Before committing frontend work:**

- Created a new component, semantic CSS class, or pattern? → Append a rationale entry to `docs/design-system/decisions-log.md`.
- Added or removed components? → Run `pnpm docs:inventory` to regenerate `docs/design-system/components/_inventory.json`.
- Established a new design convention others should follow? → Update the matching `docs/design-system/*.md` and link it from `decisions-log.md`.

(There is no git pre-commit hook enforcing this — the global `core.hooksPath` is already load-bearing for the agent-core hooks. The reminder lives here instead.)

## Canonical Identity

This product is **TERP Operator**. Use that name in new agent handoffs, product notes, QA reports, UI copy, and GitHub issues.

The active GitHub source of truth is:

```text
https://github.com/EvanTenenbaum/terp-operator
```

Older local folders and historical docs may still say `terp-agro` or `terp-agro-operator-console`. Treat those as historical/internal identifiers only. The active repo is now `terp-operator`; the old GitHub slug is a redirect/legacy alias, not the preferred name. Do not infer that work belongs in the deprecated TERP, TERP Numbers, or old TERP Agro repositories because of those names.

Before substantial work, run:

```bash
pnpm agent:doctor
```

If the doctor reports that you are outside the canonical repo, stop and redirect to the TERP Operator checkout instead of editing the nearest TERP-like folder. Legacy TERP-family repos are read-only reference material unless Evan explicitly asks otherwise.

## Project Posture

TERP Operator is an operator console for dense, spreadsheet-native wholesale workflows. Prefer working product changes, runtime proof, and issue writeback over broad narration. Preserve existing worktree changes unless Evan explicitly asks you to revert them.

## GitHub Issue Tracking

Use GitHub Issues **only** for bugs, runtime failures, data drift, test gaps, confusing UX, fixture gaps, coverage gaps, expectation gaps, and other problems.

Do **not** use GitHub Issues for feature development, sub-roadmaps, epics, or capability proposals. That work belongs in repo roadmap docs under `docs/roadmap/`.

Before creating a new issue:

1. **Classify the finding**: is it a bug/problem or a feature/capability? If uncertain, classify before tracking.
2. Search existing open issues with `gh issue list --state open --search "<keywords>"`.
3. Reuse or update an existing issue when it is the same work.
4. Create a new issue only when the finding is distinct enough to track independently.

Use the `Known issue` form for all problem-oriented issues:

- Confirmed or strongly suspected bugs, runtime failures, confusing UX, data drift, or test gaps.

When creating or updating issues:

- Use labels from `.github/labels.yml` when possible.
- Include exact route, command, file path, screenshot/log path, browser URL, or test output when available.
- Keep runtime bugs separate from annotation-driven UX observations and product gaps.
- Separate `product gap`, `fixture gap`, `coverage gap`, `runtime bug`, and `expectation gap` in the issue body when that distinction matters.
- Prefer acceptance criteria and verification steps over vague desired-state prose.
- Link related PRs, commits, docs, artifacts, or earlier issues.

When closing issues:

- Close only with evidence: merged code, passing command, browser verification, deploy proof, or an explicit rejection rationale.
- Comment with the evidence before closing when the proof is not obvious from the closing PR.
- If a fix is partial, leave the issue open and add a progress comment.

## Recommended Commands

```bash
gh issue list --state open --search "purchase order label:tracking:known-issue"
gh issue create --template known_issue.yml --title "Known issue: <short symptom>"
gh issue view <number> --comments
gh issue comment <number> --body "Evidence: ..."
```

## Local Verification

For meaningful code changes, run the lightest sufficient verification before claiming completion. Common checks:

```bash
pnpm typecheck
PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts --project=chromium --workers=1
```

Use the live local app at `http://127.0.0.1:5173` for browser proof when the change affects operator workflows.

## Deep QA Gate (Global)

This repo follows the global Deep QA gate (canonical source: `/Users/evantenenbaum/AGENTS.md`). The rules below are self-contained so GitHub-visible agents can use them without relying on local-only paths.

Define four tiers: `Tiny` (trivial, no user-facing impact), `Normal` (standard changes), `Deep QA` (user-facing, data-integrity, workflow-efficacy, architecture, integration, payment/credit, or meaningful done-claim work), and `Critical` (production-risk, financial, or safety-critical changes).

A `meaningful done claim` is a claim that a user-visible workflow, persisted data behavior, external integration, architecture decision, or requested task is complete, fixed, or passing.

`Critical` adds to `Deep QA`: highest rigor (e.g., `risk-verifier` / `closure-auditor`), cross-model review when relevant (if not applicable, document why), and rollout/rollback or migration safety proof when relevant (if not applicable, document why). If the change is not runnable, document an explicit blocker and rationale.

Scoring is required for `Deep QA` and `Critical` tiers and at explicit QA milestones named `Checkpoint` and `Full Gate` by the active plan or process; `Tiny` and `Normal` tasks do not require scoring unless explicitly scoped.

Key rules for TERP Operator:

- Any work touching the operator console UI, spreadsheet interactions, order/purchase workflows, or data integrity is at least `Deep QA` tier.
- **Judgment gate**: Use the lightest sufficient proof for `Tiny` and small tasks, but do not under-classify work that touches frontend, user experience, data integrity, operator workflow efficacy, or meaningful done claims. "Tranche-scoped" and "lightest sufficient" are efficiency disciplines, not excuses to skip verification of known issues or spec items.
- **Deep QA components** (triggered for `Deep QA` and `Critical` tiers):
  1. **AQA at appropriate checkpoints** — at minimum before any meaningful done claim; additionally after major repair loops or high-risk UI/data changes. Not skipped for frontend or meaningful work.
  2. **Original-spec coverage review**: verify the implementation satisfies the original requirements; do not rely on memory or narration.
  3. **Frontend/user-facing priority**: explicitly prioritize verification of UI/UX, error paths, loading states, and accessibility.
  4. **Adversarial score**: 0-100. Repair loop to `>= 95/100` or document an explicit blocker/rationale.
     Scoring starts at 100; reducers are applied cumulatively with a floor of 0. Rubric (score reducers): missing AQA (-10 to -20), missing spec coverage (-10), unresolved/untracked non-blocker (-5 each), broken frontend/user path (-15 to -25), missing evidence for a claim (-10), rejected finding without evidence (-10).
  5. **Non-blocking issue discipline**: blocking issues first. Non-blocking issues that affect system efficacy, UX, reliability, confidence, or operator workflow must be fixed in-scope or tracked durably in GitHub Issues with rationale. They cannot be silently ignored.
- **Closeout evidence must include**: QA tier and rationale; commands/tests/runtime checks run; AQA report path and adversarial/final score (required for Deep QA/Critical; mark N/A with tier rationale otherwise); spec coverage result (required for Deep QA/Critical; mark N/A with tier rationale otherwise); accepted findings fixed; rejected findings with evidence; remaining non-blockers fixed or tracked with rationale.
