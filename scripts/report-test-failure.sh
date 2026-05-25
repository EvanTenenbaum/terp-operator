#!/usr/bin/env bash
# Usage: report-test-failure.sh <tier> <run-id>
# Called from CI workflows on failure. Requires GH_TOKEN env var.
set -euo pipefail

TIER="${1:-unknown}"
RUN_ID="${2:-}"
RUN_URL="https://github.com/${GITHUB_REPOSITORY:-unknown/repo}/actions/runs/${RUN_ID}"
TIMESTAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"

echo "[report-test-failure] tier=${TIER} run=${RUN_ID}"

# AQA fix: ensure required labels exist before trying to file an issue.
# --force is a no-op if the label already exists (idempotent).
gh label create "tracking:known-issue" --color "d73a4a" --description "Confirmed or suspected bug, runtime failure, confusing UX, data drift, or test gap." --force 2>/dev/null || true
gh label create "source:agent"         --color "bfdadc" --description "Created or updated by an agent." --force 2>/dev/null || true
gh label create "area:qa"              --color "fef2c0" --description "Tests, verification, coverage, or release gates." --force 2>/dev/null || true

# AQA fix: strip brackets from search query — GitHub search treats [ ] as
# grouping operators and may not find exact bracket-wrapped titles.
# Instead, search by TIER alone with in:title and rely on jq contains() for
# exact title matching. This is safer than bracket-inclusive search.
EXISTING=$(gh issue list \
  --state open \
  --label "area:qa" \
  --label "source:agent" \
  --search "${TIER} Test failure in:title" \
  --json number,title \
  --jq ".[] | select(.title | ascii_downcase | contains(\"${TIER}\" | ascii_downcase)) | .number" \
  2>/dev/null | head -1 || true)

if [ -n "$EXISTING" ]; then
  echo "[report-test-failure] Appending to existing issue #${EXISTING}"
  gh issue comment "$EXISTING" \
    --body "**Recurred**: ${RUN_URL}
**Time**: ${TIMESTAMP}"
else
  echo "[report-test-failure] Creating new issue"
  gh issue create \
    --title "[${TIER}] Test failure — $(date -u '+%Y-%m-%d')" \
    --label "tracking:known-issue" \
    --label "source:agent" \
    --label "area:qa" \
    --body "**Tier**: \`${TIER}\`
**Run**: ${RUN_URL}
**Time**: ${TIMESTAMP}

Automated monitoring run failed. Check the run link for failing spec names and full error output.

## Reproduce locally

\`\`\`bash
# Smoke tier
PLAYWRIGHT_BASE_URL=<staging-url> PLAYWRIGHT_SKIP_WEB_SERVER=1 \\
  pnpm exec playwright test --project=smoke

# Full core-e2e tier
PLAYWRIGHT_BASE_URL=<staging-url> PLAYWRIGHT_SKIP_WEB_SERVER=1 \\
  pnpm exec playwright test --project=chromium

# Unit tier
pnpm exec vitest run
\`\`\`

Close this issue with a comment linking the fix PR and the passing run."
fi
