# TERP Agro Plan

## Milestones
1. Project skeleton, configs, long-horizon state docs.
2. Database schema, migration, seed data, Drizzle client.
3. Auth, RBAC, tRPC routers, command bus, JSONL journal, Socket.io.
4. React operator shell, grid component, hotkeys, command palette, journeys.
5. Playwright smoke tests, README, deployment artifacts, QA audit.

## Verification Plan
- `pnpm install`
- `docker compose up -d postgres`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:e2e`

## Current Status
- Implementation complete.
- Verification complete: install, migration, seed, typecheck, build, health, and Playwright smoke passed.
- Backend/frontend parity pass complete: all 56 user-surfaceable backend commands and 27 protected query endpoints now have frontend surfaces, enforced by `pnpm audit:parity`.
- Ease-of-use frontend pass complete: high-pressure starts and finder controls were measured, simplified, and reverified.
- Staging hardening in progress: DigitalOcean App Platform spec, GitHub deploy workflow, compiled production migration/seed scripts, Caddy Droplet fallback, and guarded demo reset command.
