#!/usr/bin/env bash
set -e
echo "[diag] Cleaning up..."
pkill -f "tsx src/server" 2>/dev/null || true
pkill -f "vite --host" 2>/dev/null || true
docker ps -a --filter "name=qa-postgres" --format "{{.Names}}" | xargs -r docker rm -f 2>/dev/null || true
fuser -k 8787/tcp 2>/dev/null || true; fuser -k 5173/tcp 2>/dev/null || true; sleep 2

echo "[diag] Starting QA env..."
> /tmp/diag-env.log
unset DATABASE_URL
QA_BRANCH=main pnpm qa:env:setup > /tmp/diag-env.log 2>&1 &
QA_PID=$!

for i in $(seq 1 80); do
  grep -q "QA_READY=true" /tmp/diag-env.log 2>/dev/null && { echo "[diag] QA ready at attempt $i"; break; }
  sleep 3
done

# Test login via curl with cookie jar
echo "[diag] Testing login via curl..."
curl -s -c /tmp/diag-cookies.txt \
  http://localhost:8787/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"owner@terpagro.local","password":"terp-demo"}}' \
  -w "\n[diag] Login HTTP status: %{http_code}" \
  -o /tmp/diag-login-resp.json
echo ""
echo "[diag] Login response: $(cat /tmp/diag-login-resp.json)"
echo "[diag] Cookies: $(cat /tmp/diag-cookies.txt)"

# Test auth.me with cookie
echo "[diag] Testing auth.me with session cookie..."
curl -s -b /tmp/diag-cookies.txt \
  "http://localhost:8787/trpc/auth.me" \
  -w "\n[diag] auth.me HTTP status: %{http_code}" \
  -o /tmp/diag-me-resp.json
echo ""
echo "[diag] auth.me response: $(cat /tmp/diag-me-resp.json)"

# Check if session table exists
echo "[diag] Checking session table..."
docker exec $(docker ps --filter "name=qa-postgres" --format "{{.Names}}" | head -1) \
  psql -U terp_agro -d terp_agro -c "SELECT count(*) FROM session;" 2>&1 || echo "[diag] session table check failed"

echo "[diag] Done."
kill $QA_PID 2>/dev/null || true
