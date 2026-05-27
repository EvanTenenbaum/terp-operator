# Agent GitHub-First Workflow

> **Scope:** This doc defines the canonical multi-agent setup and guardrails for TERP Operator. Every implementation agent must follow it.

## Source-of-Truth Hierarchy

1. **`origin/main`** on `https://github.com/EvanTenenbaum/terp-operator` is the ultimate source of truth for code.
2. **GitHub Issues** are the durable source of truth for bugs, problems, test gaps, and known issues.
3. **Roadmap docs** under `docs/roadmap/` are the durable source of truth for features, epics, and persistent initiatives.
4. **AgentMemory** is for durable workflow decisions and cross-agent context only—not for temporary progress notes or raw logs.
5. **Local dirty state** is *never* a source of truth. Uncommitted changes, unstaged files, and un-pushed branches are provisional and can be lost.

## Local `main` Is Read-Only

The `main` branch in any local checkout is a read-only mirror of `origin/main`.

- Do not commit to local `main`.
- Do not keep long-lived dirty state on `main`.
- If you are on `main` and need to do work, create a fresh worktree from `origin/main` instead.

## Fresh Worktree for Every Implementation

Every implementation agent must use a fresh worktree checked out from `origin/main`.

```bash
# Preferred: create the worktree and branch in one step
git fetch origin
git worktree add -b feat/<feature-name> ../terp-operator-<feature-name> origin/main
cd ../terp-operator-<feature-name>
```

- One writable owner per worktree. Do not have multiple agents editing the same worktree simultaneously.
- Reviewers and QA agents should treat worktrees as read-only unless explicitly assigned write access.

## Early Branch / Draft PR / Checkpoint

Push meaningful work early and often:

1. Create a branch as soon as you start implementation.
2. Open a **draft PR** once you have any non-trivial change.
3. Push checkpoints at natural boundaries (e.g., after a passing test, after a doc update, after a refactor).
4. Prefer small, reviewable commits over large monolithic ones.

Durable status must live in GitHub (issue/PR comments) or roadmap docs, not in local-only state.

## Issue vs Roadmap Split

| Use GitHub Issues for | Use `docs/roadmap/` for |
|-----------------------|------------------------|
| Bugs and runtime failures | Features and capabilities |
| Test gaps | Epics and sub-roadmaps |
| Confusing UX / data drift | Persistent initiatives |
| Fixture / coverage gaps | Architecture decisions |
| Expectation gaps | Release planning |

Before creating a new issue, classify the finding. If it is a feature or capability, write or update a roadmap doc instead.

## Closeout and Non-Blocking Finding Discipline

When finishing work:

1. **Blocking issues first.** Fix anything that prevents the workflow from being correct or safe.
2. **Non-blocking findings** that affect system efficacy, UX, reliability, or operator workflow must be either:
   - Fixed in-scope, or
   - Tracked durably in a GitHub Issue (with rationale) or roadmap doc.
3. Do not silently ignore non-blocking issues.
4. Closeout evidence must include:
   - QA tier and rationale
   - Commands/tests/runtime checks run
   - AQA report path and adversarial/final score (for Deep QA / Critical)
   - Spec coverage result
   - Accepted findings fixed
   - Rejected findings with evidence
   - Remaining non-blockers fixed or tracked with rationale

## Resuming from a 10-Line Resume Packet

When a new agent spins up from a prior agent’s 10-line resume packet:

1. Treat the packet as a **pointer**, not truth.
2. Read the durable sources first:
   - `AGENTS.md`
   - `docs/agent-source-of-truth.md`
   - this doc (`docs/agent-github-first-workflow.md`)
   - the relevant GitHub issue or roadmap doc
3. Run `pnpm agent:doctor`.
   ```bash
   git fetch origin
   git status --short --branch
   git log --oneline -3 origin/main
   ```
4. Create or use a **fresh worktree from `origin/main`** unless explicitly assigned an existing preserved worktree. Do not edit local `main`.
5. Before coding, restate:
   - Durable source (issue/roadmap link)
   - Branch/worktree name
   - Planned first atomic action
   - QA tier
6. If resuming from preserved patch bundles, apply them only after comparing against `origin/main` and the durable source.

## Quick Reference

| Check | Command |
|-------|---------|
| Verify canonical repo | `pnpm agent:doctor` |
| Verify repo freshness | `git fetch origin && git status --short --branch && git log --oneline -3 origin/main` |
| Create fresh worktree | `git worktree add -b <branch> ../<name> origin/main` |
| Open draft PR | `gh pr create --draft` |
