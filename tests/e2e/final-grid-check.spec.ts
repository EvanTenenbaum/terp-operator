import { test } from '@playwright/test';

const routes = [
  { name: 'Inventory', testId: 'sidenav-item-inventory', waitSelector: '.ag-theme-quartz' },
  { name: 'Purchase Orders', testId: 'sidenav-item-purchaseOrders', waitSelector: '.ag-theme-quartz' },
  { name: 'Client Ledger', testId: 'sidenav-item-clients', waitSelector: '.ag-theme-quartz' },
  { name: 'Sales', testId: 'sidenav-item-sales', waitSelector: '.ag-theme-quartz' },
];

async function measureGrid(page: any, label: string) {
  return page.evaluate((label: string) => {
    const centerViewport = document.querySelector('.ag-center-cols-viewport') as HTMLElement;
    const shell = document.querySelector('.grid-shell') as HTMLElement;
    const wrapper = document.querySelector('.ag-root-wrapper') as HTMLElement;

    const viewportHeight = centerViewport?.getBoundingClientRect().height ?? 0;
    const shellHeight = shell?.getBoundingClientRect().height ?? 0;
    const wrapperHeight = wrapper?.getBoundingClientRect().height ?? 0;
    const wrapperCss = wrapper ? window.getComputedStyle(wrapper).height : 'none';

    const rows = document.querySelectorAll('.ag-center-cols-container .ag-row');
    const visibleRows = Array.from(rows).filter((r) => {
      const rect = r.getBoundingClientRect();
      return rect.height > 0 && rect.width > 0;
    }).length;

    return { label, viewportHeight, shellHeight, wrapperHeight, wrapperCss, visibleRows };
  }, label);
}

test('final grid height verification on staging', async ({ page }) => {
  test.setTimeout(90_000);

  // Login
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForLoadState('networkidle');

  const results: Array<{
    label: string;
    viewportHeight: number;
    shellHeight: number;
    wrapperHeight: number;
    wrapperCss: string;
    visibleRows: number;
  }> = [];

  for (const route of routes) {
    // Navigate
    await page.getByTestId(route.testId).click();
    await page.waitForLoadState('networkidle');

    // Wait for AG Grid
    try {
      await page.waitForSelector(route.waitSelector, { timeout: 15_000 });
    } catch {
      console.log(`WARNING: ${route.name} — grid selector not found`);
    }
    await page.waitForTimeout(1500);

    // Measure primary grid
    results.push(await measureGrid(page, route.name));

    // On Sales page, check if there's a second grid (order lines)
    if (route.name === 'Sales') {
      const secondShell = await page.locator('.grid-shell').count();
      if (secondShell > 1) {
        // Focus the second grid-shell to measure it (there may be a focused/workspace panel)
        const secondGrid = page.locator('.grid-shell').nth(1);
        const hasRows = await secondGrid.locator('.ag-center-cols-container .ag-row').count();
        if (hasRows > 0) {
          const r2 = await page.evaluate(() => {
            const shells = document.querySelectorAll('.grid-shell');
            const shell2 = shells[1] as HTMLElement;
            const cv = shell2.querySelector('.ag-center-cols-viewport') as HTMLElement;
            const wr = shell2.querySelector('.ag-root-wrapper') as HTMLElement;
            return {
              viewportHeight: cv?.getBoundingClientRect().height ?? 0,
              shellHeight: shell2.getBoundingClientRect().height ?? 0,
              wrapperHeight: wr?.getBoundingClientRect().height ?? 0,
              wrapperCss: wr ? window.getComputedStyle(wr).height : 'none',
              visibleRows: shell2.querySelectorAll('.ag-center-cols-container .ag-row').length,
            };
          });
          results.push({ label: 'Sales (lines grid)', ...r2 });
        }
      }
    }
  }

  // Report
  console.log('');
  console.log('===========================================================');
  console.log('  FINAL GRID HEIGHT VERIFICATION — STAGING');
  console.log('  CSS fix: .grid-shell .ag-root-wrapper { height:100%!important }');
  console.log('  Measured: .ag-center-cols-viewport (AG Grid v32 viewport)');
  console.log('===========================================================');
  console.log('');

  let allPass = true;
  for (const r of results) {
    const pass = r.viewportHeight > 100;
    if (!pass) allPass = false;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${r.label.padEnd(24)} viewport=${r.viewportHeight}px  shell=${r.shellHeight}px  wrapper=${r.wrapperHeight}px (css:${r.wrapperCss})  rows=${r.visibleRows}`);
  }

  console.log('');
  console.log(`OVERALL: ${allPass ? 'ALL PASS' : 'SOME FAILURES'}`);
  console.log('===========================================================');

  if (!allPass) {
    throw new Error('One or more grids have viewport height <= 100px');
  }
});
