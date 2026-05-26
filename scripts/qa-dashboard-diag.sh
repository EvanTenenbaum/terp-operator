#!/usr/bin/env bash
set -e
echo "[dd] Cleaning up..."
pkill -f "tsx src/server" 2>/dev/null || true
pkill -f "vite --host" 2>/dev/null || true
docker ps -a --filter "name=qa-postgres" --format "{{.Names}}" | xargs -r docker rm -f 2>/dev/null || true
fuser -k 8787/tcp 2>/dev/null || true; fuser -k 5173/tcp 2>/dev/null || true; sleep 2

echo "[dd] Starting QA env..."
> /tmp/dd-env.log
unset DATABASE_URL
QA_BRANCH=main pnpm qa:env:setup > /tmp/dd-env.log 2>&1 &
QA_PID=$!
for i in $(seq 1 80); do
  grep -q "QA_READY=true" /tmp/dd-env.log 2>/dev/null && { echo "[dd] QA ready at $i"; break; }
  sleep 3
done
sleep 5

echo "[dd] Getting session cookie via login..."
curl -s -c /tmp/dd-cookies.txt \
  http://localhost:5173/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"owner@terpagro.local","password":"terp-demo"}}' > /dev/null

echo "[dd] Testing queries.dashboard (should succeed if user is owner)..."
curl -s -b /tmp/dd-cookies.txt \
  "http://localhost:5173/trpc/queries.dashboard" \
  -w "\nHTTP: %{http_code}" | python3 -c "
import sys, json
txt = sys.stdin.read()
lines = txt.strip().split('\n')
http_line = lines[-1] if lines[-1].startswith('HTTP') else ''
body = '\n'.join(lines[:-1]) if http_line else txt
print('HTTP status:', http_line)
try:
    data = json.loads(body)
    if 'error' in data:
        print('ERROR:', json.dumps(data.get('error', {}), indent=2)[:500])
    elif 'result' in data:
        print('SUCCESS, keys:', list(data.get('result', {}).get('data', {}).get('json', {}).keys()))
    else:
        print('Unexpected response:', body[:300])
except:
    print('Raw response (first 300 chars):', body[:300])
"

echo "[dd] Testing queries.workQueue..."
curl -s -b /tmp/dd-cookies.txt \
  "http://localhost:5173/trpc/queries.workQueue" \
  -w "\nHTTP: %{http_code}" | python3 -c "
import sys, json
txt = sys.stdin.read()
lines = txt.strip().split('\n')
http_line = lines[-1] if lines[-1].startswith('HTTP') else ''
body = '\n'.join(lines[:-1]) if http_line else txt
print('HTTP status:', http_line)
try:
    data = json.loads(body)
    if 'error' in data:
        print('ERROR:', json.dumps(data.get('error', {}), indent=2)[:500])
    elif 'result' in data:
        r = data.get('result', {}).get('data', {}).get('json', [])
        print('SUCCESS, returned', len(r), 'items')
    else:
        print('Unexpected:', body[:300])
except:
    print('Raw:', body[:300])
"

kill $QA_PID 2>/dev/null || true
