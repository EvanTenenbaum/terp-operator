# TERP Agro Staging

The preferred review environment is DigitalOcean App Platform from `.do/terp-agro-staging.yaml`. It builds the Dockerfile, uses a DigitalOcean Postgres 16 app database, runs compiled migrations, reloads demo data, and serves the app same-origin.

## App Platform

Required secrets for GitHub Actions:

- `DIGITALOCEAN_ACCESS_TOKEN`
- `TERP_AGRO_STAGING_DATABASE_URL`
- `TERP_AGRO_STAGING_SESSION_SECRET`
- `VITE_AG_GRID_LICENSE_KEY` optional

Manual deploy from a checked-out branch:

```bash
export TERP_AGRO_STAGING_SESSION_SECRET="$(openssl rand -base64 48)"
export TERP_AGRO_STAGING_DATABASE_URL="postgres://..."
export STAGING_BRANCH="$(git branch --show-current)"
spec_path="$(node scripts/render-digitalocean-spec.mjs .do/terp-agro-staging.yaml artifacts/terp-agro-staging.rendered.yaml)"
doctl apps create --spec "$spec_path" --upsert --update-sources --wait
```

The app starts with `pnpm start:staging`, which runs the compiled migration and seed scripts before the server starts. This is intentionally demo-data only.

## Droplet + Caddy Alternative

Use this when a staging Droplet is preferred over App Platform:

```bash
export TERP_AGRO_STAGING_DOMAIN=staging.example.com
export CADDY_ACME_EMAIL=owner@example.com
docker compose -f docker-compose.prod.yml -f deploy/staging/docker-compose.caddy.yml up -d --build
docker compose -f docker-compose.prod.yml exec app pnpm db:migrate:prod
docker compose -f docker-compose.prod.yml exec -e ALLOW_DEMO_SEED=true app pnpm db:seed:prod
```

Reset demo data:

```bash
ALLOW_DEMO_SEED=true pnpm staging:reset
```

Never point `ALLOW_DEMO_SEED=true` at a production operational database.
