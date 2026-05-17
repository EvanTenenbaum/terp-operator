# TERP Agro

TERP Agro is a self-hosted cannabis wholesale ERP operator console. It moves the Apple Numbers workflow into a web app without losing the spreadsheet-native operating model: dense grids, inline edits, explicit statuses, keyboard shortcuts, audited commands, and reversible postings.

## Architecture Overview

- Frontend: React 18, Vite, TypeScript, AG Grid Enterprise, Zustand, TanStack Query, Tailwind.
- Backend: Express, tRPC, Socket.io, Zod validation.
- Data: PostgreSQL 16 with Drizzle ORM schema and SQL migrations.
- Auth: server-side sessions with httpOnly cookies stored in Postgres.
- Command model: 64 typed commands, idempotency keys, RBAC, database command journal, append-only JSONL journal, and realtime command events.
- Deployment: same-origin Express app serving the Vite build on a DigitalOcean droplet.

## File Tree

```text
terp-agro/
  src/client/              React operator console
  src/server/              Express, tRPC, Drizzle, commands
  src/shared/              Shared command/type/Zod contracts
  migrations/              SQL migrations
  tests/e2e/               Playwright smoke tests
  docs/workflow-gap-audit.md
  storage/journal/         Append-only JSONL command journal
  storage/archives/        Closeout artifacts
  docker-compose.yml       Local PostgreSQL 16
  docker-compose.prod.yml  DigitalOcean self-host profile
```

## Setup Commands

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:5173`.

Seeded login:

```text
owner@terpagro.local / terp-demo
```

## Environment Variables

```bash
NODE_ENV=development
APP_ORIGIN=http://localhost:5173
PORT=8787
DATABASE_URL=postgres://terp_agro:terp_agro@localhost:55432/terp_agro
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
SESSION_SECRET=replace-with-a-long-random-secret
JOURNAL_DIR=./storage/journal
ARCHIVE_DIR=./storage/archives
VITE_TRPC_URL=/trpc
VITE_SOCKET_URL=/
VITE_AG_GRID_LICENSE_KEY=
```

## Database Migration and Seed

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

The seed includes owner, manager, operator, and viewer accounts; inventory lots; customers; vendor payables; sales orders; invoices; payments; fulfillment; connector requests; and a backup snapshot for read-only restore preview.

For the DigitalOcean demo/review app, use the realistic 100-day scenario:

```bash
ALLOW_DEMO_SEED=true DEMO_SEED_SCENARIO=realistic_100d pnpm db:seed
pnpm audit:realistic-demo
```

The scenario is configurable with `DEMO_*` environment variables and is documented in `docs/product/realistic-demo-data.md`.
Staging startup also runs `pnpm audit:realistic-demo` after seeding so partial or drifted demo data fails closed. To use the tiny smoke fixture instead, set `DEMO_SEED_SCENARIO=baseline` before running `pnpm db:seed`.

## Development

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm test:e2e
```

Core hotkeys:

- `⌘1` Dashboard, `⌘2` Intake, `⌘3` Sales, `⌘4` Payments, `⌘5` Inventory, `⌘6` Client Ledger
- `⌘K` command palette
- `⌘D` duplicate selected intake rows
- `⌘⌥⇧R` mark selected intake rows Ready
- `⌘⌥I` process intake
- `⌘↩` confirm/post/allocate in the active grid

## QA Infrastructure

Comprehensive QA resources for manual and automated testing:

```bash
# Create test data
pnpm exec tsx scripts/create-test-processor.ts

# Run unit tests
pnpm test processorCommands

# Run E2E tests
pnpm test:e2e
```

**QA Documentation:**
- **Hub:** `docs/qa/README.md` - QA workflow and infrastructure guide
- **Runbooks:** `docs/qa/payment-processor-qa-runbook.md` - Test scenarios with expected results
- **Navigation:** `docs/qa/navigation-guide.md` - Critical guide for state-based routing
- **Results:** `QA_RESULTS.md` - Latest QA run results

**For Agents:** Before testing features, read the relevant QA runbook. Navigation uses state-based routing (sidebar clicks), NOT URL routing.

**Recent Features:**
- Payment processors with variable fees and splits ([#38](https://github.com/EvanTenenbaum/terp-agro-operator-console/issues/38))

## DigitalOcean Deployment

1. Create a DigitalOcean droplet with Docker and Docker Compose.
2. Copy the repo to the droplet.
3. Create `.env` with production values:

```bash
NODE_ENV=production
APP_ORIGIN=https://your-domain.example
PORT=8787
DATABASE_URL=postgres://terp_agro:strong-password@postgres:5432/terp_agro
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
SESSION_SECRET=use-a-long-random-secret
JOURNAL_DIR=/app/storage/journal
ARCHIVE_DIR=/app/storage/archives
POSTGRES_USER=terp_agro
POSTGRES_PASSWORD=strong-password
POSTGRES_DB=terp_agro
```

4. Run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app pnpm db:migrate
docker compose -f docker-compose.prod.yml exec app pnpm db:seed
```

5. For staging review, prefer DigitalOcean App Platform using `.do/terp-agro-staging.yaml`; it builds the Dockerfile, uses a Postgres 16 app database, runs compiled migrations, and reloads the realistic 100-day demo data on deploy by default.
6. For Droplet staging, put Caddy in front of port `8080` with `deploy/staging/docker-compose.caddy.yml`. Keep tRPC, Socket.io, and cookies on the same origin.

Staging reset/reseed:

```bash
ALLOW_DEMO_SEED=true pnpm staging:reset
```

The reset command truncates operational tables, reloads realistic demo data unless `DEMO_SEED_SCENARIO` is overridden, and audits the seeded ratios plus active work queues. Use it only against staging/demo databases.

## Production Notes

- No operational data is sent to third-party SaaS.
- CSV import has a validate-only pass before writes.
- CSV export is available from every grid toolbar.
- Posted sales, intake, payments, vendor payouts, and fulfillment actions have reversal paths through `reverseCommandById`.
- Restore from backup is intentionally implemented as a read-only preview command inside the app. A destructive full restore should happen during an offline maintenance window.

## QA Checklist

- App runs with seeded demo data.
- Missing imports and TypeScript errors are caught by `pnpm typecheck`.
- Broken routes are covered by Vite app load and Playwright navigation.
- Command writes require idempotency keys and roles.
- Session auth uses httpOnly cookies, not localStorage.
- Database schema and seed are in the same repo and migrated with `pnpm db:migrate`.
- JSONL command journal is written under `storage/journal`.
- Closeout archives produce CSV, JSONL, and PDF artifacts under `storage/archives`.
- Workflow bible comparison and closure notes live in `docs/workflow-gap-audit.md`.
