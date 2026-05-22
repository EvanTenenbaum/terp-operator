#!/bin/bash
set -e
mkdir -p artifacts
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://100.104.134.78:5173 \
  pnpm exec playwright test tests/e2e/persona-flow-qa.spec.ts \
  --project=chromium --workers=1 --reporter=json \
  --timeout=120000 2>&1
