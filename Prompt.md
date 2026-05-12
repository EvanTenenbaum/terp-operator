# TERP Agro Prompt

## Objective
Build a working, self-hosted TERP Agro operator console that preserves the spreadsheet-native TERP Numbers workflow while moving operational data into a web app with audited, idempotent commands.

## Scope
- React 18, Vite, TypeScript frontend.
- Express, tRPC, Socket.io backend.
- PostgreSQL 16 with Drizzle schema, migration, and seed data.
- Session auth with httpOnly cookies and role-based access.
- Grid-first journeys for dashboard, intake, sales, orders, payments, inventory, client ledger, vendor payouts, fulfillment, connectors, recovery, and closeout.
- Command journal table plus append-only JSONL journal.
- Playwright smoke coverage and deployment docs.

## Assumptions
- This is a new app under `terp-agro/`; existing nearby repos are not modified.
- AG Grid Enterprise is wired through `VITE_AG_GRID_LICENSE_KEY`, with graceful local demo behavior if the env var is empty.
- Local development uses Docker Compose Postgres; production is same-origin Express serving the built Vite client on DigitalOcean.

## Success Checks
- Dependencies install.
- Database migrates and seeds.
- TypeScript/build succeeds.
- App starts locally and exposes health/auth/trpc surfaces.
- Playwright smoke test covers login, dashboard, intake, command palette, and core navigation.
