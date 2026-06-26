import { test, expect } from '@playwright/test';

async function setupPage(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (typeof crypto !== 'undefined' && !(crypto as Record<string, unknown>).randomUUID) {
      (crypto as Record<string, unknown>).randomUUID = function randomUUID() {
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
  await page.waitForLoadState('networkidle');
}

test.describe('Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await setupPage(page);
    await loginAsOwner(page);
  });

  test('login lands on dashboard with sidebar active', async ({ page }) => {
    // The sidebar should show Dashboard as the active nav item
    const dashboardNav = page.getByRole('navigation').getByRole('button', { name: 'Dashboard' });
    await expect(dashboardNav).toBeVisible({ timeout: 10_000 });
    await expect(dashboardNav).toHaveAttribute('aria-current', 'page');
  });

  test('keel bar is visible and Quick actions menu opens', async ({ page }) => {
    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await expect(keel).toBeVisible({ timeout: 10_000 });

    await keel.getByRole('button', { name: 'Quick actions' }).click();

    await expect(keel.getByRole('menuitem', { name: 'New Sale', exact: true })).toBeVisible();
    await expect(keel.getByRole('menuitem', { name: 'New PO', exact: true })).toBeVisible();
    await expect(keel.getByRole('menuitem', { name: 'Receive against PO', exact: true })).toBeVisible();
    await expect(keel.getByRole('menuitem', { name: 'Money in', exact: true })).toBeVisible();
    await expect(keel.getByRole('menuitem', { name: 'Money out', exact: true })).toBeVisible();
  });

  test('sidebar navigation is fully rendered', async ({ page }) => {
    const nav = page.getByRole('navigation');

    // Core navigation items visible
    await expect(nav.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Reports' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Purchase Orders' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Intake' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Inventory' })).toBeVisible();
    await expect(nav.getByRole('button', { name: /Sales/ })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Matchmaking' })).toBeVisible();
    await expect(nav.getByRole('button', { name: /Payments/ })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Recovery' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Closeout' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Settings' })).toBeVisible();
  });

  test('navigating away and back to dashboard works', async ({ page }) => {
    // Navigate to Purchase Orders
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Purchase Orders' }).click();
    await page.waitForURL('**/purchaseOrders', { timeout: 20_000 });
    await expect(page.getByText('Purchase Orders').first()).toBeVisible({ timeout: 15_000 });

    // Navigate back to Dashboard
    await nav.getByRole('button', { name: 'Dashboard' }).click();
    await page.waitForURL('**/dashboard', { timeout: 20_000 });

    // Dashboard nav should be active
    const dashboardNav = nav.getByRole('button', { name: 'Dashboard' });
    await expect(dashboardNav).toHaveAttribute('aria-current', 'page');
  });

  test('search button opens command palette', async ({ page }) => {
    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await keel.getByRole('button', { name: /^Search/ }).click();
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
  });
});
