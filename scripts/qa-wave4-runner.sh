#!/usr/bin/env bash
# Wave 4 Persona QA runner — starts ephemeral QA env then runs all 26 persona flow tests.
# Designed to run on the DigitalOcean fast runner via fast-runner exec.
# Usage: bash scripts/qa-wave4-runner.sh
set -e

echo "[wave4-qa] Cleaning up any orphaned QA postgres containers..."
docker ps -a --filter "name=qa-postgres" --format "{{.Names}}" | xargs -r docker rm -f || true
echo "[wave4-qa] Port cleanup done."

echo "[wave4-qa] Starting QA environment in background..."
QA_BRANCH=main pnpm qa:env:setup > /tmp/qa-env.log 2>&1 &
QA_PID=$!

# Wait up to 4 minutes for QA_READY=true
READY=false
for i in $(seq 1 80); do
  if grep -q "QA_READY=true" /tmp/qa-env.log 2>/dev/null; then
    READY=true
    echo "[wave4-qa] QA_READY detected (attempt $i)"
    break
  fi
  if ! kill -0 $QA_PID 2>/dev/null; then
    echo "[wave4-qa] ERROR: QA env process exited early. Log:"
    cat /tmp/qa-env.log
    exit 1
  fi
  sleep 3
done

if [ "$READY" != "true" ]; then
  echo "[wave4-qa] ERROR: QA environment not ready after 4 minutes. Log:"
  cat /tmp/qa-env.log
  kill $QA_PID 2>/dev/null
  exit 1
fi

if grep -q "QA_ERROR=" /tmp/qa-env.log; then
  QA_ERR=$(grep "QA_ERROR=" /tmp/qa-env.log | head -1)
  echo "[wave4-qa] QA_ERROR detected: $QA_ERR"
  kill $QA_PID 2>/dev/null
  exit 1
fi

# Extract the actual app URL from the log (avoids fast-runner guard rewriting localhost)
QA_APP_URL=$(grep "^QA_APP_URL=" /tmp/qa-env.log | head -1 | cut -d= -f2-)
if [ -z "$QA_APP_URL" ]; then
  # Fallback: use Tailscale-routed address from runner identity
  QA_APP_URL="http://$(hostname -I | awk '{print $1}'):5173"
fi

# Display key vars (excluding large JSON blob and READY=true)
grep "^QA_" /tmp/qa-env.log | grep -v "QA_SEED_STATE" | grep -v "QA_READY" || true
echo "[wave4-qa] Using PLAYWRIGHT_BASE_URL: $QA_APP_URL"

# Verify the app is actually responding before running tests
for i in 1 2 3 4 5; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$QA_APP_URL/api/health" --connect-timeout 5 || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "[wave4-qa] App health check passed (HTTP $HTTP_STATUS)"
    break
  fi
  echo "[wave4-qa] App health check attempt $i: HTTP $HTTP_STATUS — waiting 3s..."
  sleep 3
done

# Diagnostic: check what the root URL serves (first 400 chars)
echo "[wave4-qa] Diagnosing root URL content..."
ROOT_HTML=$(curl -s "$QA_APP_URL/" --connect-timeout 10 --max-time 30 | head -c 400 || echo "CURL_FAILED")
echo "[wave4-qa] Root URL response: $ROOT_HTML"

# Warmup: Vite compiles JS modules on first browser request — wait for Vite to be stable
# The health check only confirms Express is up, not Vite's module graph compilation
echo "[wave4-qa] Waiting 90s for Vite dev server initial compilation..."
sleep 90

# Post-warmup: verify root URL still serves
echo "[wave4-qa] Post-warmup health check..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$QA_APP_URL/" --connect-timeout 10 || echo "000")
echo "[wave4-qa] Root URL status post-warmup: HTTP $HTTP_STATUS"
ROOT_HTML2=$(curl -s "$QA_APP_URL/" --connect-timeout 10 --max-time 15 | head -c 200 || echo "CURL_FAILED")
echo "[wave4-qa] Root content: $ROOT_HTML2"

echo "[wave4-qa] Running all 26 persona flow tests..."
mkdir -p artifacts docs/qa/runs/screenshots

PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL="$QA_APP_URL" \
  pnpm exec playwright test tests/e2e/persona-flow-qa.spec.ts \
  --project=chromium --workers=1 --reporter=line \
  --timeout=120000
TEST_EXIT=$?

echo "[wave4-qa] Tests completed with exit code: $TEST_EXIT"

# Print test artifacts for log parsing
if [ -d artifacts ]; then
  ls -la artifacts/ 2>/dev/null || true
fi

kill $QA_PID 2>/dev/null
sleep 2
exit $TEST_EXIT
