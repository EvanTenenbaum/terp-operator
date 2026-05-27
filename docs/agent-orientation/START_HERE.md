# TERP Operator: Agent Quick Start

> If you're reading this for the first time, spend 5 minutes here, then jump to the doc that matches your task. The goal of this directory is to make you self-sufficient on architecture, conventions, and patterns so you don't have to ping Evan for them.

## What is TERP Operator?

A self-hosted wholesale cannabis ERP operator console. The mental model is **a web app that preserves the Apple Numbers operating model** — dense grids, inline edits, keyboard shortcuts, explicit statuses, audited commands, reversible postings.

**Canonical repo:** `https://github.com/EvanTenenbaum/terp-operator`. Older paths/strings may say `terp-agro` or `terp-agro-operator-console`; those are legacy aliases. Confirm with `git remote -v` before substantial work.

## Quick Navigation

| Your task | Read |
|---|---|
| First time in the repo | This file, then `architecture.md` |
| Adding/changing a screen | `code-organization.md` + `../design-system/INDEX.md` |
| Writing a new mutation | `../design-system/state-patterns.md` (use `useCommandRunner`) |
| Touching a grid | `../design-system/components/grids.md` |
| Styling a UI element | `../design-system/styling-guide.md` |
| Domain question ("what's a referee?") | `domain-concepts.md` |
| Local setup / how to test | `development.md` |
| Feedback widget / Crikket capture | `feedback-capture.md` |

## Key Principles (don't violate without justification)

1. **Spreadsheet-native** — dense AG Grid views, ≤8 columns per grid, keyboard-first, explicit statuses (no implicit state).
2. **Command-driven** — all mutations route through `useCommandRunner` → `trpc.commands.run` → server command handler → DB journal → toast. Idempotency keys are stamped automatically. **Never call `trpc.<router>.<endpoint>.useMutation` directly for state-changing operations** unless you've checked there's no command for it.
3. **Reversible** — posted actions have a reversal path. Look for `reverseCommandById` and the `RowCommandHistoryDrawer` pattern.
4. **Audited** — every command writes to the DB journal + JSONL + Socket.io stream. Toasts surface user-visible results.
5. **Server state is server state** — don't mirror tRPC query data into Zustand or local React state. Reads are `trpc.queries.X.useQuery`. UI state (selections, drawers, palette) is `useUiStore`. Truly local form state is `useState`.

## Common Commands

```bash
# Dev (server + Vite concurrently)
pnpm dev                      # localhost:5173

# Doctor (verify you're in the canonical repo)
pnpm agent:doctor

# Type + tests
pnpm typecheck
pnpm test                     # vitest unit
pnpm test:e2e                 # playwright

# Database
pnpm db:migrate
pnpm db:seed
pnpm db:seed:realistic        # 100-day realistic seed scenario

# Audits (used in CI / gates)
pnpm audit:parity
pnpm audit:product-roadmap
pnpm audit:self               # full local CI mirror

# Docs (once Task 18-19 land in this PR series)
pnpm docs:inventory           # regenerate components/_inventory.json
```

## Stack Cheat-Sheet

- **Frontend:** React 18 + Vite + TypeScript (strict) + Zustand (`persist` + `immer`) + tRPC v10 + TanStack Query v4 + AG Grid Enterprise v32 + Tailwind v3 (+ hand-written semantic classes in `src/client/styles.css`).
- **Backend:** Express + tRPC + Drizzle ORM + PostgreSQL 16 + Socket.io + `express-session` + `connect-pg-simple` + `helmet`.
- **Shared:** Zod schemas + command catalog + grid row types live in `src/shared/`.

## Before You Start

1. Read `AGENTS.md` at repo root (GitHub-tracking rules, verification expectations).
2. Read this file.
3. Skim the design-system doc(s) that match your task.
4. Glance at `../design-system/decisions-log.md` for recent decisions that might affect your work.

## After You Finish (UPDATE step)

- **Made a non-obvious decision?** Append to `../design-system/decisions-log.md` (template at top of that file).
- **Added/removed components?** Run `pnpm docs:inventory`.
- **Established a new pattern others should follow?** Update the relevant `../design-system/...md` file.
- **The pre-commit hook reminds you of all of the above.**

## Where the spec/reality might still drift

These docs were rewritten from the actual codebase on 2026-05-18 because an earlier spec referenced files and structures that didn't exist. If you find something in these docs that doesn't match the code:
1. The code is the source of truth.
2. Update the doc to match (in the same PR).
3. If the divergence is intentional (e.g., a refactor in progress), note it in `decisions-log.md`.

---

**Pick your next doc above and keep moving.**
