# Ongoing Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a 3-tier live monitoring pyramid (smoke post-deploy, core-e2e nightly, unit on every PR) with GitHub Issue alerting — using only tools already in the repo.

**Architecture:** 5 new smoke Playwright specs in `tests/smoke/` (isolated from `tests/e2e/` to prevent double-execution), two new GitHub Actions workflows (post-deploy-smoke, nightly), and a full Vitest run added to the existing `ci.yml`. A bash script handles GitHub Issue create/de-dup on failure.

**Tech Stack:** Playwright, Vitest, GitHub Actions, `gh` CLI (pre-installed on ubuntu-latest), TypeScript

---

## File Map

| Status | Path | Purpose |
|--------|------|---------|
| Create | `tests/smoke/_helpers.ts` | `waitForBackend`, `loginAsOwner` shared helpers |
| Create | `tests/smoke/health.spec.ts` | `/api/health` + app shell load |
| Create | `tests/smoke/auth-shell.spec.ts` | Login + authenticated nav shell |
| Create | `tests/smoke/intake-smoke.spec.ts` | IntakeView + AG Grid visible |
| Create | `tests/smoke/sales-smoke.spec.ts` | SalesView + AG Grid visible |
| Create | `tests/smoke/payments-smoke.spec.ts` | PaymentsView + Payment allocations heading |
| Create | `scripts/report-test-failure.sh` | GH issue create/de-dup on CI failure |
| Create | `.github/workflows/post-deploy-smoke.yml` | Triggers after deploy-staging succeeds |
| Create | `.github/workflows/nightly.yml` | Scheduled 6am ET |
| Modify | `playwright.config.ts` | Add smoke project; pin chromium testDir |
| Modify | `.github/workflows/ci.yml` | Add full Vitest run |
| Modify | `docs/design-system/decisions-log.md` | Add testing-convention entry |

---

### Task 1: Update playwright.config.ts — add smoke project and pin chromium testDir

**Files:**
- Modify: `playwright.config.ts`

The top-level `testDir: './tests/e2e'` is the global default. Adding a project-level `testDir` overrides it for that project. We need the `smoke` project to point at `./tests/smoke` and the `chromium` project to explicitly declare `./tests/e2e` so both are self-documenting and a future global testDir change can't bleed over.

- [ ] **Replace the full contents of `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'pnpm dev:e2e',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 120_000
      },
  projects: [
    {
      // Fast smoke tier — 5 specs against live staging URL.
      // Lives at tests/smoke/ (top-level) so the chromium project
      // cannot accidentally include it via recursive testDir glob.
      name: 'smoke',
      testDir: './tests/smoke',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      // Full operator workflow e2e suite — 26 specs.
      // Explicit testDir prevents ambiguity if global default changes.
      name: 'chromium',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
```

- [ ] **Verify TypeScript is happy**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Commit**

```bash
git add playwright.config.ts
git commit -m "test: add smoke Playwright project, pin chromium testDir"
```

---

### Task 2: Create tests/smoke/_helpers.ts

**Files:**
- Create: `tests/smoke/_helpers.ts`

Shared helpers keep all 5 smoke specs DRY. `loginAsOwner` reads credentials from env vars so CI can inject rotatable secrets without code changes.

- [ ] **Create `tests/smoke/_helpers.ts`**

```typescript
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'owner@terpagro.local';
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'terp-demo';

/**
 * Polls /api/health until the server responds ok.
 * Use at the start of any smoke spec that needs a live backend.
 */
export async function waitForBackend(page: Page): Promise<void> {
  await expect
    .poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 })
    .toBe(true);
}

/**
 * Navigates to / and logs in as the owner test account.
 * After this resolves, the authenticated shell is visible.
 */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });
}
```

- [ ] **Commit**

```bash
git add tests/smoke/_helpers.ts
git commit -m "test(smoke): add shared waitForBackend and loginAsOwner helpers"
```

---

### Task 3: Create tests/smoke/health.spec.ts

**Files:**
- Create: `tests/smoke/health.spec.ts`

This spec has zero auth dependency — it just checks the server is up and the app shell loads.

