/**
 * TER-1671: Verify sales grid flicker/row detachment fix.
 *
 * Monitors structural DOM mutations (addedNodes + removedNodes) on the sales
 * order lines grid for 3 seconds. Pass threshold: < 100 mutations/sec.
 *
 * Run:
 *   PLAYWRIGHT_SKIP_WEB_SERVER=1 \
 *   PLAYWRIGHT_BASE_URL="https://terp-agro-staging-5asc2.ondigitalocean.app" \
 *     npx playwright test tests/e2e/debug-flicker-fix.spec.ts --project=chromium --workers=1
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'owner@terpagro.local';
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'terp-demo';

const MUTATION_THRESHOLD_PER_SEC = 100;
const OBSERVE_DURATION_MS = 3_000;

// ── Login / navigation helpers ─────────────────────────────

async function login(page: Page) {
  console.log('[login] Navigating to / ...');
  await page.goto('/');
  await page.waitForTimeout(2_000);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();

  await page.waitForTimeout(3_000);
  const navBar = page.getByRole('navigation');
  await expect(navBar).toBeVisible({ timeout: 30_000 });
  console.log('[login] Logged in');
}

async function navigateToSales(page: Page) {
  console.log('[nav] Navigating to /sales ...');
  try {
    await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
  } catch {
    await page.locator('a:has-text("Sales"), button:has-text("Sales")').first().click();
  }
  await page.waitForTimeout(3_000);
  const hasGrid = await page
    .locator('.ag-root-wrapper')
    .first()
    .isVisible({ timeout: 10_000 })
    .catch(() => false);
  console.log(`[nav] Sales page grid visible: ${hasGrid}`);
}

async function selectFirstCustomer(page: Page) {
  console.log('[customer] Looking for customer input...');

  const customerInput = page
    .locator(
      [
        '[data-testid="customer-combobox"] input',
        'input[placeholder*="ustomer" i]',
        'label:has-text("Customer") input',
        'input[id*="customer" i]',
      ].join(', '),
    )
    .first();

  const visible = await customerInput.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!visible) {
    console.log('[customer] No customer input found — skipping selection');
    return;
  }

  try {
    await customerInput.click({ timeout: 5_000 });
    await page.waitForTimeout(500);
    await customerInput.fill('test', { timeout: 10_000 });
    await page.waitForTimeout(3_000);

    // Try clicking first dropdown option
    const firstOption = page.locator('[role="listbox"] [role="option"], [role="option"]').first();
    const optionVisible = await firstOption.isVisible({ timeout: 5_000 }).catch(() => false);
    if (optionVisible) {
      console.log('[customer] Clicking first option');
      await firstOption.click({ timeout: 5_000 });
    } else {
      console.log('[customer] No dropdown — pressing Enter');
      await customerInput.press('Enter', { timeout: 5_000 });
    }
    await page.waitForTimeout(4_000);
  } catch (e) {
    console.log(`[customer] Selection error (non-fatal): ${(e as Error).message}`);
  }
}

// ── MutationObserver helper — single evaluate, self-timed ──

/**
 * Runs a MutationObserver on the browser page for `durationMs` milliseconds,
 * counting structural (childList addedNodes + removedNodes) mutations.
 *
 * All timing is done inside a single page.evaluate() call so the browser's
 * own event loop controls the observation window, avoiding skew from slow
 * CDP evaluate responses when the main thread is saturated.
 */
async function countMutations(page: Page, durationMs: number) {
  // Use waitForTimeout on the Node side to give the browser a realistic
  // opportunity to settle before starting the observation.
  await page.waitForTimeout(1_000);

  const result = await page.evaluate(
    (ms) => {
      return new Promise<{
        addedNodes: number;
        removedNodes: number;
        structuralTotal: number;
        elapsedMs: number;
        ratePerSec: number;
      }>((resolve) => {
        let added = 0;
        let removed = 0;
        const t0 = performance.now();

        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList') {
              added += m.addedNodes.length;
              removed += m.removedNodes.length;
            }
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        setTimeout(() => {
          observer.disconnect();
          const t1 = performance.now();
          const elapsedMs = t1 - t0;
          const elapsedSec = elapsedMs / 1000;
          const structuralTotal = added + removed;
          resolve({
            addedNodes: added,
            removedNodes: removed,
            structuralTotal,
            elapsedMs: Math.round(elapsedMs),
            ratePerSec:
              elapsedSec > 0
                ? Math.round((structuralTotal / elapsedSec) * 10) / 10
                : 0,
          });
        }, ms);
      });
    },
    durationMs,
  );

  return result;
}

// ── The test ─────────────────────────────────────────────

test('TER-1671: Verify sales grid mutation rate < 100/sec (flicker fix)', async ({ page }) => {
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  // Step 1: Login
  await login(page);

  // Step 2: Navigate to /sales directly (more reliable than clicking nav)
  console.log('[nav] Navigating to /sales directly...');
  await page.goto('/sales');
  await page.waitForTimeout(5_000);

  // Step 3: Select a customer (non-fatal if it fails)
  await selectFirstCustomer(page);
  await page.waitForTimeout(2_000);

  // Step 4: Wait for the sales order lines grid to load
  const gridWrapper = page.locator('.ag-root-wrapper').first();
  const gridVisible = await gridWrapper.isVisible({ timeout: 10_000 }).catch(() => false);
  console.log(`[grid] Sales order lines grid visible: ${gridVisible}`);
  await page.screenshot({ path: 'test-results/debug-flicker-fix-pre-observe.png', fullPage: true });

  // Step 5: Run MutationObserver for exactly 3 seconds (self-timed in browser)
  const observeDurationMs = OBSERVE_DURATION_MS;
  console.log(`\n─── Monitoring structural DOM mutations for ${observeDurationMs / 1000}s (browser-self-timed) ───`);
  const counts = await Promise.race([
    countMutations(page, observeDurationMs),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('MutationObserver timed out after 60s — browser main thread may be saturated')), 60_000)
    ),
  ]);

  console.log(`  addedNodes:    ${counts.addedNodes}`);
  console.log(`  removedNodes:  ${counts.removedNodes}`);
  console.log(`  structural:    ${counts.structuralTotal}`);
  console.log(`  elapsed:       ${(counts.elapsedMs / 1000).toFixed(1)}s (browser performance.now)`);
  console.log(`  rate:          ${counts.ratePerSec}/sec`);

  // Step 6: Screenshot (take before assertion so it always saves)
  await page.screenshot({
    path: 'test-results/debug-flicker-fix-verdict.png',
    fullPage: true,
  });
  console.log('\nScreenshot saved: test-results/debug-flicker-fix-verdict.png');

  // Step 7: Page errors
  if (pageErrors.length === 0) {
    console.log(`\n  Page errors:   0`);
  } else {
    console.log(`\n  Page errors (${pageErrors.length}):`);
    pageErrors.slice(0, 10).forEach((e) => console.log(`    ${e}`));
  }

  // Step 8: Pass/fail verdict
  const passed = counts.ratePerSec < MUTATION_THRESHOLD_PER_SEC;
  console.log(`\n  Threshold:     < ${MUTATION_THRESHOLD_PER_SEC}/sec`);
  console.log(`  Verdict:       ${passed ? '✅ PASS' : '🔴 FAIL'}`);

  // Hard assertion to fail the test if the mutation rate is too high
  expect(
    counts.ratePerSec,
    `Structural DOM mutation rate ${counts.ratePerSec}/sec exceeds threshold of ${MUTATION_THRESHOLD_PER_SEC}/sec — flicker not fixed`,
  ).toBeLessThan(MUTATION_THRESHOLD_PER_SEC);
});
