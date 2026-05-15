# TERP Agro Agent Instructions

Follow `/Users/evan/AGENTS.md` first, then this file. If a deeper `AGENTS.md` is added later, the deeper file wins for its subtree.

## Project Posture

TERP Agro is an operator console for dense, spreadsheet-native wholesale workflows. Prefer working product changes, runtime proof, and issue writeback over broad narration. Preserve existing worktree changes unless Evan explicitly asks you to revert them.

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
