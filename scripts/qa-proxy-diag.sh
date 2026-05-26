#!/usr/bin/env bash
set -e
echo "[proxy-diag] Cleaning up..."
pkill -f "tsx src/server" 2>/dev/null || true
pkill -f "vite --host" 2>/dev/null || true
docker ps -a --filter "name=qa-postgres" --format "{{.Names}}" | xargs -r docker rm -f 2>/dev/null || true
fuser -k 8787/tcp 2>/dev/null || true; fuser -k 5173/tcp 2>/dev/null || true; sleep 2

echo "[proxy-diag] Starting QA env..."
> /tmp/pdiag-env.log
unset DATABASE_URL
QA_BRANCH=main pnpm qa:env:setup > /tmp/pdiag-env.log 2>&1 &
QA_PID=$!

for i in $(seq 1 80); do
  grep -q "QA_READY=true" /tmp/pdiag-env.log 2>/dev/null && { echo "[proxy-diag] QA ready at $i"; break; }
  sleep 3
done
sleep 10  # give Vite a moment after app is healthy

echo ""
echo "=== TEST 1: login direct to Express port 8787 ==="
curl -s -c /tmp/cookies-8787.txt \
  http://localhost:8787/trpc/auth.login \
  -H "Content-Type: application/json" \
  -D /tmp/headers-8787.txt \
  -d '{"json":{"email":"owner@terpagro.local","password":"terp-demo"}}' | python3 -m json.tool 2>/dev/null || echo "(not JSON)"
echo "--- Response headers ---"
grep -i "set-cookie\|content-type\|status" /tmp/headers-8787.txt || true

echo ""
echo "=== TEST 2: auth.me direct (port 8787) with cookie ==="
curl -s -b /tmp/cookies-8787.txt \
  http://localhost:8787/trpc/auth.me | python3 -m json.tool 2>/dev/null || echo "(not JSON)"

echo ""
echo "=== TEST 3: login through Vite proxy port 5173 ==="
curl -s -c /tmp/cookies-5173.txt \
  http://localhost:5173/trpc/auth.login \
  -H "Content-Type: application/json" \
  -D /tmp/headers-5173.txt \
  -d '{"json":{"email":"owner@terpagro.local","password":"terp-demo"}}' | python3 -m json.tool 2>/dev/null || echo "(not JSON)"
echo "--- Response headers (5173) ---"
grep -i "set-cookie\|content-type\|status" /tmp/headers-5173.txt || true
echo "--- Cookie jar (5173) ---"
cat /tmp/cookies-5173.txt

echo ""
echo "=== TEST 4: auth.me through Vite proxy (port 5173) with cookie ==="
curl -s -b /tmp/cookies-5173.txt \
  http://localhost:5173/trpc/auth.me | python3 -m json.tool 2>/dev/null || echo "(not JSON)"

echo ""
echo "=== TEST 5: error-context from a quick Playwright login attempt ==="
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL="http://localhost:5173" \
  pnpm exec playwright test tests/e2e/persona-flow-qa.spec.ts \
  --project=chromium --workers=1 --reporter=line \
  --timeout=60000 -g "X1 – Cross" 2>&1 || true

echo "--- Error context ---"
find test-results -name "error-context.md" 2>/dev/null | head -1 | xargs cat 2>/dev/null || echo "No error context found"

kill $QA_PID 2>/dev/null || true
