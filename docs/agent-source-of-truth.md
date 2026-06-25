# TERP Operator Agent Source Of Truth

## Canonical Name

The product is **TERP Operator**.

Use `TERP Operator` in new agent handoffs, QA notes, implementation plans, GitHub issues, PRs, and user-facing product copy.

## Canonical Repo

The active codebase is:

```text
https://github.com/EvanTenenbaum/terp-operator
```

Older local folders may still be named `terp-agro` on some machines. Historical docs may still mention `terp-agro-operator-console`. Those names do not mean this is a different product. They point at the active TERP Operator codebase only when the git remote resolves to the URL above.

## Agent Entry Check

Run this before substantial work:

```bash
pnpm agent:doctor
```

The doctor must report the canonical GitHub repo. If it reports a problem, stop and fix it before proceeding.

Then run manual git freshness checks:

```bash
git fetch origin
git status --short --branch
git log --oneline -3 origin/main
```

Do not edit local `main`. Create a fresh worktree from `origin/main` for implementation:

```bash
git worktree add -b <branch-name> ../<worktree-name> origin/main
```

For the full GitHub-first workflow (fresh worktrees, read-only main, checkpoint discipline), see [`docs/agent-github-first-workflow.md`](docs/agent-github-first-workflow.md).

## Deprecated TERP-Family Repos

These repos are legacy/reference material unless Evan explicitly asks for work there:

- `EvanTenenbaum/TERP`
- `EvanTenenbaum/TERP-PM-Hub`
- `EvanTenenbaum/TERP-Slackbot`
- `EvanTenenbaum/terp-agro`
- `EvanTenenbaum/terp-commander`
- `EvanTenenbaum/terp-doc-system`
- `EvanTenenbaum/terp-erpnext`
- `EvanTenenbaum/terp-local-browser-mcp`
- `EvanTenenbaum/terp-numbers-command-system-roadmap`
- `EvanTenenbaum/terp-numbers-mockups`

If an old doc says `TERP Agro`, read it as historical context for TERP Operator unless the task is explicitly about archaeology, migration, or comparison with deprecated projects.

## Mandatory Patterns

### Command Registry (ADR 0002)

**All new backend commands MUST use `defineCommand()`.** Never add a `case` to the switch in `commandBus.ts`.
Pattern: `src/domains/<domain>/commandDefs/<name>.ts` — one file per command.
Fitness test: `src/tests/commandRegistry.fitness.test.ts` — CI-enforced catalog↔registry parity.
Full docs: `docs/decisions/0002-command-registry.md` and `AGENTS.md#mandatory-command-registry-—-no-new-switch-cases`.

## Three-System Task Model

TERP Operator uses three distinct systems for work tracking:

1. **Linear** — product execution source of truth.
   Workspace: `terpcorp`, Team: `Terpcorp` (key `TER`).
   Active project: **TERP Operator** — https://linear.app/terpcorp/project/terp-operator-cea015fac801
   Every issue is anchored to a registry ID (`CAP-001`..`CAP-029`) or command family ID (`CMD-INTAKE`, `CMD-PO`, `CMD-SALES`, `CMD-POSTING`, `CMD-PAYMENTS`, `CMD-VENDOR`, `CMD-FULFILLMENT`, `CMD-CONNECTOR`, `CMD-RECOVERY`, `CMD-CLOSEOUT`, `CMD-TAGS`, `CMD-MATCHMAKING`).
   Phase milestones map 1:1 to `docs/roadmap/phase-readiness/{phase}.md`.

2. **In-session TODOs** — ephemeral OpenCode session working memory only.
   Use to decompose a Linear issue into current-session steps. Never persist elsewhere; never treat as a product tracker.

3. **GitHub Issues** — repo-level bugs and problems only.
   Examples: CI breakage, flaky tests, dependency/security advisories, regressions, small known bugs that do not fit `CAP`/`CMD`.
   Features/capabilities go to Linear + registry/roadmap docs, not GitHub Issues.
   Product-shaped GitHub issues should be closed and reopened as Linear issues.

For details, see [`docs/github-issue-tracking.md`](github-issue-tracking.md) and [`docs/roadmap/README.md`](roadmap/README.md).

## Machine Layout Guidance

Preferred checkout directory name on every machine:

```text
terp-operator
```

Existing checkouts named `terp-agro` may remain temporarily if they point at the canonical remote. Agents should prefer the `terp-operator` alias/path when available and should not create new active work in old sibling folders.
