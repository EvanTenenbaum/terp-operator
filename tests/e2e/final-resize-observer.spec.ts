import { test } from '@playwright/test';

const routes = [
  { name: 'Inventory', testId: 'sidenav-item-inventory' },
  { name: 'Purchase Orders', testId: 'sidenav-item-purchaseOrders' },
  { name: 'Sales', testId: 'sidenav-item-sales' },
];

async function measureGrid(page: any, label: string) {
  return page.evaluate((label: string) => {
    const cv = document.querySelector('.ag-center-cols-viewport') as HTMLElement;
    const height = cv?.getBoundingClientRect().height ?? 0;
    const rows = document.querySelectorAll('.ag-center-cols-container .ag-row');
    const visibleRows = Array.from(rows).filter((r) => {
      const rect = r.getBoundingClientRect();
      return rect.height > 0 && rect.width > 0;
    }).length;
    return { label, height, visibleRows };
  }, label);
}

test('verify grids render after ResizeObserver fix', async ({ page }) => {
  test.setTimeout(90_000);

  // Login
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForLoadState('networkidle');

  const results: Array<{ label: string; height: number; visibleRows: number }> = [];

  for (const route of routes) {
    await page.getByTestId(route.testId).click();
    await page.waitForLoadState('networkidle');

    try {
      await page.waitForSelector('.ag-theme-quartz', { timeout: 15_000 });
    } catch {
      console.log(`WARNING: ${route.name} — grid selector not found`);
    }
    await page.waitForTimeout(1500);

    results.push(await measureGrid(page, route.name));
  }

  console.log('');
  console.log('===========================================================');
  console.log('  RESIZE OBSERVER FIX — GRID HEIGHT VERIFICATION');
  console.log('  Threshold: .ag-center-cols-viewport height > 100px');
  console.log('===========================================================');
  console.log('');

  let allPass = true;
  for (const r of results) {
    const pass = r.height > 100;
    if (!pass) allPass = false;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${r.label.padEnd(24)} viewportHeight=${r.height}px  visibleRows=${r.visibleRows}`);
  }

  console.log('');
  console.log(`OVERALL: ${allPass ? 'ALL PASS' : 'SOME FAILURES'}`);
  console.log('===========================================================');

  if (!allPass) {
    throw new Error('One or more grids have viewport height <= 100px');
  }
});
