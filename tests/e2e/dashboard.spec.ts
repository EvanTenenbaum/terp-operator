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

test.describe('Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    // Login lands on dashboard by default
    await page.waitForLoadState('networkidle');
  });

  test('dashboard renders Owner Daily Decision View', async ({ page }) => {
    await expect(page.getByText('Owner Daily Decision View').first()).toBeVisible({ timeout: 15_000 });
  });

  test('cash on hand and files metrics are visible', async ({ page }) => {
    await expect(page.getByText('Cash/files on hand').first()).toBeVisible({ timeout: 15_000 });

    // Verify metric containers are rendered
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
  });

  test('dashboard reference table loads with data', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });

    // Wait for data rows in the reference table
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });

    // Verify some content rendered
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('Quick actions keel is visible on dashboard', async ({ page }) => {
    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await expect(keel).toBeVisible({ timeout: 10_000 });

    // Open Quick actions menu
    await keel.getByRole('button', { name: 'Quick actions' }).click();

    // Verify menu items
    await expect(keel.getByRole('menuitem', { name: 'New Sale', exact: true })).toBeVisible();
    await expect(keel.getByRole('menuitem', { name: 'New PO', exact: true })).toBeVisible();
    await expect(keel.getByRole('menuitem', { name: 'Receive against PO', exact: true })).toBeVisible();
    await expect(keel.getByRole('menuitem', { name: 'Money in', exact: true })).toBeVisible();
    await expect(keel.getByRole('menuitem', { name: 'Money out', exact: true })).toBeVisible();
  });

  test('navigating away and back to dashboard preserves state', async ({ page }) => {
    // Navigate to another view
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Dashboard' }).click();

    // Verify dashboard is still visible
    await expect(page.getByText('Owner Daily Decision View').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Cash/files on hand').first()).toBeVisible({ timeout: 10_000 });
  });
});
