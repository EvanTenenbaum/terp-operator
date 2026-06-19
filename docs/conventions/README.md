# Conventions

One-page reference for all TERP Operator coding conventions.

## Commit Format

```
[TAG] brief description

Where TAG is one of:
  [FEAT]  — new feature or capability
  [FIX]   — bug fix
  [REF]   — refactor (no behavioral change)
  [TEST]  — test addition or improvement
  [DOC]   — documentation only
  [CHORE] — dependency updates, build config, etc.

Include Linear ID when applicable:
  [FIX] resolve grid scroll height flicker (TER-1786)
```

## Naming

| Category | Convention | Example |
|----------|-----------|---------|
| Files | kebab-case | `purchase-orders.router.ts` |
| Functions | camelCase | `buildGridV2Query` |
| Types/Interfaces | PascalCase | `GridFilters` |
| Constants | UPPER_SNAKE_CASE | `BASE_WHERE` |
| React components | PascalCase | `ReceiptPanel` |
| React hooks | `use` prefix | `useCommandRunner` |
| tRPC procedures | camelCase | `purchaseOrderExternalReceipt` |

## Imports

```typescript
// Server-side
import { pool } from '../db';
import { protectedProcedure, router } from '../trpc';

// Client-side
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/useUiStore';

// Shared (NEVER import from client/ into server/ or vice versa)
import { viewSchema } from '../../shared/grid-types';
```

Import order: Node builtins → external packages → shared → server/client → local

## State Management

- **Server state**: React Query (TanStack) via `trpc.<router>.<procedure>.useQuery()`
- **Client UI state**: `useUiStore` (Zustand)
- **No new stores**: all UI state belongs in `useUiStore`
- **No prop drilling**: use React Query cache or `useUiStore`

## Styling

- **Layout/spacing**: Tailwind utility classes
- **Component identity**: Semantic CSS classes (`.context-drawer`, `.grid-container`)
- **No inline styles** except for dynamic values (e.g., width from user pref)
- **No CSS-in-JS**

## API Calls

- All server communication through tRPC (no raw fetch/axios)
- Queries: `trpc.<router>.<procedure>.useQuery(input, options)`
- Mutations: `useCommandRunner().execute(commandName, payload)`
- Never call tRPC mutations directly — always through `useCommandRunner`

## Error Handling

- Server: throw `TRPCError` with specific codes (`NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`)
- Client: use React Query error state (`query.error`)
- No silent catches — always log or surface errors
- No `console.log` in production code — use the `logger` service

## SQL

- Parameterized queries only (`pool.query(sql, params)`)
- Never string-interpolate user input into queries
- Column lists must be explicit (no `SELECT *`)
- Use `SELECT ... FOR UPDATE` for read-then-write operations

## File Organization

```
src/
├── client/           # One folder per concern
│   ├── components/   # Shared UI components
│   ├── views/        # Page-level views
│   ├── hooks/        # Custom React hooks
│   ├── store/        # Zustand stores
│   └── config/       # Entity schemas, constants
├── server/
│   ├── routers/      # tRPC routers (one per domain)
│   ├── services/     # Business logic
│   └── projections/  # SQL projections
├── shared/           # Types, schemas, enums (imported by both)
└── domains/          # Domain command handlers
```
