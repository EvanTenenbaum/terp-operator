# Design System Decision Log

> **Append-only.** Add new entries at the **top**. Don't delete history.

## Format

```markdown
## YYYY-MM-DD: [Short Title]
**Decision:** What was decided
**Rationale:** Why (problem solved, tradeoff accepted)
**Example:** File path showing implementation (or "N/A" for meta-decisions)
**Author:** Agent name via Evan
**Related:** Optional — links to issues, prior decisions, audits
```

---

## 2026-05-18: Documentation grounded in actual codebase, not aspirational spec
**Decision:** When the original 2026-05-18 spec for the agent-orientation/design-system docs referenced files and structures that didn't exist (a `Button` component, `ui/`/`grids/`/`forms/`/`layout/` subfolders, `@/` path aliases, `cn()` helper, `IntakeToolbar` / `StatusCellRenderer` / `CurrencyCellRenderer` components, raw TanStack mutation patterns), the docs were rewritten from the actual codebase rather than transcribed from the spec.
**Rationale:** Documentation that misrepresents the codebase is worse than no documentation — it teaches agents to write code that doesn't compile (`@/lib/utils`) or that bypasses the audit/journal contract (raw `useMutation` instead of `useCommandRunner`). The spec's value was its structural outline (which docs to write, what topics each should cover). The code is the source of truth for content.
**Example:** `docs/agent-orientation/*.md`, `docs/design-system/*.md` (all rewritten from `src/client/`, `src/server/`, `src/shared/`, `package.json`, `tailwind.config.ts`, `tsconfig.json` reads).
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/patterns/extracted-2026-05-18.md` (pattern extraction report that surfaced the spec/reality gap).

---

## 2026-05-18: Hybrid styling — Tailwind utilities + semantic classes via @apply
**Decision:** Continue the existing pattern: Tailwind v3 utility layer with custom theme tokens (`ink`, `panel`, `field`, `line`, `accent`, `amber`, `danger`) underneath ~209 semantic CSS classes in `src/client/styles.css` composed with `@apply`. Components reach for semantic classes (`primary-button`, `field-inline`, `control-band`, `view-stack`) for vocabulary nouns, and Tailwind utilities for one-off layout glue.
**Rationale:** Pure Tailwind would mean re-writing the same 5+ utility chain across the codebase for common shapes (buttons, toolbars, view stacks). Pure semantic CSS would mean rebuilding the utility flexibility Tailwind already provides. The hybrid lets vocabulary stay short and consistent, while leaving Tailwind utilities for the long tail.
**Example:** `src/client/styles.css` (`.primary-button`, `.field-inline`, `.control-band`, etc.); `tailwind.config.ts` for the token palette.
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/design-system/styling-guide.md`.

---

## 2026-05-18: useCommandRunner is the only mutation contract for business state
**Decision:** All state-changing operations on business data (intake, orders, payments, batches, vendors, fulfillment, etc.) must route through `useCommandRunner.runCommand(name, payload, reason)`. Direct `trpc.<router>.<endpoint>.useMutation` is reserved for auth (`trpc.auth.login.useMutation` in `LoginView.tsx`) and a tiny set of bookkeeping operations.
**Rationale:** `useCommandRunner` stamps the idempotency key, invokes `trpc.commands.run` which dispatches to the server-side command handler, writes the DB + JSONL command journal, broadcasts a Socket.io event, pushes the success/error toast, and invalidates all cached queries. Bypassing this hook bypasses the audit + reversibility contract that the entire product is built on.
**Example:** `src/client/components/useCommandRunner.ts` (27 lines, the contract); `RefereeRelationshipDialog.tsx`, `IntakeView.tsx`, `OperatorGrid.tsx`'s `onCellCommit` consumer pattern.
**Author:** Claude Opus 4.7 via Evan
**Related:** Audit #23 (idempotency-key payload binding gap), audit #13 (Socket.io auth gap), `docs/design-system/state-patterns.md`.

---

## 2026-05-18: One Zustand store (useUiStore), not many
**Decision:** All UI state shared across components lives in a single `useUiStore` at `src/client/store/uiStore.ts`. Do not create additional Zustand stores.
**Rationale:** A single store keeps the UI state surface auditable and lets the `persist` middleware partialize a single shape. Multiple stores would fragment the persisted state and obscure where to look for cross-cutting state (drawer state, palette state, route history, toasts).
**Example:** `src/client/store/uiStore.ts` (~350 lines, ~30 state fields + actions, `persist` + `immer`).
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/design-system/state-patterns.md`.

---

## 2026-05-18: Initial design system documentation created
**Decision:** Establish a living documentation system under `docs/agent-orientation/` and `docs/design-system/` to reduce Evan's per-prompt context overhead and prevent frontend drift.
**Rationale:** Repeating architectural patterns, component locations, styling conventions, and state-management approaches in every agent prompt wastes Evan's time and produces inconsistent results. Living docs that agents read at session start solve this without ongoing manual effort.
**Example:** `docs/agent-orientation/START_HERE.md`, `docs/design-system/INDEX.md`.
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/superpowers/specs/2026-05-18-agent-orientation-design-system-design.md` (original spec), `docs/superpowers/plans/2026-05-18-agent-orientation-design-system.md` (implementation plan).

---

[Future decisions append above this line, in reverse chronological order.]