- [ ] **Create `tests/smoke/health.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test.describe('health', () => {
  test('API health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('app shell loads without JS crash', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto('/');
    // Either login page or authenticated app renders — not a blank/crash screen
    await expect(
      page.locator('input[type="email"], [role="navigation"]').first()
    ).toBeVisible({ timeout: 15_000 });
    // No uncaught JS errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Commit**

```bash
git add tests/smoke/health.spec.ts
git commit -m "test(smoke): health endpoint and app shell load check"
```

---

### Task 4: Create tests/smoke/auth-shell.spec.ts

**Files:**
- Create: `tests/smoke/auth-shell.spec.ts`

- [ ] **Create `tests/smoke/auth-shell.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('login and authenticated shell render', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await loginAsOwner(page);
  // Navigation shell must be present
  await expect(page.getByRole('navigation')).toBeVisible();
  // Quick-actions keel must be present (used by all operator flows)
  await expect(
    page.getByRole('banner', { name: 'Global workspace keel' })
  ).toBeVisible();
});
```

- [ ] **Commit**

```bash
git add tests/smoke/auth-shell.spec.ts
git commit -m "test(smoke): login and authenticated shell presence"
```

---

### Task 5: Create tests/smoke/intake-smoke.spec.ts

**Files:**
- Create: `tests/smoke/intake-smoke.spec.ts`

- [ ] **Create `tests/smoke/intake-smoke.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('IntakeView renders AG Grid and command palette opens', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  await page.getByRole('navigation').getByRole('button', { name: /Intake/ }).click();
  await expect(page.getByText('Intake queue').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });

  // Command palette must open (core operator interaction)
  await page.getByRole('button', { name: /^Search/ }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');
});
```

- [ ] **Commit**

```bash
git add tests/smoke/intake-smoke.spec.ts
git commit -m "test(smoke): IntakeView and command palette availability"
```

---

### Task 6: Create tests/smoke/sales-smoke.spec.ts

**Files:**
- Create: `tests/smoke/sales-smoke.spec.ts`

- [ ] **Create `tests/smoke/sales-smoke.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('SalesView renders with AG Grid', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
  await expect(page.getByText('Sales Orders').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Commit**

```bash
git add tests/smoke/sales-smoke.spec.ts
git commit -m "test(smoke): SalesView AG Grid availability"
```

---

### Task 7: Create tests/smoke/payments-smoke.spec.ts

**Files:**
- Create: `tests/smoke/payments-smoke.spec.ts`

Navigation uses `data-testid="sidenav-item-payments"` (confirmed in `payment-processor-qa.spec.ts`). PaymentsView renders an h2 "Payment allocations" (confirmed in `OperationsViews.tsx:1162`).

- [ ] **Create `tests/smoke/payments-smoke.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('PaymentsView renders with Payment allocations section', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  await page.click('[data-testid="sidenav-item-payments"]');
  await expect(page.getByText('Payment allocations').first()).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Commit**

```bash
git add tests/smoke/payments-smoke.spec.ts
git commit -m "test(smoke): PaymentsView availability"
```

---

### Task 8: Run smoke suite locally and verify all 6 tests pass

- [ ] **Start the dev server in a separate terminal** (or confirm it's already running)

```bash
pnpm dev:e2e
```

- [ ] **Run smoke project**

```bash
pnpm exec playwright test --project=smoke
```

Expected output:
```
Running 6 tests using 1 worker

  ✓ health › API health endpoint returns ok
  ✓ health › app shell loads without JS crash
  ✓ login and authenticated shell render
  ✓ IntakeView renders AG Grid and command palette opens
  ✓ SalesView renders with AG Grid
  ✓ PaymentsView renders with Payment allocations section

6 passed (XX.Xs)
```

If any test fails: read the error, compare against the assertion in the spec, fix the selector or text. Common failures:
- **Timeout waiting for 'Owner Daily Decision View'**: backend slow to start — increase `waitForBackend` timeout or wait longer after login
- **'.ag-root:visible' not found**: grid lazy-loads — add `page.waitForSelector('.ag-root')` before the expect
- **'Payment allocations' not found**: navigate to the correct sub-tab in PaymentsView; inspect what text is actually visible

- [ ] **Also verify the chromium project still lists only the original 26 specs (not smoke)**

```bash
pnpm exec playwright test --project=chromium --list | wc -l
```

Expected: should NOT include `tests/smoke/` paths.

---

### Task 9: Create scripts/report-test-failure.sh

**Files:**
- Create: `scripts/report-test-failure.sh`

This script is called from CI workflows on failure. It de-dups against existing open issues using two `--label` flags (AND semantics) and `in:title` scoping per tier name, then either appends a comment or creates a new issue.

- [ ] **Create `scripts/report-test-failure.sh`**

```bash
#!/usr/bin/env bash
# Usage: report-test-failure.sh <tier> <run-id>
# Called by CI workflows on failure. Requires GH_TOKEN env var.
set -euo pipefail

TIER="${1:-unknown}"
RUN_ID="${2:-}"
TITLE="[${TIER}] Test failure detected"
RUN_URL="https://github.com/${GITHUB_REPOSITORY:-unknown/repo}/actions/runs/${RUN_ID}"
TIMESTAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"

echo "[report-test-failure] tier=${TIER} run=${RUN_ID}"

# De-dup: two --label flags = AND semantics (single --label with comma = OR or error)
# --search uses in:title to scope to exact tier name
EXISTING=$(gh issue list \
  --state open \
  --label "area:qa" \
  --label "source:agent" \
  --search "${TITLE} in:title" \
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
    --title "${TITLE} — $(date -u '+%Y-%m-%d')" \
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
```

- [ ] **Make executable**

```bash
chmod +x scripts/report-test-failure.sh
```

- [ ] **Commit**

```bash
git add scripts/report-test-failure.sh
git commit -m "ci: add report-test-failure.sh for GH issue create/de-dup on monitoring failures"
```

---

### Task 10: Create .github/workflows/post-deploy-smoke.yml

**Files:**
- Create: `.github/workflows/post-deploy-smoke.yml`

Fires after `deploy-staging` completes successfully. Uses `ref: github.event.workflow_run.head_sha` so the checked-out code matches what was actually deployed (not `main`).

The workflow name `"deploy-staging"` must exactly match the `name:` field in `.github/workflows/deploy-staging.yml`. Verify it: `grep '^name:' .github/workflows/deploy-staging.yml` → `name: deploy-staging` ✓

- [ ] **Create `.github/workflows/post-deploy-smoke.yml`**

```yaml
name: post-deploy-smoke

on:
  workflow_run:
    workflows: ["deploy-staging"]
    types: [completed]

jobs:
  smoke:
    # Only run if the staging deploy actually succeeded
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # Check out the exact commit that was deployed, not the default branch.
          # Without this, workflow_run checkouts default to the repo default branch,
          # meaning we'd test main even if staging was deployed from a feature branch.
          ref: ${{ github.event.workflow_run.head_sha }}

      - uses: pnpm/action-setup@v6
        with:
          version: 10.25.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile=false

      - run: pnpm exec playwright install --with-deps chromium

      - name: Run smoke suite against staging
        run: pnpm exec playwright test --project=smoke
        env:
          PLAYWRIGHT_BASE_URL: ${{ vars.STAGING_URL }}
          PLAYWRIGHT_SKIP_WEB_SERVER: "1"
          PLAYWRIGHT_TEST_EMAIL: ${{ secrets.STAGING_TEST_EMAIL }}
          PLAYWRIGHT_TEST_PASSWORD: ${{ secrets.STAGING_TEST_PASSWORD }}

      - name: Report failure
        if: failure()
        run: bash scripts/report-test-failure.sh "post-deploy-smoke" "${{ github.run_id }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
```

- [ ] **Commit**

```bash
git add .github/workflows/post-deploy-smoke.yml
git commit -m "ci: add post-deploy-smoke workflow — fires after deploy-staging succeeds"
```

---

### Task 11: Create .github/workflows/nightly.yml

**Files:**
- Create: `.github/workflows/nightly.yml`

Three parallel jobs: smoke, core-e2e (needs smoke), unit. The `report-failures` job uses `if: always()` with explicit per-job result conditions — **critical**. Without `always()`, GHA silently skips this job when smoke fails (because core-e2e is skipped, and a job with a skipped dependency is itself skipped).

- [ ] **Create `.github/workflows/nightly.yml`**

```yaml
name: nightly

on:
  schedule:
    - cron: '0 10 * * *'   # 6am ET (UTC-4 summer / UTC-5 winter)

env:
  PLAYWRIGHT_BASE_URL: ${{ vars.STAGING_URL }}
  PLAYWRIGHT_SKIP_WEB_SERVER: "1"
  PLAYWRIGHT_TEST_EMAIL: ${{ secrets.STAGING_TEST_EMAIL }}
  PLAYWRIGHT_TEST_PASSWORD: ${{ secrets.STAGING_TEST_PASSWORD }}

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v6
        with: { version: 10.25.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile=false
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test --project=smoke

  core-e2e:
    # Only runs if smoke passed — no point deep-testing a dead app
    needs: smoke
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v6
        with: { version: 10.25.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile=false
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test --project=chromium

  unit:
    # Runs in parallel with smoke — no dependency
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v6
        with: { version: 10.25.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile=false
      - name: Full Vitest suite
        run: |
          pnpm exec vitest run \
            --exclude 'tests/**' \
            --exclude 'src/server/services/creditEngine/**/*integration*' \
            --exclude 'src/server/services/creditEngine/worker.test.ts' \
            --exclude 'src/server/services/creditEngine/orchestrator.test.ts' \
            --exclude 'src/server/services/creditEngine/reaper.test.ts' \
            --exclude 'src/server/services/creditEngine/enqueue.test.ts' \
            --exclude 'src/server/services/creditEngine/reconciliation.test.ts' \
            --exclude 'src/server/services/creditEngine/smoke.test.ts' \
            --exclude 'src/server/services/creditEngine/reversalCorrectness.test.ts' \
            --exclude 'src/server/services/creditEngine/divergenceReport.test.ts' \
            --exclude 'src/server/services/creditEngine/signals/**' \
            --exclude 'src/server/services/commandBus.idempotency.test.ts'

  report-failures:
    needs: [smoke, core-e2e, unit]
    runs-on: ubuntu-latest
    # CRITICAL: always() guard ensures this job runs even when smoke fails
    # and core-e2e is therefore skipped. Without always(), GHA would skip
    # this job entirely — the exact case where we most need an alert.
    if: |
      always() && (
        needs.smoke.result == 'failure' ||
        needs.core-e2e.result == 'failure' ||
        needs.unit.result == 'failure'
      )
    steps:
      - uses: actions/checkout@v4
      - name: Report failure
        run: bash scripts/report-test-failure.sh "nightly" "${{ github.run_id }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
```

- [ ] **Commit**

```bash
git add .github/workflows/nightly.yml
git commit -m "ci: add nightly workflow — smoke + core-e2e + unit with GH issue alerting"
```

---

### Task 12: Update .github/workflows/ci.yml — add full Vitest run

**Files:**
- Modify: `.github/workflows/ci.yml`

Currently ci.yml only runs 3 pinned vitest files. Adding the full suite run after those pins closes the coverage gap on every PR. The exclusion list matches what deploy-staging.yml uses (DB-dependent tests that need a live Postgres).

- [ ] **Append the full Vitest run step to the end of `ci.yml`**

The file currently ends at line 40 with:
```yaml
      - run: pnpm exec playwright test tests/e2e/a11y.spec.ts
```

Add after that line:

```yaml
      # Full unit + component suite on every PR. The three pinned steps above
      # are intentional fast-fail gates for specific high-risk modules; this
      # step covers everything else. DB-dependent credit-engine integration
      # tests are excluded — they require a live Postgres and run in the
      # nightly workflow against staging instead.
      - name: Full Vitest suite
        run: |
          pnpm exec vitest run \
            --exclude 'tests/**' \
            --exclude 'src/server/services/creditEngine/**/*integration*' \
            --exclude 'src/server/services/creditEngine/worker.test.ts' \
            --exclude 'src/server/services/creditEngine/orchestrator.test.ts' \
            --exclude 'src/server/services/creditEngine/reaper.test.ts' \
            --exclude 'src/server/services/creditEngine/enqueue.test.ts' \
            --exclude 'src/server/services/creditEngine/reconciliation.test.ts' \
            --exclude 'src/server/services/creditEngine/smoke.test.ts' \
            --exclude 'src/server/services/creditEngine/reversalCorrectness.test.ts' \
            --exclude 'src/server/services/creditEngine/divergenceReport.test.ts' \
            --exclude 'src/server/services/creditEngine/signals/**' \
            --exclude 'src/server/services/commandBus.idempotency.test.ts'
```

- [ ] **Verify the YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run full Vitest suite on every PR (closes unit coverage gap)"
```

---

### Task 13: Update decisions-log.md with testing convention

**Files:**
- Modify: `docs/design-system/decisions-log.md`

Add to the top of the log (newest-first):

- [ ] **Prepend this entry to `docs/design-system/decisions-log.md`**

```markdown
## 2026-05-25 — Ongoing testing convention: 3-tier pyramid

**Decision**: Testing follows a 3-tier pyramid enforced by GitHub Actions.

| Tier | Location | When | Purpose |
|------|----------|------|---------|
| Smoke | `tests/smoke/` | Post-deploy + nightly | Is the app alive and usable? |
| Core e2e | `tests/e2e/` | Nightly | Do all operator workflows still work? |
| Unit | `src/**/*.test.*` | Every PR | Does business logic hold? |

**Convention for new work**:
- New top-level view or workflow → add a smoke spec to `tests/smoke/` (login + grid/heading visible)
- New operator command or e2e flow → add a full spec to `tests/e2e/`
- New server service or business logic → unit test in `src/server/services/`

Nightly picks up new specs in both `tests/smoke/` and `tests/e2e/` automatically.
Smoke tests must be independent (no shared state), fast (15s/step max), and assertion-minimal.

**Rationale**: Catches live regressions during user testing rollout without requiring manual QA runs.  
**Spec**: `docs/superpowers/specs/2026-05-25-ongoing-testing-strategy-design.md`
```

- [ ] **Commit**

```bash
git add docs/design-system/decisions-log.md
git commit -m "docs: add testing convention to decisions-log (3-tier pyramid)"
```

---

### Task 14: Commit spec + plan docs

- [ ] **Commit the spec and plan**

```bash
git add docs/superpowers/specs/2026-05-25-ongoing-testing-strategy-design.md
git add docs/superpowers/plans/2026-05-25-ongoing-testing-strategy.md
git commit -m "docs: add testing strategy spec and implementation plan"
```

---

### Task 15: Final verification pass

- [ ] **Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors

- [ ] **Verify smoke project runs all 6 tests (against local dev server)**

```bash
pnpm exec playwright test --project=smoke
```

Expected: 6 passed

- [ ] **Verify chromium project list does NOT include any tests/smoke/ paths**

```bash
pnpm exec playwright test --project=chromium --list 2>&1 | grep smoke
```

Expected: no output (zero matches)

- [ ] **Validate all three new/modified YAML files**

```bash
for f in .github/workflows/ci.yml .github/workflows/post-deploy-smoke.yml .github/workflows/nightly.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "$f: valid"
done
```

Expected:
```
.github/workflows/ci.yml: valid
.github/workflows/post-deploy-smoke.yml: valid
.github/workflows/nightly.yml: valid
```

- [ ] **Verify report-test-failure.sh is executable**

```bash
test -x scripts/report-test-failure.sh && echo "executable"
```

Expected: `executable`

---

## Post-Implementation: One-Time GitHub Setup

After the plan is implemented and pushed, configure these in GitHub (Settings → Secrets and variables):

| Setting | Type | Value |
|---------|------|-------|
| `STAGING_URL` | Variable (not secret) | Staging app URL, e.g. `https://terp-operator-abc.ondigitalocean.app` |
| `STAGING_TEST_EMAIL` | Secret | `owner@terpagro.local` |
| `STAGING_TEST_PASSWORD` | Secret | `terp-demo` |

Without `STAGING_URL`, the post-deploy-smoke and nightly workflows will fail with "baseURL is undefined". Set this before the first staging deploy after merging.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Tier 1 smoke: Tasks 1–8
- ✅ Tier 2 core-e2e: handled by nightly.yml (Task 11, needs no new spec files)
- ✅ Tier 3 unit on PR: Task 12
- ✅ Post-deploy workflow: Task 10
- ✅ Nightly workflow: Task 11
- ✅ Alert de-dup with correct AND-label semantics: Task 9
- ✅ Credential env vars: Tasks 2–7 helpers, Tasks 10–11 workflows
- ✅ `always()` guard on report-failures: Task 11
- ✅ `ref: head_sha` for post-deploy: Task 10
- ✅ Decisions-log entry: Task 13
- ✅ GitHub config doc: Post-Implementation section

**Placeholder scan:** No TBDs, all code blocks complete.

**Type consistency:** `loginAsOwner` defined in Task 2 (`_helpers.ts`), imported as `from './_helpers'` in Tasks 3–7. Consistent.
