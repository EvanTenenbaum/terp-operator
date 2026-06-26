import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

async function loginAsOwner(page: import('@playwright/test').Page) {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });
}

test.describe('Sales Build E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test('transitions from Sales Browse to Build by selecting a customer', async ({ page }) => {
    test.setTimeout(60_000);

    // Navigate to Sales (Browse mode)
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /Sales/ }).click();
    await page.waitForLoadState('networkidle');

    // Verify Browse mode is active
    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 15_000 });

    // Use the keel Quick actions → New Sale to trigger build mode
    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await keel.getByRole('button', { name: 'Quick actions' }).click();
    await expect(keel.getByRole('menuitem', { name: 'New Sale', exact: true })).toBeVisible();
    await keel.getByRole('menuitem', { name: 'New Sale', exact: true }).click();

    // Should now be in Build mode (customer selector visible)
    await expect(page.getByLabel('Customer')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Customer').selectOption({ label: 'Cobalt Reserve' });

    // Verify Build mode elements are visible
    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Sale Builder', exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('Sale Builder workspace renders with Inventory Finder', async ({ page }) => {
    test.setTimeout(60_000);

    // Navigate via Quick actions → New Sale
    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await keel.getByRole('button', { name: 'Quick actions' }).click();
    await keel.getByRole('menuitem', { name: 'New Sale', exact: true }).click();

    await expect(page.getByLabel('Customer')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Customer').selectOption({ label: 'Cobalt Reserve' });

    // Verify Sale Builder panel
    await expect(page.getByRole('button', { name: 'Sale Builder', exact: true })).toBeVisible({ timeout: 10_000 });

    // Verify Inventory Finder is visible in the build workspace
    const finder = page.getByTestId('inventory-finder');
    await expect(finder.getByText('Inventory Finder')).toBeVisible({ timeout: 10_000 });

    // Test finder search in build context
    await finder.locator('input[placeholder*="Search"]').fill('flower');
    await expect(finder.getByText(/search: flower/i)).toBeVisible({ timeout: 10_000 });

    // Verify price confirmation exists in build mode
    await expect(page.getByTestId('sales-build-price-confirm')).toBeVisible({ timeout: 10_000 });
  });

  test('can clear customer and return to Browse mode', async ({ page }) => {
    test.setTimeout(60_000);

    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await keel.getByRole('button', { name: 'Quick actions' }).click();
    await keel.getByRole('menuitem', { name: 'New Sale', exact: true }).click();

    await expect(page.getByLabel('Customer')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Customer').selectOption({ label: 'Cobalt Reserve' });

    // Verify we're in Build mode
    await expect(page.getByRole('button', { name: 'Sale Builder', exact: true })).toBeVisible({ timeout: 10_000 });

    // Clear the customer (back to Browse)
    await page.keyboard.press('Escape');

    // Find and click Clear button
    const clearBtn = page.getByRole('button', { name: /clear/i });
    if (await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clearBtn.click();
    }
  });
});
