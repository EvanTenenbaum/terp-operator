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

The doctor must report the canonical GitHub repo. If it reports a different origin, stop and redirect to the TERP Operator checkout.

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

## Machine Layout Guidance

Preferred checkout directory name on every machine:

```text
terp-operator
```

Existing checkouts named `terp-agro` may remain temporarily if they point at the canonical remote. Agents should prefer the `terp-operator` alias/path when available and should not create new active work in old sibling folders.
