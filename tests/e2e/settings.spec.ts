import { test, expect } from '@playwright/test';

async function setupPage(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (typeof crypto !== 'undefined' && !(crypto as any).randomUUID) {
      (crypto as any).randomUUID = function randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };
    }
  });
}

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 })
    .toBe(true);
}

async function loginAsOwner(page: import('@playwright/test').Page) {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

test.describe('Settings E2E', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await setupPage(page);
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Settings' }).click();
    await page.waitForURL('**/settings', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Settings and renders the Strain aliases tab by default', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible({ timeout: 15_000 });

    // Default tab is Strain aliases
    const strainTab = page.getByRole('tab', { name: 'Strain aliases' });
    await expect(strainTab).toBeVisible({ timeout: 10_000 });
    await expect(strainTab).toHaveAttribute('aria-selected', 'true');
  });

  test('all Settings tabs are visible', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Connector requests' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: 'Strain aliases' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: 'Pricing' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: 'System' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: 'Credit Engine' })).toBeVisible({ timeout: 10_000 });
  });

  test('switch between Settings tabs', async ({ page }) => {
    // Default: Strain aliases
    await expect(page.getByRole('tab', { name: 'Strain aliases' })).toHaveAttribute('aria-selected', 'true');

    // Switch to Connector requests
    await page.getByRole('tab', { name: 'Connector requests' }).click();
    await expect(page.getByRole('tab', { name: 'Connector requests' })).toHaveAttribute('aria-selected', 'true');

    // Switch to Pricing
    await page.getByRole('tab', { name: 'Pricing' }).click();
    await expect(page.getByRole('tab', { name: 'Pricing' })).toHaveAttribute('aria-selected', 'true');

    // Switch back to Strain aliases
    await page.getByRole('tab', { name: 'Strain aliases' }).click();
    await expect(page.getByRole('tab', { name: 'Strain aliases' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Strain aliases tab renders data grid', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Strain aliases', level: 2 })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
  });

  test('Items section is visible in Strain aliases tab', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Items', level: 2 })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
  });
});
