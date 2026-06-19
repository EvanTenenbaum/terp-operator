import { test } from '@playwright/test';

const SCREENSHOT_PATH = 'tests/e2e/screenshots/inventory-height-fix.png';

test('verify TER-1665: inventory grid height fix', async ({ page }) => {
  test.setTimeout(60_000);

  // 1. Log in to staging
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForLoadState('networkidle');

  // 2. Navigate to /inventory
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: /Inventory/ }).click();
  await page.waitForLoadState('networkidle');

  // Wait for AG Grid to mount
  await page.waitForSelector('.ag-theme-quartz', { timeout: 15_000 });
  await page.waitForTimeout(2000); // let grid finish rendering

  // 3. Check grid visibility and .ag-body-viewport height
  const result = await page.evaluate(() => {
    const bodyViewport = document.querySelector('.ag-body-viewport') as HTMLElement;
    const gridShell = document.querySelector('.grid-shell') as HTMLElement;
    const wpFocused = document.querySelector('.workspace-panel-focused') as HTMLElement;

    const bodyViewportHeight = bodyViewport ? window.getComputedStyle(bodyViewport).height : 'not found';
    const bodyViewportDisplay = bodyViewport ? window.getComputedStyle(bodyViewport).display : 'not found';
    const gridShellHeight = gridShell ? window.getComputedStyle(gridShell).height : 'not found';
    const wpFocusedMinHeight = wpFocused ? window.getComputedStyle(wpFocused).minHeight : 'not found';

    const bodyViewportRect = bodyViewport?.getBoundingClientRect();
    const heightPx = bodyViewportRect ? bodyViewportRect.height : 0;

    return {
      bodyViewportHeight,
      bodyViewportDisplay,
      gridShellHeight,
      wpFocusedMinHeight,
      heightPx,
      gridVisible: bodyViewportRect !== null && bodyViewportRect.height > 0,
    };
  });

  console.log('========== TER-1665 INVENTORY GRID HEIGHT VERIFICATION ==========');
  console.log(`.ag-body-viewport:`);
  console.log(`  display: ${result.bodyViewportDisplay}`);
  console.log(`  computed height: ${result.bodyViewportHeight}`);
  console.log(`  pixel height: ${result.heightPx}px`);
  console.log(`  visible: ${result.gridVisible}`);
  console.log('');
  console.log(`.grid-shell computed height: ${result.gridShellHeight}`);
  console.log(`.workspace-panel-focused min-height: ${result.wpFocusedMinHeight}`);

  // 4. Take screenshot
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });

  // 5. Pass/fail
  const pass = result.gridVisible && result.heightPx > 100;
  console.log('');
  console.log(`VERDICT: ${pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Criterion: .ag-body-viewport pixel height > 100px`);
  console.log(`  Actual: ${result.heightPx}px`);
  console.log(`  Screenshot: ${SCREENSHOT_PATH}`);
  console.log('============================================================');

  if (!pass) {
    throw new Error(`FAIL: .ag-body-viewport height is ${result.heightPx}px (must be > 100px)`);
  }
});
