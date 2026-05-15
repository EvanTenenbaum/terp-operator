#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_DEMO_SEED:-}" != "true" ]]; then
  cat >&2 <<'MSG'
Refusing to reset staging data without ALLOW_DEMO_SEED=true.

This command truncates operational tables and reloads demo data. Use only
against a staging/demo database, never against production operational data.
MSG
  exit 1
fi

if [[ ! -f dist/server/migrate.js || ! -f dist/server/seed.js ]]; then
  pnpm build
fi

NODE_ENV="${NODE_ENV:-production}" pnpm db:migrate:prod
NODE_ENV="${NODE_ENV:-production}" ALLOW_DEMO_SEED=true DEMO_SEED_SCENARIO="${DEMO_SEED_SCENARIO:-realistic_100d}" pnpm db:seed:prod
pnpm audit:realistic-demo
