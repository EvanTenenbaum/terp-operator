# Architecture

> What the system is made of, how data flows, and why each major piece was chosen. Read this once when you join the codebase; reference it when a change touches more than one layer.

## High-Level Stack

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (React 18 + Vite + Tailwind + AG Grid Enterprise)   │
│   ↕ tRPC (HTTP batch) + Socket.io (realtime invalidations) │
├─────────────────────────────────────────────────────────────┤
│ Express + tRPC v10 server                                   │
│   • tRPC routers (queries + commands.run)                   │
│   • Command handlers (typed, audited, idempotent)           │
│   • Session middleware (express-session + connect-pg-simple)│
│   • Socket.io (broadcasts post-command for realtime sync)   │
├─────────────────────────────────────────────────────────────┤
│ PostgreSQL 16 + Drizzle ORM                                 │
│   • Schema in `src/server/db/schema.ts`                     │
│   • SQL migrations in `src/server/migrations/`              │
│   • JSONL command journal (durable, see CLAUDE.md)          │
└─────────────────────────────────────────────────────────────┘
```

## Frontend

- **Build:** Vite (`vite.config.ts`). Dev server: `pnpm dev` runs server + Vite concurrently.
- **Language:** TypeScript strict. No `any` slipped in lightly — the audit issues call this out.
- **React 18** with hooks; no class components. No React Router — view switching is driven by `useUiStore.activeView`.
- **State** (covered in detail in `../design-system/state-patterns.md`):
  - Server state: tRPC (`src/client/api/trpc.ts`) wrapping TanStack Query v4.
  - UI state: a single Zustand store (`src/client/store/uiStore.ts`) with `persist` + `immer` middleware.
  - Local state: `useState` for form inputs and component-local toggles.
- **Mutations always go through `useCommandRunner`** (`src/client/components/useCommandRunner.ts`). It calls `trpc.commands.run.useMutation`, attaches an idempotency key, invalidates **all** TanStack queries on success, and pushes a toast.
- **Grids:** AG Grid Enterprise via `OperatorGrid` wrapper (`src/client/components/OperatorGrid.tsx`). Standard config: `ag-theme-quartz`, multi-row selection, range cell selection, undo/redo cell editing, side bar (columns + filters), CSV export.

## Backend

- **Express** with `helmet` security headers, `express-session` (httpOnly cookies) backed by `connect-pg-simple`.
- **tRPC v10** with two top-level routers:
  - `queries.*` — reads (e.g., `trpc.queries.grid.useQuery({ view })`, `trpc.queries.reference.useQuery()`).
  - `commands.run` — single mutation endpoint that dispatches to typed command handlers by `name`. See `src/shared/commandCatalog.ts` for the type.
  - `auth.*` — login/me/logout.
- **superjson** as the tRPC transformer (so `Date`, `Map`, `bigint`, etc. round-trip cleanly).
- **Socket.io** broadcasts events after command execution to trigger invalidations in other connected clients.

## Data Layer

- **PostgreSQL 16** in Docker locally (`docker compose up -d postgres`), DigitalOcean managed in production.
- **Drizzle ORM** for typed query building; schema in `src/server/db/schema.ts`.
- **SQL migrations** in `src/server/migrations/`, run via `pnpm db:migrate`.
- **`drizzle.config.ts`** at repo root controls schema introspection / migration generation.

## Command Model (the load-bearing pattern)

Every state change goes through a typed command:

```
Browser
  └─ useCommandRunner.runCommand(name, payload, reason)
       └─ trpc.commands.run.useMutation
            └─ tRPC dispatcher matches `name` → handler
                 ├─ RBAC + Zod payload validation
                 ├─ Idempotency-key check
                 ├─ DB transaction (with `SELECT FOR UPDATE` on money/inventory)
                 ├─ Append to JSONL command journal
                 ├─ Emit Socket.io event
                 └─ Return `{ ok, toast?, ... }`
       └─ on success: pushToast + queryClient.invalidateQueries()
