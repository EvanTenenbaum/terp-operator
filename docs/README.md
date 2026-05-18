# TERP Operator Documentation

## For Agents: Start Here

**New to this codebase?** Read **[agent-orientation/START_HERE.md](agent-orientation/START_HERE.md)** first (~5 minutes).

Then jump to the topic that matches your task — the doc you need will reference the source files and other docs you should pull in.

## Map

### `agent-orientation/`
Onboarding for any agent or human touching the codebase.

- **[START_HERE.md](agent-orientation/START_HERE.md)** — entry point, key principles, navigation hub.
- **[architecture.md](agent-orientation/architecture.md)** — stack, data flow, command model, why-this-stack rationale.
- **[development.md](agent-orientation/development.md)** — setup, daily commands, verification commands, common issues.
- **[domain-concepts.md](agent-orientation/domain-concepts.md)** — operator mental model, entities, 83 named commands, RBAC, glossary.
- **[code-organization.md](agent-orientation/code-organization.md)** — authoritative map of `src/`, naming, imports, known oddities.

### `design-system/`
Frontend patterns and conventions.

- **[INDEX.md](design-system/INDEX.md)** — quick-reference, component categories, color palette, semantic class vocabulary.
- **[styling-guide.md](design-system/styling-guide.md)** — Tailwind + semantic-class hybrid, tokens, typography, spacing, layout idioms.
- **[state-patterns.md](design-system/state-patterns.md)** — tRPC reads, `useCommandRunner` writes, `useUiStore` for UI state, RBAC gating.
- **[decisions-log.md](design-system/decisions-log.md)** — append-only history of design decisions. Add new entries at the top.
- **components/**
  - **[buttons.md](design-system/components/buttons.md)** — semantic button classes (no `Button` component).
  - **[grids.md](design-system/components/grids.md)** — `OperatorGrid` patterns, cell renderers, ≤8-column audit rule.
  - **[forms.md](design-system/components/forms.md)** — `field-inline` and dialog-form patterns.
  - **[modals.md](design-system/components/modals.md)** — dialog shape, focus trap, Command Palette.
  - **[layouts.md](design-system/components/layouts.md)** — `view-stack`, `WorkspacePanel`, `control-band`, drawer state machine.
  - **_inventory.json** — auto-generated component inventory (run `pnpm docs:inventory` to refresh).

### `patterns/`
Pattern-extraction artifacts from the codebase.

- **[extracted-2026-05-18.md](patterns/extracted-2026-05-18.md)** — initial extraction analyzing 108 commits, 25 components, 38 issues, 3 PRs over May 13–18, 2026.

### Other docs in `docs/`
Historic and current operational docs that are **not** part of the agent-orientation / design-system set: audit reports (`AUDIT_REPORT.md`, `DYNAMIC_AUDIT_*.md`), phase summaries, deployment guides, etc. Read those if a ticket cites them; don't skim them blindly.

## Agent Workflow

1. **At session start (READ):** Open `agent-orientation/START_HERE.md`, then the design-system doc(s) that match your task. 2–3 minutes.
2. **During work (FOLLOW):** Reference the relevant guide. Check `design-system/components/_inventory.json` before creating a new component. Use existing semantic classes before composing utilities.
3. **Before committing (UPDATE):**
   - New component / pattern / decision → append to `design-system/decisions-log.md`.
   - Added/removed components → `pnpm docs:inventory`.
   - Established a convention others should follow → update the matching guide.

## Automation

- **`pnpm docs:inventory`** — regenerates `design-system/components/_inventory.json` from `src/client/components/`. Categorizes by name + content heuristics. Source: `scripts/extract-component-inventory.ts`.

There is no git pre-commit hook enforcing the workflow above — the machine's global `core.hooksPath` is reserved for agent-core hooks. The reminder lives in `AGENTS.md` instead.

## Maintenance

- **Decisions log** is append-only. Add at the top, keep history.
- **Component inventory** auto-regenerates. Don't hand-edit `_inventory.json`.
- **Guides** are living documents — update when reality diverges from the doc.
- **If a guide is wrong, the code wins.** Fix the doc in the same PR as the divergence.

## Bootstrap Story

These docs were created on 2026-05-18 from a spec + plan in `../docs/superpowers/`. The spec described an aspirational architecture (`Button` component, `ui/grids/forms/layout` subfolders, `@/` path aliases, raw TanStack mutations) that doesn't match the actual codebase. The first entry in `design-system/decisions-log.md` records the decision to ground the docs in actual code rather than transcribe the spec.

If you find a similar drift in the future, prefer rewriting from reality over transcribing the spec.
