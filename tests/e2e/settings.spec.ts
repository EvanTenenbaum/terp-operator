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

test.describe('Settings E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Settings' }).click();
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Settings and renders the Requests tab', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Inbound Requests').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
  });

  test('switch between Settings tabs', async ({ page }) => {
    // Default: Requests tab
    await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible({ timeout: 15_000 });

    // Switch to Action log tab
    await page.getByRole('tab', { name: 'Action log' }).click();
    await expect(page.getByRole('button', { name: /Action Log \d+ row/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Command Name')).toHaveCount(0); // Column header not shown
    await expect(page.getByText('createSalesOrder')).toHaveCount(0); // Raw command names hidden

    // Switch to Archive tab
    await page.getByRole('tab', { name: 'Archive' }).click();
    await expect(page.getByText('Archive Runs').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Adjustment/ })).toBeVisible({ timeout: 10_000 });

    // Switch back to Requests tab
    await page.getByRole('tab', { name: 'Requests' }).click();
    await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible({ timeout: 10_000 });
  });

  test('Requests tab shows inbound request data', async ({ page }) => {
    await expect(page.getByText('Inbound Requests').first()).toBeVisible({ timeout: 15_000 });

    // Verify VIP customer and Live order sections
    await expect(page.getByText('VIP customer').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Live order').first()).toBeVisible({ timeout: 10_000 });

    // Verify action buttons
    await expect(page.getByRole('button', { name: 'Approve' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Admin tools button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Admin tools' })).toBeVisible({ timeout: 10_000 });
  });

  test('Action log loads and renders grid data', async ({ page }) => {
    await page.getByRole('tab', { name: 'Action log' }).click();
    await expect(page.getByRole('button', { name: /Action Log \d+ row/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
  });
});
