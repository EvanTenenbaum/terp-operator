# Contributing to TERP Operator

## Setup

```bash
# Prerequisites: Node.js 20+, pnpm 9+, PostgreSQL 16+
git clone https://github.com/EvanTenenbaum/terp-operator.git
cd terp-operator
pnpm install
cp .env.example .env  # edit with your local DB credentials
pnpm db:migrate
pnpm db:seed:realistic
pnpm dev
```

## Development Workflow

### Git Worktrees

Always work in an isolated git worktree from `origin/main`:

```bash
git fetch origin
git worktree add -b <branch-name> ../<worktree-name> origin/main
```

Never edit local `main` directly. See `docs/agent-github-first-workflow.md` for details.

### Commands to Know

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start Vite dev server + tRPC backend |
| `pnpm typecheck` | Run `tsc --noEmit` |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run Vitest unit tests |
| `pnpm build` | Production build |
| `pnpm db:migrate` | Run pending DB migrations |
| `pnpm db:seed:realistic` | Seed realistic demo data |

### Before Committing

1. Run `pnpm typecheck` — must have zero errors
2. Run `pnpm lint` — must pass
3. Run `pnpm test` — must pass
4. Inspect `git diff --stat` — only intended files
5. Run `scripts/verify-dev-setup.sh` for full validation

## Conventions

### Commit Format

```
[FEAT] brief description of new feature
[FIX] brief description of bug fix
[REF] brief description of refactor
[TEST] brief description of test addition
[DOC] brief description of documentation
[CHORE] brief description of maintenance
```

Include the Linear issue ID when applicable:
```
[FIX] resolve grid scroll height flicker (TER-1786)
```

### Code Style

- TypeScript strict mode
- No `any` types — use `unknown` and type guards
- No `console.log` in production code — use the `logger` service
- Parameterized SQL only — never string-interpolate user input into queries
- Immutable state in React — use Zustand for shared state

### PR Process

1. Branch from `origin/main`
2. Implement with tests
3. Run full verification (`scripts/verify-dev-setup.sh`)
4. Open PR with Linear ID in title
5. Request review from AQA (adversarial QA) for T2+ changes
6. Merge only after review and CI pass

### Naming

- Files: kebab-case (`purchase-orders.router.ts`)
- Functions: camelCase (`buildGridV2Query`)
- Types/Interfaces: PascalCase (`GridFilters`)
- Constants: UPPER_SNAKE_CASE (`BASE_WHERE`)
- React components: PascalCase (`ReceiptPanel`)

### Imports

```typescript
// Server-side
import { pool } from '../db';
import { protectedProcedure, router } from '../trpc';

// Client-side
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/useUiStore';

// Shared
import { viewSchema } from '../../shared/grid-types';
import { PurchaseOrderStatus } from '../../shared/statuses';
```

### State Management

- **Server state**: React Query (TanStack) via tRPC hooks
- **Client state**: Zustand `useUiStore`
- **No new Zustand stores**: all UI state goes through `useUiStore`

### Styling

- Tailwind utility classes for layout and spacing
- Semantic CSS classes (`.context-drawer`, `.grid-container`) for component-level styles
- No inline styles except for dynamic values

### API Design

- Queries: `protectedProcedure.input(schema).query(...)`
- Mutations: `protectedProcedure.input(schema).mutation(...)` — routed through `useCommandRunner`
- All procedures require role assertion via `assertRole(ctx.user, 'operator')` or tighter
- JSON serialization via superjson

## Domain Module Pattern

When adding domain-specific endpoints, follow the extraction pattern:

1. Create `src/server/routers/<domain>.router.ts` with a named tRPC router
2. Register in `src/server/routers/index.ts`
3. Client calls via `trpc.<domain>.<procedure>.useQuery()`

See `docs/decisions/0001-domain-module-architecture.md` for rationale.
