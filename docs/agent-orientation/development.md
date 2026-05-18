# Development Workflow

> How to set up, run, verify, and ship from a clean checkout. All commands assume your working directory is the repo root.

## First-Time Setup

```bash
git clone https://github.com/EvanTenenbaum/terp-operator.git
cd terp-operator
pnpm install                   # requires pnpm 10.25.0 (see package.json packageManager)

cp .env.example .env           # then fill in DATABASE_URL etc.

docker compose up -d postgres  # local Postgres 16
pnpm db:migrate                # apply SQL migrations
pnpm db:seed                   # baseline seed (or pnpm db:seed:realistic for 100-day data)

pnpm agent:doctor              # verify you're in the canonical repo + env is OK
pnpm dev                       # opens http://localhost:5173
```

**Seeded credentials** live in `src/server/seed.ts` — read it directly rather than copying default strings here, since they change.

## Daily Loop

```bash
pnpm dev          # server (tsx watch) + client (vite) concurrently
pnpm typecheck    # strict TS check; should always pass
pnpm test         # vitest unit tests
pnpm test:e2e     # Playwright (requires app running on 5173 unless you pass PLAYWRIGHT_SKIP_WEB_SERVER=1)
```

The dev server is `concurrently -k -n server,client "tsx watch src/server/index.ts" "vite --host 0.0.0.0"`. `-k` means killing one kills the other, so Ctrl+C is enough.

## Verification Before Claiming "Done"

These mirror what CI / the gates expect. Run the ones that apply to your change.

```bash
# Always
pnpm typecheck

# When you changed audit-sensitive code (commands, schema, queries)
pnpm audit:parity              # backend ↔ frontend parity check
pnpm audit:product-roadmap     # roadmap-vs-code alignment
pnpm audit:realistic-demo      # validates demo data assumptions

# The big one: mirrors local CI
pnpm audit:self                # typecheck + parity + product-roadmap + build

# Smoke E2E for operator console
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
  pnpm exec playwright test \
  tests/e2e/operator-console.spec.ts \
  --project=chromium --workers=1
```

For UI changes that touch operator workflows, open the live app at `http://127.0.0.1:5173` and try the keyboard path (Cmd+K for the palette, the grid you touched, the action you added). Type-checking proves the code compiles; it does not prove the feature works.

## Database Lifecycle

```bash
pnpm db:migrate           # apply pending migrations
pnpm db:seed              # baseline seed
pnpm db:seed:realistic    # DEMO_SEED_SCENARIO=realistic_100d — bigger fixture set

# Reset staging fully (destroys data on remote staging)
bash scripts/reset-staging-data.sh

# Production-build variants (used by start:staging)
pnpm db:migrate:prod
pnpm db:seed:prod
```

Migrations live in `src/server/migrations/`. The migration runner is `src/server/migrate.ts`. Don't edit applied migrations — add new ones.

## Build & Start (Production-Shape)

```bash
pnpm build       # tsc --noEmit + vite build + tsup server bundle → dist/
pnpm start       # NODE_ENV=production node dist/server/index.js
pnpm start:staging  # migrate prod + seed realistic + audit + start (see package.json)
```

## Common Issues

**Port 5173 already in use**
```bash
lsof -ti:5173 | xargs kill -9
```

**Type errors after pulling**
```bash
rm -rf node_modules .pnpm-store
pnpm install
```

**`pnpm agent:doctor` says "not in canonical repo"**
You're in a wrong worktree (e.g., `TERP/` or `terp-agro-operator-console/`). `cd` into the `terp-operator` checkout. The doctor script reads `git remote -v` and the directory path; trust it.

**`docker compose up -d postgres` fails or Postgres rejects connections**
```bash
docker compose down -v   # drop volume — destroys local DB
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

**tRPC errors with `superjson` parse failures**
Usually a server/client tRPC version drift or the server isn't restarted. Restart `pnpm dev`. The transformer is set in `src/client/api/trpc.ts`.

**Playwright tests time out waiting for the server**
Pass `PLAYWRIGHT_SKIP_WEB_SERVER=1` and start the app yourself in another terminal. Playwright config lives in `playwright.config.ts`.

## Where Verification Standards Are Defined

- `AGENTS.md` (repo root) — GitHub-tracking rules and verification expectations.
- `CLAUDE.md` (repo root + `.claude/`) — QA gate policy, evidence requirements, cross-model review rules.
- `.coverage-thresholds.json` — coverage source of truth (if present). Don't ship below threshold.

When in doubt, run more verification, not less. The codebase has 22+ open audit issues — adding to that backlog is easy and silent.
