# TERP Operator — Deployment Guide

_Last updated: 2026-05-26 · TER-1603_

---

## Overview

TERP Operator ships as a single Docker image containing:
- A Vite-built client SPA (served as static files)
- An Express + tRPC server (`dist/server/index.js`)
- Drizzle ORM migrations (in `migrations/`)
- Storage directories for journal, archives, and media

For production, use `docker-compose.prod.yml` (self-hosted Droplet) or the DigitalOcean App Platform spec at `.do/terp-agro-staging.yaml`.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| `DATABASE_URL` | PostgreSQL 16 connection string (e.g. `postgresql://user:pass@host:5432/terp_agro`) |
| `SESSION_SECRET` | Random 32+ char string; keep secret |
| `APP_ORIGIN` | Public HTTPS URL (e.g. `https://terp.example.com`) |
| `NODE_ENV=production` | Set to `production` in the container |
| Docker 24+ / Docker Compose v2+ | Required for named volume and health-check support |
| PostgreSQL 16 | Managed DB (DigitalOcean, AWS RDS, etc.) or `postgres:16-alpine` container |

Optional:

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_SSL` | `false` | Set `true` for managed cloud databases |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` | Set `false` for self-signed certs on private networks |
| `VITE_AG_GRID_LICENSE_KEY` | (none) | Required for production use of AG Grid Enterprise |
| `VITE_TRPC_URL` | `/trpc` | Relative URL to tRPC endpoint; override only if using a reverse proxy with a different prefix |
| `VITE_SOCKET_URL` | `/` | Socket.IO server URL; override only if running WebSocket on a different host |
| `VITE_CANVAS_GRAMMAR_ENABLED` | `true` | Set `false` to revert to the pre-canvas shell (escape hatch; see TER-1604) |

---

## Build

```bash
# Build the production Docker image
docker build -t terp-operator .
```

> **Verified:** `docker build` completed successfully on 2026-05-26 (image `637cea437a11`). The multi-stage build compiles the client with Vite and installs only production server dependencies in the runtime layer.

Build stages:
1. **`build`** (node:22-alpine) — installs all deps, runs `pnpm build` (Vite + tsup)
2. **`runtime`** (node:22-alpine) — installs prod-only deps, copies `dist/`, `migrations/`, `scripts/`

---

## Database Migration

Run migrations before starting the app. The Drizzle CLI handles this:

```bash
# Against a remote database
DATABASE_URL="postgresql://user:pass@host:5432/terp_agro" pnpm db:migrate

# Or inside the running container
docker exec -it <container_name> node -e "require('./dist/server/migrate')"
```

Migration files live in `migrations/`. Never modify them manually; generate new ones with `pnpm db:generate`.

---

## Start (Self-Hosted — Docker Compose)

```bash
# Copy and fill in environment variables
cp .env.example .env
# Edit .env: set DATABASE_URL, SESSION_SECRET, APP_ORIGIN, etc.

# Start the stack (app + postgres)
docker compose -f docker-compose.prod.yml up -d

# Check health
curl http://localhost:8080/api/health
```

The `docker-compose.prod.yml` starts:
- `app` — TERP Operator on port `8787` (mapped to host `8080`)
- `postgres` — PostgreSQL 16 with healthcheck (app waits for healthy state)

---

## Start (DigitalOcean App Platform)

Use the spec at `.do/terp-agro-staging.yaml` as a template:

```bash
# Deploy to DigitalOcean App Platform
doctl apps create --spec .do/terp-agro-staging.yaml
```

Replace `__BRANCH__`, `__APP_ORIGIN__`, `__DATABASE_URL__`, `__SESSION_SECRET__`, and `__AG_GRID_LICENSE_KEY__` with real values before deploying (or inject via App Platform environment variable secrets).

> **Note:** DigitalOcean App Platform has no persistent filesystem volumes for App services. Journal and archive data is ephemeral on App Platform and will be wiped on every redeploy. For durable audit logs, use the Droplet + Compose path or a managed object storage layer.

---

## Health Check

```bash
curl http://localhost:8080/api/health
# Expected: {"ok":true,"db":"connected"}
```

The Dockerfile includes a built-in healthcheck:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
```

---

## Required Volumes

Named volumes are defined in `docker-compose.prod.yml`:

| Volume | Mount path | Purpose |
|--------|------------|---------|
| `terp-agro-postgres` | `/var/lib/postgresql/data` | PostgreSQL data directory |
| `terp-agro-journal` | `/app/storage/journal` | Audit log journal files |
| `terp-agro-archives` | `/app/storage/archives` | Finalized snapshot archives |
| `terp-agro-media` | `/app/storage/media` | Batch photography uploads |

> **Warning:** Do not remove these volumes between deployments. The journal and archive volumes contain the audit trail; losing them is equivalent to losing the period history.

---

## Rollback / Rollback Safety

1. Keep the previous Docker image tag before deploying a new build.
2. Before migrating, ensure a database snapshot/backup is current.
3. To roll back: pull the previous image tag, run `docker compose up -d --no-build`, point `image:` to the old tag in `docker-compose.prod.yml`.
4. Drizzle migrations are forward-only. A rollback that requires reversing a schema change needs a manual migration file.

---

## Common Commands

```bash
# View app logs
docker compose -f docker-compose.prod.yml logs -f app

# Run a one-off migration
docker compose -f docker-compose.prod.yml run --rm app node dist/server/migrate.js

# Rebuild and restart the app only (no postgres restart)
docker compose -f docker-compose.prod.yml up -d --build app

# Remove all containers and volumes (DESTRUCTIVE — data loss)
docker compose -f docker-compose.prod.yml down -v
```
