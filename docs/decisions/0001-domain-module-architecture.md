# ADR 0001: Domain Module Architecture

**Status**: Accepted  
**Date**: 2026-06-19  
**Deciders**: Evan Tenenbaum, build agent  

## Context

The TERP Operator codebase originally had all query procedures in a single file (`src/server/routers/queries.ts`, 3,943 lines) and all command handlers in a single service (`src/server/services/commandBus.ts`). As the product grew, these files became unwieldy:

- Cross-cutting dependencies (circular imports between `queries.ts` and `gridWhere.ts`)
- Poor discoverability — finding a purchase order query required scanning thousands of lines
- Tight coupling — tests imported the monolithic router even when testing a single domain

## Decision

We decompose into domain modules following a two-tier structure:

1. **Command handlers** → `src/domains/<domain>/commands.ts`
   - Each domain exports its command handlers
   - Shared journal and socket utilities live in `src/domains/shared/`
   
2. **Query routers** → `src/server/routers/<domain>.router.ts`
   - Each domain exports a named tRPC router with its query procedures
   - Cross-cutting infrastructure (grid SQL, reference data, status counts) stays in the central `queries.ts`

3. **Shared types** → `src/shared/`
   - Types used by multiple routers (e.g., `viewSchema`) are extracted to shared files to break circular dependencies

### Router Naming Convention

| Domain | Router File | tRPC Path |
|--------|------------|-----------|
| Purchase Orders | `purchase-orders.router.ts` | `trpc.purchaseOrders.*` |
| Sales Orders | `sales-orders.router.ts` | `trpc.salesOrders.*` |
| Payments | `payments.router.ts` | `trpc.payments.*` |
| Inventory | `inventory.router.ts` | `trpc.inventory.*` |
| Intake | `intake.router.ts` | `trpc.intake.*` |

### What Stays in queries.ts

- Grid infrastructure (`grid`, `gridV2`, `gridSummary`, `statusCounts`)
- Reference data caching (`reference`, `comboboxOptions`)
- Dashboard and health probes (`dashboard`, `health`)
- Contact directory queries (`contactDirectory`, `contactProfile`)
- Entity tab queries (via `queries.entityTabs.ts`)
- Detail queries (via `queries.detail.ts`)
- Cross-domain utilities (`relatedCommands`, `reversalPreview`, `closeoutPreview`)

### What Moves to Domain Routers

- Entity-specific receipt queries (e.g., `purchaseOrderExternalReceipt`)
- Entity-specific print/signal text generation
- Entity-specific preview queries (e.g., `receiptPreview`)

## Alternatives Considered

1. **Keep monolith** — rejected due to file size, circular deps, and poor discoverability
2. **Full domain separation** (move grid infrastructure per-domain) — rejected as premature; the shared grid infrastructure serves all domains efficiently
3. **Microservice extraction** — rejected as overkill for the current team size and deployment model

## Consequences

### Positive
- Clear domain boundaries for query endpoints
- Broken circular dependency between `queries.ts` and `gridWhere.ts`
- Smaller, focused test files
- Easier contributor onboarding (find domain queries by filename)

### Negative
- Client code references change from `trpc.queries.purchaseOrderX` to `trpc.purchaseOrders.purchaseOrderX`
- Migration required updating ~20 call sites in client components and tests
- Two-tier structure (domains + routers) requires contributors to understand both paths

## Migration Status

- [x] Extract `viewSchema` to `src/shared/grid-types.ts`
- [x] Create purchase-orders.router.ts
- [x] Create sales-orders.router.ts
- [x] Create payments.router.ts
- [x] Create inventory.router.ts
- [x] Create intake.router.ts
- [x] Update client components (ReceiptPanel, ReceiptPreviewOverlay, ReceiptPreviewDrawer)
- [x] Update test files (queries.receipts.test.ts, queries.moneyReceipts.test.ts, queries.salesReceipts.test.ts)
- [x] Verify `pnpm typecheck` passes with zero errors
