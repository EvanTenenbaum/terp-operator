import { test, expect, type Page } from '@playwright/test';

/**
 * URL Routing Validation (Issue #29)
 *
 * Tests that URL routing works correctly:
 * - Browser back/forward navigation
 * - Direct URL access
 * - Deep linking
 * - URL refresh preserves view
 */

async function login(page: Page) {
  await page.goto('/');
  await page.fill('input[type="email"]', 'owner@terpagro.local');
  await page.fill('input[type="password"]', 'terp-demo');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|sales|intake)/);
}

test.describe('URL Routing', () => {
  test('browser back and forward buttons work', async ({ page }) => {
    await login(page);

    // Should start at /dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Navigate to sales
    await page.click('[data-testid="sidenav-item-sales"]');
    await expect(page).toHaveURL(/\/sales/);

    // Navigate to intake
    await page.click('[data-testid="sidenav-item-intake"]');
    await expect(page).toHaveURL(/\/intake/);

    // Browser back should go to sales
    await page.goBack();
    await expect(page).toHaveURL(/\/sales/);

    // Browser back should go to dashboard
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);

    // Browser forward should go to sales
    await page.goForward();
    await expect(page).toHaveURL(/\/sales/);
  });

  test('direct URL navigation works', async ({ page }) => {
    await login(page);

    // Navigate directly to sales view
    await page.goto('/sales');
    await expect(page).toHaveURL(/\/sales/);

    // Verify sales view is actually rendered
    await expect(page.locator('text=Sales')).toBeVisible();

    // Navigate directly to intake
    await page.goto('/intake');
    await expect(page).toHaveURL(/\/intake/);
    await expect(page.locator('text=Intake')).toBeVisible();

    // Navigate directly to purchase orders
    await page.goto('/purchaseOrders');
    await expect(page).toHaveURL(/\/purchaseOrders/);
  });

  test('page refresh preserves current view', async ({ page }) => {
    await login(page);

    // Navigate to sales
    await page.click('[data-testid="sidenav-item-sales"]');
    await expect(page).toHaveURL(/\/sales/);

    // Refresh page
    await page.reload();

    // Should still be on sales page
    await expect(page).toHaveURL(/\/sales/);
    await expect(page.locator('text=Sales')).toBeVisible();
  });

  test('root path redirects to dashboard', async ({ page }) => {
    await login(page);

    // Navigate to root
    await page.goto('/');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('unknown routes redirect to dashboard', async ({ page }) => {
    await login(page);

    // Navigate to non-existent route
    await page.goto('/nonexistent-route');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('navigation state syncs with URL', async ({ page }) => {
    await login(page);

    // Click nav item
    await page.click('[data-testid="sidenav-item-intake"]');

    // URL should update
    await expect(page).toHaveURL(/\/intake/);

    // Nav item should show as active
    const navButton = page.locator('[data-testid="sidenav-item-intake"]');
    await expect(navButton).toHaveClass(/nav-button-active/);
  });
});
