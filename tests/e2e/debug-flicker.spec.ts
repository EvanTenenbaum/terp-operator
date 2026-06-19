/**
 * TER-1671: Sales grid rows flicker / detach from DOM.
 *
 * Monitors DOM mutations on Sales Orders and Customer Draft Lines AG Grids
 * to quantify re-render churn, check row-id stability, and pinpoint
 * root-cause indicators.
 *
 * Run:
 *   PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL="https://terp-agro-staging-5asc2.ondigitalocean.app" \
 *     npx playwright test tests/e2e/debug-flicker.spec.ts --project=chromium --workers=1
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'owner@terpagro.local';
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'terp-demo';

// ── Helpers ──────────────────────────────────────────────

async function login(page: Page) {
  console.log('[login] Navigating to / ...');
  await page.goto('/');
  await page.waitForTimeout(2000);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();

  await page.waitForTimeout(3000);
  const navBar = page.getByRole('navigation');
  await expect(navBar).toBeVisible({ timeout: 30_000 });
  console.log('[login] ✅ Logged in');
}

async function navigateToSales(page: Page) {
  console.log('[nav] Clicking Sales...');
  try {
    await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
  } catch {
    await page.locator('a:has-text("Sales"), button:has-text("Sales")').first().click();
  }
  await page.waitForTimeout(3000);
  const hasGrid = await page.locator('.ag-root-wrapper').first().isVisible({ timeout: 10_000 }).catch(() => false);
  console.log(`[nav] Sales page grid visible: ${hasGrid}`);
}

async function selectFirstCustomer(page: Page) {
  console.log('[customer] Looking for customer input...');
  
  // Search across multiple possible selectors
  const customerInput = page.locator([
    '[data-testid="customer-combobox"] input',
    'input[placeholder*="ustomer" i]',
    'label:has-text("Customer") input',
    'input[id*="customer" i]',
  ].join(', ')).first();

  const visible = await customerInput.isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible) {
    console.log('[customer] No customer input found — skipping selection');
    await page.screenshot({ path: 'test-results/debug-flicker-no-input.png' });
    return;
  }

  await customerInput.click();
  await page.waitForTimeout(300);
  await customerInput.fill('test');
  await page.waitForTimeout(2000);

  // Try clicking first dropdown option
  const firstOption = page.locator('[role="listbox"] [role="option"], [role="option"]').first();
  const optionVisible = await firstOption.isVisible({ timeout: 3000 }).catch(() => false);
  if (optionVisible) {
    console.log('[customer] Clicking first option');
    await firstOption.click();
  } else {
    console.log('[customer] No dropdown — pressing Enter');
    await customerInput.press('Enter');
  }
  await page.waitForTimeout(4000);
}

// ── DOM probes (small targeted evaluate calls) ───────────

/** Quick probe: count .ag-row elements, check for position-absolute class, get sample row-ids */
async function probeGridRows(page: Page, gridLabel: string) {
  return page.evaluate((label) => {
    const rows = document.querySelectorAll('.ag-row');
    const rowData: Array<{
      tag: string;
      rowId: string;
      rowIndex: string;
      positionAbsolute: boolean;
      text: string;
    }> = [];

    rows.forEach((row) => {
      const el = row as HTMLElement;
      rowData.push({
        tag: el.tagName,
        rowId: el.getAttribute('row-id') || el.getAttribute('id') || '',
        rowIndex: el.getAttribute('row-index') || el.getAttribute('aria-rowindex') || '',
        positionAbsolute: el.classList.contains('ag-row-position-absolute'),
        text: el.textContent?.trim().slice(0, 80) || '',
      });
    });

    return {
      gridLabel: label,
      totalRows: rows.length,
      positionAbsoluteCount: rowData.filter((r) => r.positionAbsolute).length,
      sampleRows: rowData.slice(0, 5),
      allRowIds: rowData.map((r) => r.rowId).filter(Boolean).slice(0, 30),
    };
  }, gridLabel);
}

