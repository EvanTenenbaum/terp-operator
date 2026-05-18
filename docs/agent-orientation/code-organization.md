# Code Organization

> Where things live, how files are named, what imports look like. Use this as the canonical map; if architecture.md and this file disagree, **this file wins for layout details**.

## Top-Level Layout

```
terp-operator/
├── src/
│   ├── client/                     # React app (Vite dev server)
│   ├── server/                     # Express + tRPC + Socket.io
│   └── shared/                     # Cross-cutting types, schemas, command catalog
│
├── tests/
│   └── e2e/                        # Playwright specs
│
├── scripts/
│   └── *.sh / *.mjs                # Build/audit/migration helper scripts
│
├── docs/
│   ├── agent-orientation/          # You are here
│   ├── design-system/              # Frontend patterns
│   ├── patterns/                   # Pattern-extraction artifacts
│   └── (various AUDIT / PHASE summaries at top level)
│
├── .husky/                         # Git hooks (pre-commit)
├── package.json                    # pnpm 10.25.0
├── tsconfig.json                   # No `paths` aliases — relative imports only
├── vite.config.ts
├── tailwind.config.ts              # Custom colors: ink, panel, field, line, accent, amber, danger
├── postcss.config.js
├── drizzle.config.ts
└── playwright.config.ts
```

There is **no `@/` path alias.** All imports inside `src/` are relative (`../api/trpc`, `../store/uiStore`, etc.). Don't introduce aliases without a separate decision in `decisions-log.md`.

## `src/client/` — React App

```
client/
├── components/          # 25 .tsx files, flat — no ui/forms/grids/layout subdirs
├── views/               # Page-level views, one per top-level operator screen
├── store/               # Zustand stores (uiStore.ts today)
├── hooks/               # React hooks (useFocusTrap.ts today)
├── utils/               # Pure utilities (filterEvaluator.ts today)
├── api/                 # tRPC client (trpc.ts)
├── App.tsx              # Mount + provider tree
├── main.tsx             # Vite entry
├── accessPolicy.ts      # RBAC predicates for UI gating
└── styles.css           # Hand-written semantic CSS classes (primary-button, field-inline, ...)
```

### Components (`src/client/components/`)
Flat directory. Every `.tsx` is one component (plus colocated helpers). No category subfolders. The current 25 files are inventoried at `docs/design-system/components/_inventory.json` once Task 18's script lands.

