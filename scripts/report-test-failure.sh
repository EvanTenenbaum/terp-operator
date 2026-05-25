#!/usr/bin/env bash
# Usage: report-test-failure.sh <tier> <run-id>
# Called from CI workflows on failure. Requires GH_TOKEN env var (issues:write scope).
set -euo pipefail

TIER="${1:-unknown}"
RUN_ID="${2:-}"
RUN_URL="https://github.com/${GITHUB_REPOSITORY:-unknown/repo}/actions/runs/${RUN_ID}"
TIMESTAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"

echo "[report-test-failure] tier=${TIER} run=${RUN_ID}"

# Label preflight — idempotent, fails gracefully if GH_TOKEN lacks label:write
# (separate from issues:write). The || true prevents script abort; if labels
# already exist the create is a no-op.
gh label create "tracking:known-issue" --color "d73a4a" \
  --description "Confirmed or suspected bug, runtime failure, confusing UX, data drift, or test gap." \
  --force 2>/dev/null || true
gh label create "source:agent" --color "bfdadc" \
  --description "Created or updated by an agent." \
  --force 2>/dev/null || true
gh label create "area:qa" --color "fef2c0" \
  --description "Tests, verification, coverage, or release gates." \
  --force 2>/dev/null || true

# H1 FIX: avoid GitHub search for de-dup (search tokenizes on hyphens, making
# tier-scoped matching unreliable for names like "post-deploy-smoke").
# Instead, list all open QA+agent issues and filter locally with jq startswith().
# This is O(N) on open issues but reliable; N is small in practice.
EXISTING=$(gh issue list \
  --state open \
  --label "area:qa" \
  --label "source:agent" \
  --limit 100 \
  --json number,title \
  --jq ".[] | select(.title | startswith(\"[${TIER}]\")) | .number" \
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

Automated monitoring run failed. Check the run link for failing spec names, full error output, and the uploaded Playwright trace artifact.

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
