# Copilot / Coding Agent Instructions

This repository uses the TERP Operator agent instructions in `AGENTS.md`.

## Quick Reference

- Read `AGENTS.md` in this repo before making changes.
- Before substantial work, run `pnpm agent:doctor` when available and follow its guidance. If the doctor reports you are outside the canonical TERP Operator repo, stop and redirect instead of editing legacy TERP-family folders.

## Where work lives

TERP Operator uses three systems:
1. **Linear** — product execution source of truth (workspace `terpcorp`, team `Terpcorp`, project TERP Operator).
2. **In-session TODOs** — ephemeral session working memory only.
3. **GitHub Issues** — repo-level bugs and problems only. Not for backlog or feature tracking.

See `AGENTS.md` for full details.

## Deep QA Gate (self-contained)

Define four tiers: `Tiny` (trivial, no user-facing impact), `Normal` (standard changes), `Deep QA` (user-facing, data-integrity, workflow-efficacy, architecture, integration, payment/credit, or meaningful done-claim work), and `Critical` (production-risk, financial, or safety-critical changes).

A `meaningful done claim` is a claim that a user-visible workflow, persisted data behavior, external integration, architecture decision, or requested task is complete, fixed, or passing.

`Critical` adds to `Deep QA`: highest rigor (e.g., `risk-verifier` / `closure-auditor`), cross-model review when relevant (if not applicable, document why), and rollout/rollback or migration safety proof when relevant (if not applicable, document why). If the change is not runnable, document an explicit blocker and rationale.

Scoring is required for `Deep QA` and `Critical` tiers and at explicit QA milestones named `Checkpoint` and `Full Gate` by the active plan or process; `Tiny` and `Normal` tasks do not require scoring unless explicitly scoped.

TERP-specific examples of `Deep QA` work: operator console UI, spreadsheet interactions, order/purchase workflows, and data integrity.

- **Judgment gate**: Use the lightest sufficient proof for `Tiny` and small tasks, but do not under-classify work that touches frontend, user experience, data integrity, operator workflow efficacy, or meaningful done claims. "Tranche-scoped" and "lightest sufficient" are efficiency disciplines, not excuses to skip verification of known issues or spec items.
- **Deep QA components** (triggered for `Deep QA` and `Critical` tiers):
  1. **AQA at appropriate checkpoints** — at minimum before any meaningful done claim; additionally after major repair loops or high-risk UI/data changes. Not skipped for frontend or meaningful work. If the local `/aqa` command is unavailable, use the available AQA or adversarial review mechanism; if none is available, record the blocker and request or handoff for AQA rather than silently skipping it.
  2. **Original-spec coverage review**: verify the implementation satisfies the original requirements; do not rely on memory or narration.
  3. **Frontend/user-facing priority**: explicitly prioritize verification of UI/UX, error paths, loading states, and accessibility.
  4. **Adversarial score**: 0-100. Repair loop to `>= 95/100` or document an explicit blocker/rationale.
     Scoring starts at 100; reducers are applied cumulatively with a floor of 0. Rubric (score reducers): missing AQA (-10 to -20), missing spec coverage (-10), unresolved/untracked non-blocker (-5 each), broken frontend/user path (-15 to -25), missing evidence for a claim (-10), rejected finding without evidence (-10).
  5. **Non-blocking issue discipline**: blocking issues first. Non-blocking issues that affect system efficacy, UX, reliability, confidence, or operator workflow must be fixed in-scope or tracked in the appropriate system with rationale: Linear for product/workflow/capability gaps, GitHub Issues for repo-level bugs/problems, or in-session TODO only for current-session decomposition. They cannot be silently ignored.
- **Closeout evidence must include**: QA tier and rationale; commands/tests/runtime checks run; AQA report path and adversarial/final score (required for Deep QA/Critical; mark N/A with tier rationale otherwise); spec coverage result (required for Deep QA/Critical; mark N/A with tier rationale otherwise); accepted findings fixed; rejected findings with evidence; remaining non-blockers fixed or tracked with rationale.

- Use GitHub Issues for repo-level bugs, problems, and known issues only. Product execution lives in Linear.
