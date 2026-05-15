# TERP Agro Implementation Log

## Decision Log
- New project root: `/Users/evan/spec-erp-docker/Local Computer work etc/terp-agro`.
- Same-origin deployment: Express serves Vite build and tRPC/session cookies from one host.
- Spreadsheet-first UI: every journey is built around AG Grid, keyboard shortcuts, row selection, CSV export, and inline detail panels.
- Command layer: one typed command bus enforces idempotency, RBAC, journal writes, and Socket.io refresh events.

## Checkpoints
- Initialized task state docs.
- Built database schema, SQL migration, seed data, session auth, RBAC, tRPC routers, Socket.io, and audited command bus.
- Built React operator console with dashboard, intake, sales, order posting, payments, inventory, client ledger, vendor payouts, fulfillment, connectors, recovery, closeout, command palette, hotkeys, and grid CSV export.
- Fixed live runtime defects found by Playwright: Socket.io/Express request-handler conflict and unstable Zustand array selectors.
- Verified with `pnpm typecheck`, `pnpm build`, `pnpm db:migrate`, `pnpm db:seed`, `/api/health`, and `pnpm test:e2e`.
- Completed backend/frontend parity pass: surfaced CSV import, draft batch delete, lot/expiration edits, sales-line remove, reserve inventory, typed delivery-window updates, payment unallocation, early-pay discounts, manual vendor bills, vendor payout voids, literal pick-list creation, connector approval, deterministic server CSV export, inventory movement history, photography queue rows, and deeper relationship drawer records.
- Added `scripts/check-backend-frontend-parity.mjs` plus `pnpm audit:parity` so new backend commands/query endpoints cannot silently drift away from the UI.
- Completed ease-of-use frontend pass: Quick Start lanes no longer toggle to empty, navigation aligns Quick Start to the active workflow, New Sale carries request text into Sales/Finder, Finder hides advanced filters by default, natural price hints like `under 100` become max-price filters, and empty Sales secondary panels stay hidden until useful.
- Added staging deployment spine: production build now emits compiled `migrate.js` and `seed.js`, `pnpm start:staging` runs migration plus guarded demo seed before boot, `.do/terp-agro-staging.yaml` defines the DigitalOcean App Platform staging app, GitHub Actions can upsert staging, and the Droplet fallback has a Caddy compose overlay.
