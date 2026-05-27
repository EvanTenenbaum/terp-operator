#!/bin/bash
set -e
mkdir -p artifacts

# Resolve PLAYWRIGHT_BASE_URL dynamically (GH #400)
# 1. Honour the caller's env var if already set
# 2. Try to detect the Tailscale IPv4 address
# 3. Fall back to localhost for local dev
if [ -z "${PLAYWRIGHT_BASE_URL:-}" ]; then
  _tailscale_ip=$(tailscale ip --4 2>/dev/null || true)
  if [ -z "$_tailscale_ip" ]; then
    _tailscale_ip=$(ip addr show tailscale0 2>/dev/null \
      | grep 'inet ' | awk '{print $2}' | cut -d/ -f1 || true)
  fi
  if [ -n "$_tailscale_ip" ]; then
    PLAYWRIGHT_BASE_URL="http://${_tailscale_ip}:5173"
  else
    PLAYWRIGHT_BASE_URL="http://127.0.0.1:5173"
  fi
fi

export PLAYWRIGHT_BASE_URL
echo "PLAYWRIGHT_BASE_URL=${PLAYWRIGHT_BASE_URL}"

PLAYWRIGHT_SKIP_WEB_SERVER=1 \
  pnpm exec playwright test tests/e2e/persona-flow-qa.spec.ts \
  --project=chromium --workers=1 --reporter=json \
  --timeout=120000 2>&1
