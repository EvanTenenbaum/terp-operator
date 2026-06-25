# Backend Evolvability Assessment

**Status**: Draft / discussion
**Date**: 2026-06-25
**Author**: build agent (Claude)
**Question**: How do we keep building and changing backend features without the
system turning into a Frankenstein of bolted-on pieces?

---

## TL;DR

The codebase is **not** a Frankenstein today — it has good bones (command
pattern, immutable journal, domain modules, ADR-0001). The risk to manage is a
specific kind of erosion: **shotgun surgery**, where adding one feature forces
lockstep edits across 6–7 files. The cure is to **finish the extraction ADR-0001
started**: move the *wiring* out of the central files the same way the *logic*
was already moved, then add a guardrail test so it stays finished.

The single highest-leverage change is a **command registry + `defineCommand`**
that collapses the per-command sources of truth into one module and replaces the
143-case dispatch switch in `commandBus.ts` with lookup-based discovery.

---

## What is already right

- **Command pattern + immutable journal** — every mutation flows through
  `commandBus.execute` and writes `command_journal` (before/after snapshots,
  reversible commands support undo). This is the most important property for
  changeability, and it exists.
- **Domain modules** — `src/domains/<domain>/commands.ts` with a curated barrel
  `index.ts`, documented in `docs/decisions/0001-domain-module-architecture.md`.
  The hard decision (decompose by domain, not microservices) is made and written
  down.
- **Shared layer discipline** — `src/shared/` is largely types / Zod schemas /
  pure functions, which keeps cross-cutting code from becoming a second dumping
  ground.

## The actual failure mode

Not file size — **shotgun surgery**. Adding one command today touches:

1. `src/shared/commandCatalog.ts` — register name + reversal policy (763 lines, hand-maintained)
2. `src/shared/schemas.ts` — the Zod payload schema
3. `src/domains/<domain>/commands.ts` — the handler
4. `src/domains/<domain>/index.ts` — re-export from the barrel
5. `src/server/services/commandBus.ts` — **add a `case` to a 143-case switch in a 3,663-line file**
6. `src/server/rbac.ts` — `assertCommandAccess`
7. (sometimes) a query router for the read side

Miss one and you get a runtime mismatch, not a compile error. That lockstep is
what *feels* bolted-on, and it's why `commandBus.ts` (~3,663 lines) and
`queries.ts` (~3,792 lines) keep growing: **every feature is legally required to
edit the central file.** ADR-0001 moved the logic to domains but left the wiring
(the switch) central — that's the half-finished seam.

Secondary smell: handler signatures in the switch are inconsistent —
`(tx, payload, commandId)` vs `(tx, payload, user.id, commandId)` vs
`(tx, payload, commandId, reason)` — plus payload-rewriting aliases
(`setBatchPrice` → `updateBatch`). Each is a special case the central file must
remember.

## The rule that prevents Frankenstein

**A feature should be one vertical slice, registered once, and *discovered* —
never *wired*.** Three moves:

### 1. Collapse N sources of truth into one command module

```ts
// src/domains/purchase-orders/commands/approvePurchaseOrder.ts
export const approvePurchaseOrder = defineCommand({
  name: 'approvePurchaseOrder',
  input: approvePurchaseOrderSchema,    // the ONE schema
  rbac: { capability: 'po:approve' },   // access lives with the command
  reversal: reversalPolicies.approve,   // reversal policy lives with the command
  handler: (ctx, payload) => { ... },   // ONE signature: ctx = { tx, user, commandId, reason }
});
```

One file, one export, everything about that command in it. Add a feature = add a
file. Change one = open exactly one file.

### 2. Replace the switch with a registry

The bus stops knowing command names. Domain barrels export their `defineCommand`
objects; the bus builds a `Map<name, command>` at startup and dispatches by
lookup:

```ts
const command = registry.get(name);       // discovered, not wired
assertAccess(user, command.rbac);
const payload = command.input.parse(raw);  // validation co-located & automatic
return command.handler(ctx, payload);
```

`commandBus.ts` shrinks to the *engine* (transaction, journaling, socket emit,
undo) and stops growing when features are added. New commands never touch it.

### 3. Normalize the handler contract

One `ctx` object (`{ tx, user, commandId, reason }`) instead of four positional
shapes. Removes per-command special-casing; every handler looks the same.

The query side (`queries.ts`) has the same disease and the same cure — it is
already half-split into `*.router.ts` files; finish moving grid/reference
infrastructure behind a stable interface so domain routers compose rather than
everyone editing the central file.

## Boundary rules that keep slices from leaking

- **Domains talk through commands and typed query functions, never by importing
  each other's internals.** `sales-orders` needing inventory calls an inventory
  command, not `inventory/commands.ts` directly.
- **`src/shared` stays types/schemas/pure functions only** — no DB, no side
  effects.
- **The journal is the integration bus.** Cross-domain reactions (sales post →
  credit recompute) key off journaled commands/events, not direct calls between
  domains. The existing `enqueueCustomerRecompute` is the model — make it the
  default pattern.

## Make regression impossible (the part people skip)

Conventions rot unless enforced mechanically. Add a **fitness-function test**
(same spirit as the existing `audit:parity` / `audit:product-roadmap` checks,
pointed at architecture) that fails CI when:

- `commandBus.ts` exceeds N lines, or contains a `switch (name)` (forces registry use)
- a command name in the catalog has no registered handler, or vice versa (kills lockstep drift)
- anything in `src/domains/a` imports from `src/domains/b/` (enforces boundaries)

A 30-line test outlasts a 3-page convention doc nobody reads.

## What this is NOT

- Not a rewrite.
- Not microservices (ADR-0001 correctly rejected this for current team/deploy size).
- Not "move grid infrastructure per-domain" (ADR-0001 rejected as premature).

It is *finishing the extraction already started* + one guardrail.

## Proposed next step

Prototype `defineCommand` + registry on the **purchase-orders** domain (12
commands) end-to-end, keeping the existing switch as a fallback during migration,
and verify zero behavior change against existing tests. This makes the payoff
concrete and is fully reversible. Then write the migration ADR from the proven
pattern rather than from theory.

Route through `/start-task` gates (design review → plan review → execution-method
choice) per CLAUDE.md before implementation.
