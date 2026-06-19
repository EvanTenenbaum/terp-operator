# TERP Operator — Architecture

## Overview

TERP Operator is an operator console for dense, spreadsheet-native wholesale brokerage workflows. It serves wholesale brokers managing purchase orders, sales orders, inventory, payments, and vendor relationships through a command-driven architecture with immutable audit trails.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM) |
| Language | TypeScript (strict) |
| Frontend | React 18 + AG Grid Enterprise |
| Backend API | tRPC (type-safe RPC) |
| Database | PostgreSQL 16 |
| ORM / Query Builder | Drizzle ORM + raw parameterized SQL |
| State Management | Zustand (useUiStore) + React Query (TanStack) |
| Styling | Tailwind CSS + semantic CSS classes |
| Testing | Vitest (unit) + Playwright (e2e) |
| Build | Vite |
| Package Manager | pnpm |

## Module Map

```
src/
├── client/              # React frontend
│   ├── api/             # tRPC client setup
│   ├── components/      # Shared UI components
│   ├── config/          # Entity schemas, column defs
│   ├── hooks/           # React hooks (useCommandRunner, useUiStore, etc.)
│   ├── store/           # Zustand stores
│   ├── utils/           # Formatters, helpers
│   └── views/           # Page-level views (tabs in the operator console)
├── server/              # Express + tRPC backend
│   ├── db.ts            # Database pool and Drizzle instance
│   ├── env.ts           # Environment config
│   ├── schema.ts        # Drizzle ORM schema (all tables)
│   ├── trpc.ts          # tRPC context and init
│   ├── rbac.ts          # Role-based access control
│   ├── routers/         # tRPC routers (API surface)
│   │   ├── index.ts     # AppRouter merge
│   │   ├── queries.ts   # Main query router (grids, reference data)
│   │   ├── commands.ts  # Command mutation router
│   │   ├── credit.ts    # Credit engine router
│   │   ├── purchase-orders.router.ts  # PO domain queries
│   │   ├── sales-orders.router.ts     # Sales domain queries
│   │   ├── payments.router.ts         # Payment domain queries
│   │   ├── inventory.router.ts        # Inventory domain queries
│   │   └── ...
│   ├── services/        # Business logic services
│   │   ├── commandBus.ts      # Command execution engine
│   │   ├── documentSnapshots.ts  # Receipt/print generation
│   │   ├── creditEngine/      # Credit assessment engine
│   │   └── ...
│   └── projections/     # SQL projection builders
├── shared/              # Shared types, schemas, status enums
│   ├── commandCatalog.ts  # Canonical command registry
│   ├── gridFilters.ts     # Grid filter types
│   ├── grid-types.ts      # View schema enum (extracted from queries.ts)
│   ├── schemas.ts         # Zod validation schemas
│   ├── statuses.ts        # All status enums
│   └── types.ts           # Shared TypeScript types
├── domains/             # Domain command handlers (extracted from commandBus)
│   ├── purchase-orders/
│   ├── sales-orders/
│   ├── payments/
│   ├── inventory/
│   ├── intake/
│   ├── credit/
│   ├── media/
│   ├── pick/
│   ├── vendor-management/
│   ├── matchmaking/
│   ├── contacts/
│   └── shared/
└── migrations/          # Drizzle SQL migrations
```

## Data Flow

```
Browser (AG Grid) → tRPC query → Pool.query() → PostgreSQL
                                    ↓
Browser (AG Grid) → tRPC mutation → commandBus.execute() → PostgreSQL
                                    ↓ (audit)
                              command_journal insert
                                    ↓ (notification)
                              Socket.io emit to browser
```

All data mutations go through commands (command pattern). Every command writes to `command_journal` for audit. Queries are direct parameterized SQL via `pool.query()`.

## Domain Architecture

Following the [domain module ADR](docs/decisions/0001-domain-module-architecture.md):

- **Commands** live in `src/domains/<domain>/commands.ts` — domain-separated mutation handlers
- **Queries** live in `src/server/routers/<domain>.router.ts` — domain-separated query endpoints
- **Shared** code lives in `src/domains/shared/` and `src/shared/`
- Grid infrastructure (grid SQL, filters, status counts) remains in the central `queries.ts` router

## Key Design Decisions

1. **Command pattern**: All mutations go through commands. Every command is journaled. Reversible commands support undo.
2. **Raw SQL for reads**: Grid queries use raw parameterized SQL (not Drizzle query builder) for performance and readability on complex joins.
3. **Drizzle for writes**: Schema definitions are in Drizzle ORM; mutations use Drizzle insert/update.
4. **Immutable audit trail**: `command_journal` stores before/after snapshots for every state-changing operation.
5. **Agent-first workflow**: Git worktrees, Linear issue tracking, command family IDs (CMD-PO, CMD-SALES, etc.), and registry IDs (CAP-001..CAP-029).
6. **View schema enum**: Centralized `viewSchema` in `src/shared/grid-types.ts` defines all grid-able entity types. Shared between grid SQL builders, CSV export, and filter logic.
7. **Entity schemas**: All grid column definitions originate in `src/client/config/entity-schemas.ts`. No per-view ColDef arrays.

## Testing Strategy

| Type | Tool | Location |
|------|------|----------|
| Unit tests | Vitest | `*.test.ts` co-located with source |
| Integration tests | Vitest | `src/domains/*/__tests__/` |
| E2E tests | Playwright | `tests/e2e/` |
| Persona QA | AI agent flows | `docs/qa/persona-flows/` |
