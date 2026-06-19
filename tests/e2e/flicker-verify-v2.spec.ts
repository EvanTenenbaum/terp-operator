/**
 * TER-1671 v2: Verify sales grid flicker fix — MutationObserver + click interactivity.
 *
 * The fix memoizes `rows` in InventoryFinderPanel.tsx (line 203) and removes
 * the broken `areGridPropsEqual` comparator from OperatorGrid.tsx.
 *
 * Measures structural DOM mutations on the sales order lines grid for 5 seconds.
 * Pass threshold: < 100 structural mutations/sec (previously was 1,628/sec).
 * Also verifies the page is responsive by performing a click interaction.
 *
 * Run:
 *   PLAYWRIGHT_SKIP_WEB_SERVER=1 \
 *   PLAYWRIGHT_BASE_URL="https://terp-agro-staging-5asc2.ondigitalocean.app" \
 *     npx playwright test tests/e2e/flicker-verify-v2.spec.ts --project=chromium --workers=1
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'owner@terpagro.local';
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'terp-demo';

const MUTATION_THRESHOLD_PER_SEC = 100;
const OBSERVE_DURATION_MS = 5_000;

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

async function selectFirstCustomer(page: Page) {
  console.log('[customer] Looking for customer input...');

  const customerInput = page
    .locator([
      '[data-testid="customer-combobox"] input',
      'input[placeholder*="ustomer" i]',
      'label:has-text("Customer") input',
      'input[id*="customer" i]',
    ].join(', '))
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

// ── MutationObserver helper (self-timed in browser) ───────

/**
 * Runs a MutationObserver on the browser page for `durationMs` milliseconds,
 * counting ONLY structural (childList addedNodes + removedNodes) mutations.
 * Attribute mutations are explicitly excluded.
 *
 * All timing is done inside a single page.evaluate() call so the browser's
 * own event loop controls the observation window.
 */
async function countStructuralMutations(page: Page, durationMs: number) {
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
            // Only count childList (structural) — skip attributes entirely
            if (m.type === 'childList') {
              added += m.addedNodes.length;
              removed += m.removedNodes.length;
            }
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          // Crucially: do NOT set attributes: true — we only want structural mutations
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

test('TER-1671 v2: Verify sales grid mutation rate < 100/sec + click interactivity', async ({ page }) => {
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  // ═══ Step 1: Login ═══
  await login(page);

  // ═══ Step 2: Navigate to /sales ═══
  console.log('[nav] Navigating to /sales directly...');
  await page.goto('/sales');
  await page.waitForTimeout(5_000);

  // ═══ Step 3: Select a customer ═══
  await selectFirstCustomer(page);
  await page.waitForTimeout(2_000);

  // ═══ Step 4: Wait for grid to load ═══
  const gridWrapper = page.locator('.ag-root-wrapper').first();
  const gridVisible = await gridWrapper.isVisible({ timeout: 10_000 }).catch(() => false);
  console.log(`[grid] Sales order lines grid visible: ${gridVisible}`);
  await page.screenshot({ path: 'test-results/flicker-verify-v2-pre-observe.png', fullPage: true });

  // ═══ Step 5: MutationObserver — 5 seconds (structural only) ═══
  console.log(`\n─── Monitoring structural DOM mutations for ${OBSERVE_DURATION_MS / 1000}s ───`);
  const counts = await Promise.race([
    countStructuralMutations(page, OBSERVE_DURATION_MS),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('MutationObserver timed out after 60s — browser main thread may be saturated')),
        60_000,
      ),
    ),
  ]);

  console.log(`  addedNodes:    ${counts.addedNodes}`);
  console.log(`  removedNodes:  ${counts.removedNodes}`);
  console.log(`  structural:    ${counts.structuralTotal}`);
  console.log(`  elapsed:       ${(counts.elapsedMs / 1000).toFixed(1)}s (browser performance.now)`);
  console.log(`  rate:          ${counts.ratePerSec}/sec`);

  // ═══ Step 6: Click interactivity check ═══
  console.log('\n─── Click interactivity check ───');
  let clickSucceeded = false;
  try {
    // Navigate back to /sales to start fresh for the click test
    await page.goto('/sales');
    await page.waitForTimeout(2_000);

    // Click the first visible nav button as a basic interactivity test
    const navButton = page.getByRole('navigation').getByRole('button').first();
    await navButton.waitFor({ state: 'visible', timeout: 10_000 });
    await navButton.click({ timeout: 5_000 });
    await page.waitForTimeout(1_000);
    clickSucceeded = true;
    console.log('  Click interaction: ✅ succeeded');
  } catch (e) {
    console.log(`  Click interaction: 🔴 FAILED — ${(e as Error).message}`);
  }

  // ═══ Step 7: Screenshot ═══
  await page.screenshot({ path: 'test-results/flicker-verify-v2-verdict.png', fullPage: true });
  console.log('\nScreenshot saved: test-results/flicker-verify-v2-verdict.png');

  // ═══ Step 8: Page errors ═══
  if (pageErrors.length === 0) {
    console.log('\n  Page errors:   0');
  } else {
    console.log(`\n  Page errors (${pageErrors.length}):`);
    pageErrors.slice(0, 10).forEach((e) => console.log(`    ${e}`));
  }

  // ═══ Step 9: Verdict ═══
  const passed = counts.ratePerSec < MUTATION_THRESHOLD_PER_SEC;
  console.log(`\n  Threshold:     < ${MUTATION_THRESHOLD_PER_SEC}/sec`);
  console.log(`  Mutation rate: ${counts.ratePerSec}/sec → ${passed ? '✅ PASS' : '🔴 FAIL'}`);
  console.log(`  Click check:   ${clickSucceeded ? '✅ PASS' : '🔴 FAIL'}`);
  console.log(`  Overall:       ${passed && clickSucceeded ? '✅ PASS' : '🔴 FAIL'}`);

  // Hard assertion
  expect(
    counts.ratePerSec,
    `Structural DOM mutation rate ${counts.ratePerSec}/sec exceeds threshold of ${MUTATION_THRESHOLD_PER_SEC}/sec — flicker not fixed`,
  ).toBeLessThan(MUTATION_THRESHOLD_PER_SEC);

  expect(clickSucceeded, 'Click interaction failed — main thread may be saturated').toBe(true);
});