/** Set up a MutationObserver that logs to `window.__flickerCounts` */
async function startObserver(page: Page) {
  await page.evaluate(() => {
    (window as any).__flickerCounts = {
      addedNodes: 0,
      removedNodes: 0,
      attributes: 0,
      startedAt: Date.now(),
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          (window as any).__flickerCounts.addedNodes += m.addedNodes.length;
          (window as any).__flickerCounts.removedNodes += m.removedNodes.length;
        } else if (m.type === 'attributes') {
          (window as any).__flickerCounts.attributes++;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      attributes: true,
      attributeFilter: ['row-id', 'row-index', 'aria-rowindex', 'style'],
      subtree: true,
    });
    (window as any).__flickerObserver = observer;
  });
}

/** Read mutation counts from the in-page observer */
async function readMutationCounts(page: Page) {
  return page.evaluate(() => {
    const counts = (window as any).__flickerCounts || { addedNodes: 0, removedNodes: 0, attributes: 0, startedAt: 0 };
    const elapsed = (Date.now() - counts.startedAt) / 1000;
    return {
      addedNodes: counts.addedNodes,
      removedNodes: counts.removedNodes,
      attributes: counts.attributes,
      elapsedSec: Math.round(elapsed * 10) / 10,
    };
  });
}

/** Reset the in-page counter */
async function resetMutationCounts(page: Page) {
  await page.evaluate(() => {
    (window as any).__flickerCounts = {
      addedNodes: 0,
      removedNodes: 0,
      attributes: 0,
      startedAt: Date.now(),
    };
  });
}

// ── The test ─────────────────────────────────────────────

