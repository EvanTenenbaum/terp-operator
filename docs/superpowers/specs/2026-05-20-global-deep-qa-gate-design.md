# Global Deep QA Gate Design

**Date:** 2026-05-20  
**Status:** Approved and implemented locally  
**Applies to:** OpenCode, Claude/Codex-style global instructions, GitHub-visible repo instructions

**Canonical source:** `/Users/evantenenbaum/AGENTS.md` is the canonical global gate source for local and global agent files. GitHub-visible repo files must be self-contained because they cannot assume local paths.

## Goal

Implement a unified, tiered Deep QA workflow so all agent surfaces see and follow the same quality gates. Prevent the baseline failures identified in the current system.

## Baseline Pressure-Test Gaps

1. **AQA skip on frontend work**: Current instructions allowed AQA to be skipped for meaningful frontend changes.
2. **Missing adversarial score gate**: No numerical quality threshold existed for skeptical review.
3. **Missing original-spec coverage review**: Agents outside OpenCode had no mandatory spec-coverage step.
4. **Silent dropping of non-blockers**: Non-blocking UX/system efficacy issues could be ignored without tracking.
5. **Misuse of "Normal QA" / "tranche-scoped" / "lightest sufficient"**: Language intended for efficiency was being used to under-verify meaningful/user-facing work.

## Target Surfaces

| Surface | File |
|---|---|
| Global non-OpenCode agents | `/Users/evantenenbaum/AGENTS.md` |
| Global Claude surfaces | `/Users/evantenenbaum/.claude/CLAUDE.md` |
| OpenCode skill | `/Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md` |
| TERP Operator repo (GitHub-visible) | `/Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md` |
| GitHub Copilot / Coding Agent | `/Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md` |

## QA Tiers

| Tier | Description | Verification Expectation |
|---|---|---|
| **Tiny** | Trivial, no user-facing impact | Lightest sufficient proof |
| **Normal** | Standard changes | Standard verification |
| **Deep QA** | User-facing, data-integrity, workflow-efficacy, architecture, integration, payment/credit, meaningful done-claim | Full Deep QA gate |
| **Critical** | Production-risk, financial, or safety-critical | Full Deep QA gate + highest rigor |

A `meaningful done claim` is a claim that a user-visible workflow, persisted data behavior, external integration, architecture decision, or requested task is complete, fixed, or passing.

`Critical` adds to `Deep QA`: highest rigor (e.g., `risk-verifier` / `closure-auditor`), cross-model review when relevant (if not applicable, document why), and rollout/rollback or migration safety proof when relevant (if not applicable, document why). If the change is not runnable, document an explicit blocker and rationale.

Scoring is required for `Deep QA` and `Critical` tiers and at explicit QA milestones named `Checkpoint` and `Full Gate` by the active plan or process; `Tiny` and `Normal` tasks do not require scoring unless explicitly scoped.

## Judgment Gate

- Use the lightest sufficient proof for `Tiny` and small tasks.
- **Do not under-classify** work that touches frontend, user experience, data integrity, operator workflow efficacy, or meaningful done claims.
- "Tranche-scoped" and "lightest sufficient" are **efficiency disciplines**, not excuses to skip verification of known issues or spec items.

## Deep QA Components (Deep QA and Critical tiers)

1. **AQA at appropriate checkpoints** — at minimum before any meaningful done claim; additionally after major repair loops or high-risk UI/data changes. Not skipped for frontend or meaningful work.
2. **Original-spec coverage review** — verify the implementation satisfies the original requirements; do not rely on memory or narration.
3. **Frontend/user-facing priority** — explicitly prioritize verification of UI/UX, error paths, loading states, and accessibility.
4. **Adversarial score 0-100** — repair loop to `>= 95/100` or document an explicit blocker/rationale.
   Scoring starts at 100; reducers are applied cumulatively with a floor of 0. Rubric (score reducers): missing AQA (-10 to -20), missing spec coverage (-10), unresolved/untracked non-blocker (-5 each), broken frontend/user path (-15 to -25), missing evidence for a claim (-10), rejected finding without evidence (-10).
5. **Non-blocking issue discipline** — blocking issues first. Non-blocking issues that affect system efficacy, UX, reliability, confidence, or operator workflow must be fixed in-scope or tracked durably with rationale. They cannot be silently ignored.

## Closeout Evidence Requirements

Must include all of the following:

- QA tier and rationale
- Commands/tests/runtime checks run
- AQA report path and adversarial/final score (required for Deep QA/Critical; mark N/A with tier rationale otherwise)
- Spec coverage result (required for Deep QA/Critical; mark N/A with tier rationale otherwise)
- Accepted findings fixed
- Rejected findings with evidence
- Remaining non-blockers fixed or tracked with rationale

## Non-Blockers Rule

Blocking issues first.  
Non-blocking issues that affect system efficacy, user experience, reliability, confidence, or operator workflow must be:

- Fixed in-scope, **or**
- Tracked durably in the appropriate system (GitHub Issues, Linear, `~/.agent-state/tasks`) with rationale.

They **cannot be silently ignored**.

## Self-Review Notes

- The "lightest sufficient" language was preserved and refined with a caveat rather than deleted, because it remains a useful efficiency discipline for genuinely tiny work.
- Frontend/user-facing work is explicitly called out as high-priority in Deep QA.
- The closeout checklist is intentionally concise to avoid checkbox fatigue while still ensuring accountability.
- All surfaces receive equivalent gate language adapted to their context (global vs. repo-local vs. skill vs. Copilot).
- GitHub-visible repo files (`AGENTS.md`, `.github/copilot-instructions.md`) are self-contained and inline the full gate rules, because GitHub agents cannot assume access to local-only `/Users/...` paths.
- Checkpoint/Full Gate scoring and Critical applicability conditionals were intentionally clarified: scoring is required for `Deep QA` and `Critical` tiers and at explicit QA milestones named `Checkpoint` and `Full Gate`; `Critical` adds to `Deep QA` rather than being a separate unrelated tier.
- An adversarial score rubric was added so 95 is auditable rather than self-assigned.
