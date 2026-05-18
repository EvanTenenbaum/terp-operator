# TERP Operator Agent Instructions

Follow `/Users/evan/AGENTS.md` first, then this file. If a deeper `AGENTS.md` is added later, the deeper file wins for its subtree.

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

## GitHub Tracking Source Of Truth

Use GitHub Issues as the source of truth for backlog, to-do, and known-issue tracking. Do not create a separate durable tracker in docs, chat, or local files unless the user explicitly asks for an export or handoff artifact.

Use these issue forms:

- `Backlog item`: product, UX, architecture, or workflow work that should be planned before implementation.
- `To-do`: small concrete follow-up work with a clear owner/action.
- `Known issue`: confirmed or strongly suspected bugs, runtime failures, confusing UX, data drift, or test gaps.

Before creating a new issue:

1. Search existing open issues with `gh issue list --state open --search "<keywords>"`.
2. Reuse or update an existing issue when it is the same work.
3. Create a new issue only when the finding is distinct enough to track independently.

When creating or updating issues:

- Use labels from `.github/labels.yml` when possible.
- Include exact route, command, file path, screenshot/log path, browser URL, or test output when available.
- Keep runtime bugs separate from annotation-driven product/UX work.
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
gh issue create --template backlog_item.yml --title "Backlog: <operator outcome>"
gh issue create --template todo.yml --title "To-do: <specific task>"
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