test('TER-1671: Monitor sales grid DOM mutation churn', async ({ page }) => {
  test.setTimeout(180_000);

  // Collect page errors
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  // ═══ Step 1: Login ═══
  await login(page);

  // ═══ Step 2: Navigate to /sales ═══
  await navigateToSales(page);

  // ═══ Step 3: Probe grid state BEFORE customer selection ═══
  console.log('\n─── PRE-CUSTOMER Grid State ───');
  const preProbe = await probeGridRows(page, 'pre-customer');
  console.log(`  Rows: ${preProbe.totalRows}, PositionAbsolute: ${preProbe.positionAbsoluteCount}`);
  console.log(`  Sample IDs: ${preProbe.allRowIds.slice(0, 5).join(', ') || '(none)'}`);

  // ═══ Step 4: Select a customer ═══
  await selectFirstCustomer(page);
  await page.waitForTimeout(2000);

  // ═══ Step 5: Probe grid state AFTER customer selection ═══
  console.log('\n─── POST-CUSTOMER Grid State ───');
  const postProbe = await probeGridRows(page, 'post-customer');
  console.log(`  Rows: ${postProbe.totalRows}, PositionAbsolute: ${postProbe.positionAbsoluteCount}`);
  console.log(`  Sample IDs: ${postProbe.allRowIds.slice(0, 5).join(', ') || '(none)'}`);
  console.log(`  Sample row texts:`);
  postProbe.sampleRows.forEach((r) => {
    console.log(`    [${r.rowId}] idx=${r.rowIndex} abs=${r.positionAbsolute} text="${r.text}"`);
  });

  // ═══ Step 6: Start MutationObserver and monitor for 5 seconds ═══
  console.log('\n─── Monitoring mutations for 5 seconds (idle) ───');
  await startObserver(page);
  await page.waitForTimeout(5000);
  const idleCounts = await readMutationCounts(page);
  console.log(`  Idle: +${idleCounts.addedNodes} added, -${idleCounts.removedNodes} removed, ${idleCounts.attributes} attrs, over ${idleCounts.elapsedSec}s`);

  // ═══ Step 7: Hover over the grid and monitor ═══
  console.log('\n─── Monitoring mutations while hovering (5s) ───');
  await resetMutationCounts(page);

  // Find a grid area to hover over
  const gridBox = await page.locator('.ag-root-wrapper').first().boundingBox().catch(() => null);
  if (gridBox) {
    // Move mouse slowly across the grid area
    await page.mouse.move(gridBox.x + gridBox.width / 2, gridBox.y + gridBox.height / 2);
    await page.waitForTimeout(300);
    for (let i = 0; i < 15; i++) {
      await page.mouse.move(
        gridBox.x + 50 + Math.random() * (gridBox.width - 100),
        gridBox.y + 30 + Math.random() * (gridBox.height - 60),
        { steps: 2 }
      );
      await page.waitForTimeout(200);
    }
  } else {
    console.log('  (no grid bounding box found for hover)');
  }

  const hoverCounts = await readMutationCounts(page);
  console.log(`  Hover: +${hoverCounts.addedNodes} added, -${hoverCounts.removedNodes} removed, ${hoverCounts.attributes} attrs, over ${hoverCounts.elapsedSec}s`);

  // ═══ Step 8: Three rapid snapshots to check row-id stability ═══
  console.log('\n─── Row-ID stability snapshots (3 samples, 500ms apart) ───');
  const snapshots: string[][] = [];
  for (let i = 0; i < 3; i++) {
    const probe = await probeGridRows(page, `snapshot-${i}`);
    snapshots.push(probe.allRowIds);
    console.log(`  Snap ${i}: ${probe.allRowIds.length} ids`);
    await page.waitForTimeout(500);
  }

  // Check if row-ids are stable across snapshots
  const [s0, s1, s2] = snapshots;
  const stable01 = JSON.stringify(s0) === JSON.stringify(s1);
  const stable12 = JSON.stringify(s1) === JSON.stringify(s2);
  console.log(`  Stable (0→1): ${stable01}, Stable (1→2): ${stable12}`);

  // ═══ Step 9: Check for ag-row-position-absolute class ═══
  console.log('\n─── ag-row-position-absolute check ───');
  const absCheck = await page.evaluate(() => {
    const all = document.querySelectorAll('.ag-row-position-absolute');
    const allRows = document.querySelectorAll('.ag-row');
    return {
      positionAbsoluteCount: all.length,
      totalAgRows: allRows.length,
      hasPositionAbsolute: all.length > 0,
    };
  });
  console.log(`  ag-row-position-absolute rows: ${absCheck.positionAbsoluteCount} / ${absCheck.totalAgRows} total .ag-row`);

  // ═══ Step 10: Check page errors ═══
  if (pageErrors.length > 0) {
    console.log(`\n─── Page Errors (${pageErrors.length}) ───`);
    pageErrors.slice(0, 20).forEach((e) => console.log(`  ${e}`));
  } else {
    console.log('\n─── No page errors detected ───');
  }

  // ═══ Step 11: Screenshot ═══
  await page.screenshot({
    path: 'test-results/debug-flicker-grid-state.png',
    fullPage: true,
  });
  console.log('\nScreenshot saved: test-results/debug-flicker-grid-state.png');

  // ═══ Step 12: Root cause indicators ═══
  console.log('\n═══════════════════════════════════════');
  console.log('  ROOT CAUSE INDICATORS');
  console.log('═══════════════════════════════════════');

  const mutationRate = idleCounts.addedNodes + idleCounts.removedNodes;
  const mutationRatePerSec = idleCounts.elapsedSec > 0 ? mutationRate / idleCounts.elapsedSec : 0;

  console.log(`\n  1. Mutation churn (idle): ${mutationRate} structural mutations over ${idleCounts.elapsedSec}s (${mutationRatePerSec.toFixed(1)}/sec)`);
  console.log(`     → ${mutationRatePerSec > 5 ? '🔴 HIGH — constant DOM rewriting' : mutationRatePerSec > 1 ? '🟡 MODERATE' : '🟢 LOW'}`);

  console.log(`\n  2. Hover mutation churn: ${hoverCounts.addedNodes + hoverCounts.removedNodes} structural mutations`);
  console.log(`     → ${hoverCounts.addedNodes + hoverCounts.removedNodes > 10 ? '🔴 Hover triggers significant DOM churn' : '🟢 Hover does not trigger significant churn'}`);

  console.log(`\n  3. Row-ID stability: ${stable01 && stable12 ? '🟢 Stable across 3 snapshots' : '🔴 Row-IDs changing between snapshots!'}`);
  console.log(`     Snap-0: ${s0.length} ids  Snap-1: ${s1.length} ids  Snap-2: ${s2.length} ids`);

  console.log(`\n  4. ag-row-position-absolute: ${absCheck.positionAbsoluteCount} rows (${absCheck.hasPositionAbsolute ? '🔴 PRESENT — this is the flicker mechanism' : '🟢 ABSENT'})`);

  console.log(`\n  5. Page errors: ${pageErrors.length} (${pageErrors.length > 0 ? '🔴 Errors present — may cause re-render loops' : '🟢 None'})`);

  console.log('\n═══════════════════════════════════════');
});
