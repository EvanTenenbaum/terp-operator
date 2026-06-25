# ADR 0002: `defineCommand` + Command Registry

**Date:** 2026-06-25
**Status:** Accepted (prototype proven on purchase-orders domain)
**Deciders:** Evan Tenenbaum, AI agent (Opus 4.8)
**Replaces:** Ad-hoc switch dispatch in `src/server/services/commandBus.ts`

## Context

ADR-0001 decomposed the monolith into domain modules, moving command *logic* to `src/domains/<domain>/commands.ts`. But the *wiring* stayed central: `commandBus.ts` grew a 143-case switch statement. Adding a command legally required lockstep edits across 6–7 files with no compile-time guard — miss one and the mismatch surfaces only at runtime.

## Decision

Commands self-register via `defineCommand()` at module import time. The command bus builds a `Map<name, CommandDefinition>` and dispatches by lookup. The switch is retained as a fallback for unmigrated domains and will be deleted case-by-case as each domain registers.

### The `defineCommand` contract

```ts
// src/server/services/commandRegistry.ts
defineCommand({
  name: 'approvePurchaseOrder',         // matches commandCatalog key
  input: approvePurchaseOrderPayloadSchema,  // the ONE Zod schema
  rbac: { minimumRole: 'manager' },     // co-located access control
  reversal: {                           // co-located reversal policy
    disposition: 'reversible',
    guidance: 'Returns the purchase order to finalized state...'
  },
  handler: (ctx, payload) => { ... },   // ONE signature
});
```

### The `ctx` shape

```ts
interface CommandContext {
  tx: Tx;               // Drizzle transaction
  user: SessionUser;     // authenticated session
  commandId: string;     // UUID for journaling
  reason?: string;       // audit reason from CommandInput
}
```

All previous signature variants (`(tx, payload, commandId)`, `(tx, payload, userId, commandId)`, `(tx, payload, commandId, reason?)`) are adapted via thin wrappers to this unified shape.

### Registry lifecycle

1. **Registration**: domain command definition files call `defineCommand()` at top level. Duplicate names throw at load time (fail fast).
2. **Population**: a side-effect import of the domain's commandDefs barrel triggers all `defineCommand()` calls.
3. **Dispatch**: `runCommand()` calls `getCommand(name)`. If found, validates via `command.input.parse(payload)` and calls `command.handler(ctx, parsedPayload)`. If not found, falls through to the switch.

### Fallback-removal criteria

A switch case can be deleted when:
- The domain's commandDefs barrel is imported in `commandBus.ts`
- The domain's existing test suite is green
- The fitness test confirms catalog↔registry parity for that domain

## Consequences

### Positive
- **One file per command**: add a feature = add a file; change one = open one file.
- **Compile-time safety**: duplicate names fail at load; missing registry entries fail the fitness test.
- **Central file stops growing**: `commandBus.ts` shrinks to the engine (transaction, journaling, socket emit, undo).
- **Schema validated at dispatch**: `command.input.parse()` runs before the handler, catching type mismatches early.

### Negative
- **Partial migration confusion**: during rollout some commands dispatch via registry, some via switch. The fallback is explicit and logged.
- **Startup registration order**: domain barrels must be imported before dispatch. The fitness test catches missing registrations.
- **Schema duplication during migration**: schemas exist in both commandBus.ts and domain schemas.ts temporarily. Cleanup follows per-domain deletion.

## Rollout order (recommended)

1. Purchase-orders (12 commands) — prototype, **done**
2. Inventory/batches
3. Sales-orders
4. Payments
5. Fulfillment
6. Vendors
7. Contacts
8. Credit engine
9. System/config
10. Connector
11. Matchmaking
12. Tags
13. Recovery/closeout

Order chosen by risk (lowest first) and domain test coverage.

## References

- ADR-0001: Domain module architecture
- `docs/engineering-plans/grid-rows-repair-split/04-backend-command-registry.md`
- `docs/architecture/backend-evolvability-assessment.md`
- `src/server/services/commandRegistry.ts`
- `src/tests/commandRegistry.fitness.test.ts`
