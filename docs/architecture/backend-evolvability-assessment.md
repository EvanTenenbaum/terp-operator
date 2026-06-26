# Backend Evolvability Assessment

**Date:** 2026-06-25
**Branch:** feat/defineCommand-registry-step1
**Status:** Assessment + prototype implementation

## Source of assessment

This assessment originated from the grid-rows-repair work (branch `codex/grid-rows-repair-20260624`) and was formalized in `docs/engineering-plans/grid-rows-repair-split/04-backend-command-registry.md`. It is carried to `main` as part of the command-registry prototype PR.

## The problem

The command bus (`src/server/services/commandBus.ts`, ~3,663 lines) contains a 143-case switch statement. Adding a new command requires lockstep edits across 6–7 files:

1. `src/shared/commandCatalog.ts` — name + reversal policy
2. `src/shared/schemas.ts` — Zod payload schema
3. `src/domains/<domain>/commands.ts` — the handler
4. `src/domains/<domain>/index.ts` — barrel re-export
5. `src/server/services/commandBus.ts` — a `case` in the switch
6. `src/server/rbac.ts` — `assertCommandAccess`
7. sometimes a query router for the read side

Miss one = runtime mismatch, not a compile error. ADR-0001 moved the *logic* to domains but left the *wiring* central.

### Secondary smells

- **Inconsistent handler signatures** in the switch: `(tx, payload, commandId)` vs `(tx, payload, user.id, commandId)` vs `(tx, payload, commandId, reason)`.
- **Payload-rewriting aliases**: `setBatchPrice` rewrites its payload and calls `updateBatch`.
- **Shotgun surgery**: every feature must edit the central file, regardless of domain.

## The rule

> A feature should be one vertical slice, registered once, and *discovered* — never *wired*.

Three moves:

1. **Collapse N sources of truth into one command module** — `defineCommand({ name, input, rbac, reversal, handler })` co-locates everything in one file.
2. **Replace the switch with a registry** — the bus builds `Map<name, command>` at startup and dispatches by lookup.
3. **Normalize the handler contract** — one `ctx` object `{ tx, user, commandId, reason }` instead of four positional shapes.

## Boundary rules

- Domains talk through **commands and typed query functions**, never by importing each other's internals.
- `src/shared` stays **types/schemas/pure functions only** — no DB, no side effects.
- **The journal is the integration bus.** Cross-domain reactions key off journaled commands, not direct calls.

## Prototype results (2026-06-25)

The purchase-orders domain (12 commands) was migrated as a prototype:

- `src/server/services/commandRegistry.ts` — `defineCommand()` + registry `Map`
- `src/domains/purchase-orders/schemas.ts` — all 12 PO payload schemas (pure Zod, no commandBus dep)
- `src/domains/purchase-orders/commandDefs/` — 12 self-registering command definition files + barrel
- `commandBus.ts` — registry lookup with switch fallback

**Verification:**
- Typecheck: passes clean
- PO integration tests: 18/18 passed, zero behavior change
- Full commandBus test suite: zero new failures (7 pre-existing failures identical on main)
- Fitness test: catalog↔registry parity enforced

## Rollout plan

1. **Step 1 (done):** PO domain prototype — prove the pattern.
2. **Step 2 (done):** Fitness-function test — CI-enforced catalog↔registry parity.
3. **Step 3 (pending):** Migration ADR — document the proven contract.
4. **Step 4 (pending):** Domain-by-domain rollout — delete switch cases as domains register.
5. **Step 5 (later):** Apply same treatment to `queries.ts`.