```

**Why this matters for agents:**
- The command name is the unit of audit and reversal. A "reverse this transaction" UI calls `reverseCommandById` with the original command ID.
- Idempotency keys are stamped client-side (`${name}-${crypto.randomUUID()}` in `useCommandRunner`). Issue #23 flagged a related bug: the key doesn't bind to the payload yet — be aware if you change this hook.
- `useCommandRunner.onSuccess` calls `queryClient.invalidateQueries()` with **no arguments** — every cached query refetches. Wide blast radius, but ensures every connected view sees the result. Issue #13 (Socket.io is unauthenticated + invalidate-all storm) is the audit ticket for this.

## Realtime

- Socket.io is wired but currently **unauthenticated** (open audit issue #13). Don't add new privileged operations behind it without auth.
- Clients react to events by re-running queries; there's no client-side payload trust.

## Deployment

- **Same-origin** Express app — the Vite-built client is served by the same Express process in production. No separate frontend host.
- DigitalOcean droplet. `pnpm start:staging` runs migrate + realistic seed + audit + start.
- See `scripts/reset-staging-data.sh` for the staging reset flow.

## Why these choices

| Choice | Why |
|---|---|
| **PostgreSQL** | Money/inventory needs relational integrity, transactions, and `SELECT FOR UPDATE`. JSONB columns cover payload flexibility without giving up SQL. |
| **Drizzle (not Prisma)** | Smaller runtime, raw-SQL escape hatches, cleaner migration story. |
| **tRPC over REST** | Single typed surface between client + server; payloads + return types stay in lockstep without OpenAPI codegen. |
| **AG Grid Enterprise** | Operators come from Apple Numbers — they need range selection, fill-down, undo/redo, copy-paste, master-detail, side bar. No other React grid covers this. The Enterprise license is non-negotiable for this product. |
| **Zustand + `persist`/`immer`** | Single small store, immutable updates via Immer drafts, persist to localStorage for view/drawer state across reloads. |
| **Command journal** | Every mutation is auditable, idempotent, and reversible. The journal lives in DB + JSONL (issue #19: journal currently on `/tmp` is being moved to durable storage). |
| **Socket.io** | Wholesale ops are multi-operator. Need realtime invalidation so two operators don't fight over stale grids. |

## Directory Map (high level)

```
src/
├── client/                # React app
│   ├── components/        # Flat — 25 files. NO ui/grids/forms/layout subdirs.
│   ├── views/             # Page-level views (IntakeView, SalesView, ...)
│   ├── store/             # Zustand stores (just uiStore.ts today)
│   ├── hooks/             # React hooks (useFocusTrap.ts today)
│   ├── utils/             # Pure utilities (filterEvaluator.ts today)
│   ├── api/               # tRPC client setup
│   ├── App.tsx, main.tsx  # Mount points
│   ├── accessPolicy.ts    # RBAC predicates for UI gating
│   └── styles.css         # Hand-written semantic classes (primary-button, field-inline, ...)
│
├── server/                # Express + tRPC server
│   ├── routers/           # tRPC routers (queries.*, commands.*, auth.*)
│   ├── commands/          # Typed command handlers
│   ├── db/                # Drizzle schema + helpers
│   ├── migrations/        # SQL migrations
│   ├── middleware/        # Auth, validation
│   └── index.ts           # App entry
│
└── shared/                # Cross-cutting types + Zod schemas + commandCatalog
```

See `code-organization.md` for naming/import conventions and where each kind of file goes.

## Recent audit findings to know about

These are open audit issues that shape architectural decisions. Don't accidentally undo a fix.

- **#23 / DYN-C1:** Idempotency key has no payload binding (Critical). Touching `useCommandRunner` requires care.
- **#18:** Money/inventory integrity — `SELECT FOR UPDATE` partial; commit `db90fa4` adds locks. Don't bypass them.
- **#13:** Socket.io is unauthenticated + invalidate-all storm.
- **#19:** Command journal on `/tmp` (durability problem in production).
- **#31:** Numbers-native ≤8-column rule — fixed in commit `f5c33d8`. See `docs/GRID_COLUMN_AUDIT.md`.

Run `gh issue list --label tracking:known-issue` for the live tracker.
