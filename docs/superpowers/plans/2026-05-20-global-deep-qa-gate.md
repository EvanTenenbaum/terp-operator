# Implementation Plan: Global Deep QA Gate

**Date:** 2026-05-20  
**Status:** Implemented locally; not committed
> Note: No commit, stage, or push was requested for this change.

## Files to Create/Modify

| # | Action | File |
|---|---|---|
| 1 | Modify | `/Users/evantenenbaum/AGENTS.md` |
| 2 | Modify | `/Users/evantenenbaum/.claude/CLAUDE.md` |
| 3 | Modify | `/Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md` |
| 4 | Modify | `/Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md` |
| 5 | Create | `/Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md` |
| 6 | Create | `/Users/evantenenbaum/work/terp-agro-operator-console/docs/superpowers/specs/2026-05-20-global-deep-qa-gate-design.md` |
| 7 | Create | `/Users/evantenenbaum/work/terp-agro-operator-console/docs/superpowers/plans/2026-05-20-global-deep-qa-gate.md` |

## Exact Changes

### 1. `/Users/evantenenbaum/AGENTS.md`

Insert a **QA Tiers and Deep QA Gate** section after the existing "Default QA tier to Normal" bullet.

Content:
- Define four tiers: Tiny, Normal, Deep QA, Critical.
- Judgment gate: lightest sufficient for tiny tasks; do not under-classify frontend/UX/data-integrity/workflow-efficacy/done-claim work.
- Clarify "tranche-scoped" and "lightest sufficient" are efficiency disciplines, not excuses to skip known issues or spec items.
- Deep QA components: AQA (not skipped for frontend), original-spec coverage review, frontend/user-facing priority, adversarial score >=95 or blocker/rationale, non-blocking issue discipline.
- Closeout evidence checklist.

### 2. `/Users/evantenenbaum/.claude/CLAUDE.md`

Insert equivalent **QA Tiers and Deep QA Gate** section after the existing "Default QA tier to Normal" bullet.

Content mirrors the global AGENTS.md gate language.

### 3. `/Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md`

- Improve description if needed (keep third-person, trigger-focused).
- Add **QA Tiers and Deep QA Gate** section.
- Add **Closeout Checklist** under Done Means.

### 4. `/Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md`

Insert **Deep QA Gate (Global)** section after Local Verification.

Content:
- Inline self-contained Deep QA gate rules (GitHub-visible agents cannot assume local `/Users/...` paths).
- Keep `/Users/evantenenbaum/AGENTS.md` and `/Users/evantenenbaum/.claude/CLAUDE.md` as provenance references only.
- Any work touching operator console UI, spreadsheet interactions, order/purchase workflows, or data integrity is at least Deep QA tier.
- Frontend/user-facing verification is mandatory and prioritized.
- Non-blocking issue discipline with GitHub Issues as durable tracker.
- Closeout evidence requirements.

### 5. `/Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md`

New file. Short pointer to AGENTS.md plus Deep QA/non-blocker discipline summary.

### 6. Design spec (this plan's source of truth)

Create `/Users/evantenenbaum/work/terp-agro-operator-console/docs/superpowers/specs/2026-05-20-global-deep-qa-gate-design.md` with approved design, baseline gaps, target surfaces, tier definitions, judgment gate, Deep QA components, closeout evidence, non-blockers rule, and self-review notes.

### 7. This plan file

Create `/Users/evantenenbaum/work/terp-agro-operator-console/docs/superpowers/plans/2026-05-20-global-deep-qa-gate.md`.

## Verification Commands

```bash
# Verify all changed/created files exist and contain expected terms
grep -r "Deep QA" /Users/evantenenbaum/AGENTS.md /Users/evantenenbaum/.claude/CLAUDE.md /Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md /Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md /Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md
grep -r "AQA" /Users/evantenenbaum/AGENTS.md /Users/evantenenbaum/.claude/CLAUDE.md /Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md /Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md /Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md
grep -r "95" /Users/evantenenbaum/AGENTS.md /Users/evantenenbaum/.claude/CLAUDE.md /Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md /Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md /Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md
grep -r "non-blocking" /Users/evantenenbaum/AGENTS.md /Users/evantenenbaum/.claude/CLAUDE.md /Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md /Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md /Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md
grep -r "spec coverage" /Users/evantenenbaum/AGENTS.md /Users/evantenenbaum/.claude/CLAUDE.md /Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md /Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md /Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md
grep -r "frontend" /Users/evantenenbaum/AGENTS.md /Users/evantenenbaum/.claude/CLAUDE.md /Users/evantenenbaum/.config/opencode/skills/evan-workflow/SKILL.md /Users/evantenenbaum/work/terp-agro-operator-console/AGENTS.md /Users/evantenenbaum/work/terp-agro-operator-console/.github/copilot-instructions.md

# Check git status (do not stage)
git -C /Users/evantenenbaum/work/terp-agro-operator-console status --short
```

## Out of Scope

- No commit, stage, push, or revert is requested.
- Preserve all existing uncommitted work.
