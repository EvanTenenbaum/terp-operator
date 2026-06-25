# Plan 4 — Backend Evolvability: `defineCommand` + Command Registry

**Type:** Architecture refactor (anti-Frankenstein)
**State:** 📄 Assessment only — no code
**Source doc:** `docs/architecture/backend-evolvability-assessment.md` (on `codex/grid-rows-repair-20260624`) — carry to `main` with the prototype PR.
**Registry anchor:** architecture; write a migration ADR (`docs/decisions/000x-*`) once the pattern is proven.

---

## 1. The problem (precisely)

The codebase is **not** a Frankenstein — it has good bones (command pattern, immutable
journal, domain modules, ADR-0001). The risk is one specific erosion: **shotgun
surgery**. Adding one command today legally requires lockstep edits across 6–7 files:

1. `src/shared/commandCatalog.ts` — name + reversal policy (763 lines, hand-maintained)
2. `src/shared/schemas.ts` — the Zod payload schema
3. `src/domains/<domain>/commands.ts` — the handler
4. `src/domains/<domain>/index.ts` — barrel re-export
5. `src/server/services/commandBus.ts` — **a `case` in a 143-case switch in a 3,663-line file**
6. `src/server/rbac.ts` — `assertCommandAccess`
7. sometimes a query router for the read side

Miss one → **runtime mismatch, not a compile error.** That lockstep is what *feels*
bolted-on, and it's why `commandBus.ts` (~3,663 lines) and `queries.ts` (~3,792 lines)
keep growing: every feature is *required* to edit the central file. ADR-0001 moved the
*logic* to domains but left the *wiring* (the switch) central — the half-finished seam.

Secondary smell: inconsistent handler signatures in the switch
(`(tx, payload, commandId)` vs `(tx, payload, user.id, commandId)` vs
`(tx, payload, commandId, reason)`) plus payload-rewriting aliases
(`setBatchPrice`→`updateBatch`) — each a special case the central file must remember.

## 2. The rule that prevents Frankenstein

**A feature should be one vertical slice, registered once, and *discovered* — never
*wired*.** Three moves:

### Move 1 — collapse N sources of truth into one command module
```ts
// src/domains/purchase-orders/commands/approvePurchaseOrder.ts
export const approvePurchaseOrder = defineCommand({
  name: 'approvePurchaseOrder',
  input: approvePurchaseOrderSchema,   // the ONE schema
  rbac: { capability: 'po:approve' },  // access co-located
  reversal: reversalPolicies.approve,  // reversal policy co-located
  handler: (ctx, payload) => { ... },  // ONE signature: ctx = { tx, user, commandId, reason }
});
```
Add a feature = add a file. Change one = open exactly one file.

### Move 2 — replace the switch with a registry
Domain barrels export their `defineCommand` objects; the bus builds a
`Map<name, command>` at startup and dispatches by lookup:
```ts
const command = registry.get(name);        // discovered, not wired
assertAccess(user, command.rbac);
const payload = command.input.parse(raw);   // validation co-located & automatic
return command.handler(ctx, payload);
```
`commandBus.ts` shrinks to the **engine** (transaction, journaling, socket emit, undo)
and stops growing when features are added.

### Move 3 — normalize the handler contract
One `ctx` object (`{ tx, user, commandId, reason }`) instead of four positional shapes.
Removes per-command special-casing.

The query side (`queries.ts`) has the same disease and cure — it's already half-split
into `*.router.ts` files; finish moving grid/reference infrastructure behind a stable
interface so domain routers compose rather than everyone editing the central file. *(Out
of scope for the prototype; sequence after the command side is proven.)*

## 3. Boundary rules that keep slices from leaking

- Domains talk through **commands and typed query functions**, never by importing each
  other's internals (`sales-orders` needing inventory calls an inventory *command*).
- `src/shared` stays **types/schemas/pure functions only** — no DB, no side effects.
- **The journal is the integration bus.** Cross-domain reactions (sales post → credit
  recompute) key off journaled commands/events, not direct calls. `enqueueCustomerRecompute`
  is the model — make it the default pattern.

## 4. Make regression impossible — the fitness-function test

A convention rots unless enforced mechanically. Add an architecture fitness test (same
spirit as existing `audit:parity` / `audit:product-roadmap` checks) that **fails CI** when:

- `commandBus.ts` exceeds N lines, or contains a `switch (name)` (forces registry use);
- a catalog command name has no registered handler, or vice versa (kills lockstep drift);
- anything in `src/domains/a` imports from `src/domains/b/` (enforces boundaries).

A 30-line test outlasts a 3-page convention doc nobody reads.

## 5. Scope guard — what this is NOT

Not a rewrite · not microservices (ADR-0001 correctly rejected for current team/deploy
size) · not "move grid infrastructure per-domain" (ADR-0001 rejected as premature). It is
**finishing the extraction ADR-0001 started + one guardrail.**

## 6. Execution plan (prototype-first, fully reversible)

- **Step 1 — Prototype on the purchase-orders domain (12 commands), end-to-end.**
  Introduce `defineCommand` + a registry; migrate the 12 PO commands to register
  themselves; have the bus dispatch PO commands via registry lookup **while keeping the
  existing 143-case switch as a fallback** for everything not yet migrated. Verify **zero
  behavior change** against the existing PO test suite. This makes the payoff concrete and
  is reversible.
- **Step 2 — Add the fitness-function test** (§4), initially asserting only the migrated
  surface (e.g. catalog↔registry name parity for registered commands) so it can land green
  and tighten as migration proceeds.
- **Step 3 — Write the migration ADR** from the proven pattern (not from theory): the
  `defineCommand` contract, the `ctx` shape, the registry lifecycle, the fallback-removal
  criteria, the domain-by-domain order.
- **Step 4 — Roll out domain by domain**, deleting switch cases as each domain registers,
  until the switch is empty and the fitness test can forbid `switch (name)` outright.
- **Step 5 (separate, later) — apply the same registry/interface treatment to `queries.ts`.**

## 7. Sequencing note vs. Plan 3 (barter)

If feasible, **prototype this (at least Step 1) before barter Phase 1.** Barter adds two
new commands the old way (catalog + schemas + domain + barrel + switch + rbac). If
`defineCommand` exists first, barter can be authored as the *first feature built the new
way* — a real second validation of the pattern — instead of more lockstep added to the
switch that this plan then has to migrate. Not a hard dependency; a sequencing win.

## 8. Risks

- **Hidden switch behavior:** the existing switch carries signature variants and
  payload-rewriting aliases (`setBatchPrice`→`updateBatch`). Inventory every special case
  before migrating a domain; the `ctx` normalization and an alias map in the registry must
  preserve them exactly. The "zero behavior change vs existing tests" gate is the guard.
- **Startup registration order:** the registry builds from domain barrels at startup;
  ensure no circular import or missing-registration silently drops a command (the
  catalog↔registry parity fitness test catches this).
- **Partial-migration confusion:** during rollout some commands dispatch via registry,
  some via switch — keep the fallback explicit and logged so it's obvious which path a
  command took.

## 9. Definition of done (prototype milestone)

- [ ] `defineCommand` + registry implemented; all 12 PO commands migrated and dispatched via lookup.
- [ ] Existing PO test suite green with **zero behavior change**; coverage meets `.coverage-thresholds.json`.
- [ ] Fitness-function test landed and green (catalog↔registry parity for migrated commands).
- [ ] Migration ADR written from the proven pattern, routed through CLAUDE.md design-review gate.
- [ ] Switch retained as fallback for unmigrated domains; rollout order documented.
