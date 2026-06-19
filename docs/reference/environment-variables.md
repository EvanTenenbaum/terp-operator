# Environment Variables

All environment variables consumed by TERP Operator, from `src/server/env.ts` and `.env.example`.

## Server Runtime

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `development` | No | Runtime environment: `development`, `test`, or `production` |
| `APP_ORIGIN` | `http://localhost:5173` | No | CORS origin for the Express server |
| `PORT` | `8787` | No | HTTP server port |
| `DATABASE_URL` | `postgres://terp_agro:terp_agro@localhost:55432/terp_agro` | Yes (prod) | PostgreSQL connection string |
| `DATABASE_SSL` | `false` | No | Enable SSL for database connections (`true`/`false`) |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` | No | Reject unauthorized SSL certs (`true`/`false`) |
| `SESSION_SECRET` | dev-only default | **Yes (prod)** | Session signing secret (min 16 chars) |
| `JOURNAL_DIR` | `./storage/journal` | No | Directory for command journal archives |
| `ARCHIVE_DIR` | `./storage/archives` | No | Directory for backup/archive storage |

## Vite (Client Build)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `VITE_TRPC_URL` | `/trpc` | No | tRPC endpoint path |
| `VITE_SOCKET_URL` | `/` | No | Socket.io endpoint path |
| `VITE_AG_GRID_LICENSE_KEY` | (empty) | No | AG Grid Enterprise license key |
| `VITE_CANVAS_GRAMMAR_ENABLED` | `true` | No | Enable Canvas grammar features (CAP-007/CAP-008) |

## In-App Feedback (Crikket)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `VITE_CRIKKET_ENABLED` | `true` | No | Enable in-app feedback capture |
| `VITE_CRIKKET_HOST` | (empty) | No | Crikket instance URL |
| `VITE_CRIKKET_KEY` | (empty) | No | Crikket API key |
| `VITE_CRIKKET_SCRIPT_SRC` | `/vendor/crikket/capture.global.js` | No | Crikket script source |
| `VITE_CRIKKET_POSITION` | `top-left` | No | Widget position |

## Photography Module

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ENABLE_PHOTOGRAPHY` | `true` | No | Enable photography upload/serving routes |
| `MEDIA_STORAGE_PATH` | `storage/media` | No | File path for media storage |

## Demo / Seed Controls

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ALLOW_DEMO_SEED` | `false` | No | Allow DB wipe and re-seed on startup (dangerous) |
| `FORCE_RESEED` | (unset) | No | Force DB wipe and re-seed (destroys all data) |
| `DEMO_SEED_SCENARIO` | `baseline` | No | Seed scenario selection |
| `DEMO_DAYS` | `110` | No | Days of history to generate |
| `DEMO_MONTHLY_REVENUE` | `4000000` | No | Monthly revenue target for seed data |
| `DEMO_FLOWER_REVENUE_SHARE` | `0.95` | No | Flower category revenue share |
| `DEMO_CONSIGNED_FLOWER_PURCHASE_SHARE` | `0.85` | No | Consigned flower purchase share |
| `DEMO_CONSIGNED_FLOWER_RANGE_SHARE` | `0.50` | No | Consigned flower range share |
| `DEMO_WHALE_CUSTOMERS` | `8` | No | Number of high-volume customers |
| `DEMO_SMALL_CUSTOMERS` | `15` | No | Number of low-volume customers |
| `DEMO_LARGE_VENDORS` | `4` | No | Number of high-volume vendors |
| `DEMO_OTHER_VENDORS` | `15` | No | Number of smaller vendors |
| `DEMO_OUTDOOR_AVG_PRICE` | `150` | No | Outdoor flower average unit price |
| `DEMO_DEPS_AVG_PRICE` | `550` | No | Deps flower average unit price |
| `DEMO_INDOOR_AVG_PRICE` | `1100` | No | Indoor flower average unit price |
| `DEMO_RANDOM_SEED` | `520126` | No | Random seed for reproducible demo data |
