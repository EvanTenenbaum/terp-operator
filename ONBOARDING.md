# TERP Operator — Onboarding Guide

## What Is TERP Operator?

TERP Operator is an operator console for wholesale brokerage operations. It provides spreadsheet-native workflows for managing purchase orders, sales orders, inventory, payments, and vendor relationships. All data mutations go through a command-driven architecture with immutable audit trails.

**Target users**: Wholesale brokers, inventory managers, and accounting staff at produce/commodity brokerage firms.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + AG Grid Enterprise |
| Backend | Express + tRPC (type-safe RPC) |
| Database | PostgreSQL 16 |
| ORM | Drizzle ORM + raw SQL |
| State | Zustand + React Query |

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+, PostgreSQL 16+
git clone https://github.com/EvanTenenbaum/terp-operator.git
cd terp-operator
pnpm install
cp .env.example .env
# Edit .env with your local database URL
pnpm db:migrate
pnpm db:seed:realistic
pnpm dev
# Open http://localhost:5173
# Login: owner@terpagro.local / terp-demo
```

## Architecture Overview

```
Browser (AG Grid)
      ↓ tRPC queries/mutations
Express Server
      ↓ pool.query() / Drizzle inserts
PostgreSQL
      ↓ (audit)
command_journal (immutable)
      ↓ (real-time)
Socket.io → Browser
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full module map and data flow diagrams.

## Domain Map

| Domain | What It Does | Key Files |
|--------|-------------|-----------|
| Purchase Orders | PO creation, receiving, receipts | `domains/purchase-orders/` |
| Sales Orders | SO creation, confirmation, posting | `domains/sales-orders/` |
| Payments | Payment logging, allocation, refunds | `domains/payments/` |
| Inventory | Batch adjustment, transfers | `domains/inventory/` |
| Intake | Batch intake, posting | `domains/intake/` |
| Credit | Credit assessment, limit management | `domains/credit/` |
| Pick | Warehouse pick lists | `domains/pick/` |
| Media | Photography upload, management | `domains/media/` |
| Vendor Mgmt | Vendor bills, payments | `domains/vendor-management/` |
| Matchmaking | Customer needs ↔ vendor supply | `domains/matchmaking/` |
| Contacts | Unified contact directory | `domains/contacts/` |

Each domain has:
- `commands.ts` — mutation handlers (command pattern)
- `__tests__/integration.test.ts` — characterization tests
- Server-side query endpoints in `src/server/routers/<domain>.router.ts`

## Key Conventions

See [`docs/conventions/README.md`](./docs/conventions/README.md) for the full conventions reference. Key points:

- **Commit format**: `[FEAT]`, `[FIX]`, `[REF]`, `[TEST]`, `[DOC]`, `[CHORE]`
- **Files**: kebab-case (`purchase-orders.router.ts`)
- **Imports**: no cross-importing between `client/` and `server/`; use `shared/`
- **SQL**: always parameterized — never string-interpolate user input
- **State**: React Query for server state, `useUiStore` for UI state
- **No `any`**: use `unknown` with type guards

## Testing

| Command | What It Does |
|---------|-------------|
| `pnpm typecheck` | TypeScript compilation check |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit/integration tests |
| `pnpm exec playwright test` | E2E browser tests |
| `bash scripts/verify-dev-setup.sh` | All of the above + build |

## Important Files to Read

1. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — full module map and data flow
2. [`CONTRIBUTING.md`](./CONTRIBUTING.md) — setup, conventions, PR process
3. [`docs/conventions/README.md`](./docs/conventions/README.md) — coding conventions
4. [`docs/conventions/anti-patterns.md`](./docs/conventions/anti-patterns.md) — what to avoid
5. [`docs/decisions/0001-domain-module-architecture.md`](./docs/decisions/0001-domain-module-architecture.md) — why we structured domains this way
6. [`docs/reference/environment-variables.md`](./docs/reference/environment-variables.md) — all environment variables
7. `src/shared/statuses.ts` — all status enums
8. `src/shared/commandCatalog.ts` — all registered commands
9. `src/client/config/entity-schemas.ts` — all grid column definitions

## Workflow

1. Find or create a Linear issue under the TERP Operator project
2. Create a git worktree from `origin/main`: `git worktree add -b fix/ter-XXXX ../worktree-name origin/main`
3. Implement with tests
4. Run `bash scripts/verify-dev-setup.sh`
5. Open PR with Linear ID in title
6. Request review (AQA for T2+ changes)
7. Merge after CI pass and review approval
