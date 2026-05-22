#!/usr/bin/env bash
# QA Environment Setup — runs on the fast runner via fast-runner exec.
# Emits KEY=VALUE lines on stdout for the Mac mini agent to parse.
# Keeps the app running until the fast-runner job is cancelled (trap cleans up).
set -euo pipefail

QA_BRANCH="${QA_BRANCH:-main}"
APP_PID=""

# Source .env if present (runner worktree may not have env vars pre-loaded)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Cleanup: always kill app process on any exit
cleanup() {
  if [ -n "$APP_PID" ]; then
    echo "[qa:setup] Stopping app (PID $APP_PID)..."
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  echo "[qa:setup] QA env torn down."
}
trap cleanup EXIT

echo "[qa:setup] Starting QA environment for branch: $QA_BRANCH"

# Gate 0: verify schema before committing to full seed
echo "[qa:setup] Running preflight check..."
if ! bash scripts/qa-preflight.sh; then
  echo "QA_ERROR=seed_preflight_failed"
  echo "QA_READY=false"
  exit 1
fi

# Migrate (idempotent — safe to run even if already migrated)
echo "[qa:setup] Running migrations..."
pnpm db:migrate

# Seed with realistic 100-day scenario
echo "[qa:setup] Seeding database..."
if ! pnpm db:seed:realistic 2>&1 | tee /tmp/qa-seed.log; then
  echo "QA_ERROR=seed_failed"
  echo "QA_READY=false"
  exit 1
fi
echo "[qa:setup] Seed complete."

# Export seed state JSON for seed-state-reference.md
echo "[qa:setup] Exporting seed state..."
QA_BRANCH="$QA_BRANCH" node scripts/qa-export-seed-state.js > /tmp/qa-seed-state.json 2>&1 \
  || echo "[qa:setup] Warning: seed state export failed — agent will need to update seed-state-reference.md manually"

# Start app in background using dev:e2e (no HMR, stable for testing)
echo "[qa:setup] Starting app (pnpm dev:e2e)..."
pnpm dev:e2e > /tmp/qa-app.log 2>&1 &
APP_PID=$!
echo "[qa:setup] App started with PID $APP_PID"

# Wait for app health via Vite proxy (60 second timeout)
echo "[qa:setup] Waiting for http://localhost:5173/api/health ..."
if ! ./node_modules/.bin/wait-on "http://localhost:5173/api/health" --timeout 60000 2>&1; then
  echo "[qa:setup] App failed to start within 60s. Last 20 lines of app log:"
  tail -20 /tmp/qa-app.log || true
  echo "QA_ERROR=app_start_timeout"
  echo "QA_READY=false"
  exit 1
fi
echo "[qa:setup] App is healthy."

# Get this runner's Tailscale IP (runner has tailscale CLI installed)
TAILSCALE_IP=$(tailscale ip --4 2>/dev/null | head -1 \
  || ip addr show tailscale0 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1 \
  || echo "")

if [ -z "$TAILSCALE_IP" ]; then
  echo "[qa:setup] Warning: Tailscale IP not found — using localhost (Tailscale may not be active)"
  TAILSCALE_IP="localhost"
fi

# Emit structured output — agent parses KEY=VALUE lines
SEED_STATE=$(cat /tmp/qa-seed-state.json 2>/dev/null | tr -d '\n' || echo '{}')

echo "QA_APP_URL=http://${TAILSCALE_IP}:5173"
echo "QA_TAILSCALE_IP=${TAILSCALE_IP}"
echo "QA_BRANCH=${QA_BRANCH}"
echo "QA_USER_EMAIL=owner@terpagro.local"
echo "QA_USER_PASSWORD=terp-demo"
echo "QA_SEED_STATE=${SEED_STATE}"
echo "QA_READY=true"

echo ""
echo "==================================================="
echo " QA environment is ready."
echo " App URL (Tailscale): http://${TAILSCALE_IP}:5173"
echo " Login: owner@terpagro.local / terp-demo"
echo " Cancel this job (Ctrl-C) to tear down."
echo "==================================================="

# Keep alive — trap will stop the app when this process exits
wait "$APP_PID" || true