Categorization (see `docs/design-system/INDEX.md` for the categorized list):
- **Grid / data display:** `OperatorGrid`, `QuickLedgerGrid`, `StatusPill`, `ExpansionChevronColumn`, `ExpansionPanel`.
- **Drawers / side panels:** `ContextDrawer`, `VendorContextDrawer`, `RelationshipDrawer`, `WorkspacePanel`, `InventoryFinderPanel`, `PhotographyQueuePanel`, `RowCommandHistoryDrawer`, `IssueSidecar`.
- **Command / navigation:** `CommandPalette`, `Hotkeys`, `Shell`, `IdentityRibbon`.
- **Filters / forms:** `AdvancedFilterBuilder`, `SavedFiltersDropdown`, `RefereeRelationshipDialog`, `EmptyState`.
- **Hooks living among components:** `useCommandRunner.ts` (yes, it's in `components/` — see "Known oddities" below).

### Views (`src/client/views/`)
One file per top-level operator screen:
- `DashboardView.tsx`
- `IntakeView.tsx`
- `LoginView.tsx`
- `MatchmakingView.tsx`
- `OperationsViews.tsx` — bundles multiple secondary operator screens
- `ProcessorsView.tsx`
- `RefereesView.tsx`
- `SalesView.tsx`

The full `ViewKey` union (`'dashboard' | 'sales' | ... | 'settings'`, 18 values) lives in `src/shared/types.ts`.

### Store (`src/client/store/`)
Single Zustand store: `uiStore.ts`. Uses `persist` + `immer` middleware. Persists `activeView`, `sideNavCollapsed`, `collapsedPanels`, `activeQuickLaunch`, `activeSettingsTab`, `drawerByView`, `activeDrawerEntityByView`, `gridFilters` to localStorage under the key `terp-agro-ui`. See `docs/design-system/state-patterns.md` for the access pattern.

### Hooks (`src/client/hooks/`)
Currently only `useFocusTrap.ts` (added with commit `b786f21` for the Command Palette focus trap, audit issue #30). New hooks go here unless they're a mutation wrapper (which lives in `components/` per current convention — see oddities below).

### Utils (`src/client/utils/`)
Pure functions, no React. Currently `filterEvaluator.ts`.

### API (`src/client/api/`)
`trpc.ts` only — `createTRPCReact<AppRouter>()` plus the `httpBatchLink` setup with `superjson` transformer. Import via relative path: `import { trpc } from '../api/trpc';`.

### Styles (`src/client/styles.css`)
A single global stylesheet where the custom semantic classes (`primary-button`, `secondary-button`, `compact-action`, `icon-button`, `field-inline`, `control-band`, `subtle-band`, `view-stack`, `inline-panel`, `selection-pill`, `finder-table`, `context-drawer-card`, `expansion-section`, etc.) are defined. Tailwind utility classes are also available everywhere (Tailwind v3, content globs `./index.html` + `./src/**/*.{ts,tsx}`).

See `docs/design-system/styling-guide.md` for which to use when.

## `src/server/` — Backend

```
server/
├── app.ts              # Express app factory (middleware, routes, tRPC handler)
├── index.ts            # Entry point (listens, wires Socket.io)
├── trpc.ts             # tRPC server setup (createTRPCRouter, procedures)
├── auth.ts             # Session/auth helpers
├── db.ts               # Drizzle client + connection
├── schema.ts           # Drizzle schema (tables, relations)
├── env.ts              # Environment variable parsing/validation
├── rbac.ts             # Role-based access predicates
├── rateLimiter.ts      # Rate-limiting middleware
├── sockets.ts          # Socket.io server setup
├── migrate.ts          # Migration runner entry
├── seed.ts             # Baseline seed
├── realisticSeed.ts    # 100-day realistic seed
├── routers/            # tRPC routers
│   ├── index.ts            # appRouter aggregating routers below
│   ├── auth.ts             # auth.login, auth.me, auth.logout
│   ├── queries.ts          # queries.grid, queries.reference, queries.* reads
│   ├── commands.ts         # commands.run — single command dispatcher
│   ├── filters.ts          # filters.getFacets, saved filters
│   └── subscriptions.ts    # Socket.io subscription/event types
├── services/           # Domain services + command handlers
│   ├── commandBus.ts       # Command dispatcher (name → handler)
│   ├── journal.ts          # JSONL + DB command journal
│   ├── processorCommands.ts
│   ├── refereeCommands.ts
│   ├── pricing.ts
│   ├── csv.ts
│   ├── metrics.ts
│   └── closeout.ts
└── utils/              # Server utilities
    ├── errorHandler.ts
    ├── filterSqlBuilder.ts
    └── ratelimit.ts
```

**Migrations:** generated by Drizzle Kit per `drizzle.config.ts`. Apply via `pnpm db:migrate`. They are not in a fixed `migrations/` folder inside `src/server/` — Drizzle's config controls the path. Check `drizzle.config.ts` for the current location.

**Command handlers** are not in a single `commands/` directory. They're split by domain in `services/` (e.g., `processorCommands.ts`, `refereeCommands.ts`) and dispatched through `services/commandBus.ts`. The catalog of valid names lives in `src/shared/commandCatalog.ts`.

## `src/shared/` — Cross-Cutting

```
shared/
├── types.ts            # ViewKey, GridRow, DrawerEntityRef, Role, SessionUser, etc.
├── commandCatalog.ts   # The `commandNames` const array + CommandName type union (83 commands)
├── schemas.ts          # Zod schemas reused on client + server
├── filterConfig.ts     # Filter facet definitions
├── filterSchemas.ts    # Zod schemas for filter payloads
├── paymentTerms.ts     # Payment term helpers
├── priceRange.ts       # Price range helpers
└── tags.ts             # Tag helpers
```

When you need a type or a schema shared between client and server, put it here.

## Naming Conventions

- **Components:** PascalCase, one component per file. `OperatorGrid.tsx`, `RefereeRelationshipDialog.tsx`.
- **Hooks:** `useXxx.ts`. Lives in `client/hooks/` unless it's a thin tRPC mutation wrapper that conceptually belongs with a component (current oddity: `useCommandRunner` is in `client/components/`).
- **Stores:** `<name>Store.ts` in `client/store/`. Only `uiStore.ts` today.
- **Views:** `<Name>View.tsx` in `client/views/`. `OperationsViews.tsx` (plural) bundles several secondary views.
- **Routers:** server `routers/<name>.ts`. Each exports a tRPC router; `routers/index.ts` aggregates.
- **Commands (server):** domain-grouped files in `services/*Commands.ts`. Each registers its handlers with the command bus.
- **Shared types:** types in `shared/types.ts`. Zod schemas in `shared/schemas.ts` (or `shared/filterSchemas.ts` for filter-specific).

## Import Patterns

All imports inside `src/` are **relative**. There's no `@/` alias because `tsconfig.json` has no `paths` entry. Examples:

```ts
// In src/client/components/OperatorGrid.tsx
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { GridRow, ViewKey } from '../../shared/types';
import { EmptyState } from './EmptyState';
```

External packages use bare specifiers (`react`, `zustand`, `clsx`, `lucide-react`, `ag-grid-react`, etc.).

## Code Patterns

### Component pattern (real)
```tsx
// src/client/components/StatusPill.tsx
interface StatusPillProps {
  status?: string;
}
export function StatusPill({ status }: StatusPillProps) {
  // ... className computed from status, returns a <span>
}
```

No default exports. No `cn()` helper — use `clsx` (it's in `dependencies`) when conditional classes are needed.

### Store-access pattern
```tsx
const activeView = useUiStore((state) => state.activeView);
const setActiveView = useUiStore((state) => state.setActiveView);
```

Selector functions (one field each) to keep re-renders tight. See `docs/design-system/state-patterns.md`.

### Query pattern (tRPC, not raw TanStack)
```tsx
const me = trpc.auth.me.useQuery();
const grid = trpc.queries.grid.useQuery({ view: 'sales' });
const facets = trpc.filters.getFacets.useQuery();
```

### Mutation pattern (always useCommandRunner)
```tsx
const { runCommand, isRunning } = useCommandRunner();
await runCommand('flagBatch', { batchId, reason }, 'Flag intake lot from grid');
```

Do not call `trpc.<router>.<endpoint>.useMutation` directly for state changes unless you've checked there's no command for it. Auth (`trpc.auth.login.useMutation` in `LoginView.tsx`) is one of the few exceptions.

## Known oddities (work with them, don't "fix" silently)

- **`useCommandRunner.ts` is in `components/`, not `hooks/`.** Likely historical. Don't move it without coordinating — many files import from `./useCommandRunner` relative.
- **`OperationsViews.tsx` (plural)** bundles multiple secondary views into one file. If you're splitting them out, plan that as its own change.
- **`react-router-dom` is imported in `App.tsx`** but URL routing isn't actually wired — view switching is `useUiStore.activeView`-driven. Open audit issue #29 covers this gap. Don't assume `useLocation()`/`useParams()` work the way they would in a typical Router app.
- **Drizzle migration path** is controlled by `drizzle.config.ts`, not a fixed directory. Don't assume `src/server/migrations/`.
- **Server `schema.ts` is flat** at `src/server/schema.ts`, not `src/server/db/schema.ts`. (An earlier version of `architecture.md` said otherwise — that's wrong; this file is correct.)
