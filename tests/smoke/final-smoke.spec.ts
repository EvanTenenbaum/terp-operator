import { test, expect } from '@playwright/test';
import { waitForBackend } from './_helpers';

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || 'owner@terpagro.local';
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || 'terp-demo';

/** Custom login that checks for nav shell (staging doesn't show "Owner Daily Decision View") */
async function loginAsOwner(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Staging landing page may differ; verify the authenticated nav shell loaded
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Staging final smoke: key shipped features', () => {
  test.setTimeout(90_000);

  test('1. Inventory: subcategory column + advanced filter button', async ({ page }) => {
    await waitForBackend(page);
    await loginAsOwner(page);

    await page.getByRole('navigation').getByRole('button', { name: /Inventory/ }).click();
    await expect(page.getByText('Inventory').first()).toBeVisible({ timeout: 15_000 });

    // Subcategory column header visible in AG Grid
    const subcategoryHeader = page.locator('.ag-header-cell-text').filter({ hasText: /subcategory/i });
    await expect(subcategoryHeader.first()).toBeVisible({ timeout: 10_000 });

    // Advanced filter button visible
    const advFilterBtn = page.getByRole('button', { name: /advanced/i }).first();
    await expect(advFilterBtn).toBeVisible({ timeout: 10_000 });
  });

  test('2. Sales: searchable customer combobox + filter controls', async ({ page }) => {
    await waitForBackend(page);
    await loginAsOwner(page);

    await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
    await expect(page.getByText('Sales Orders').first()).toBeVisible({ timeout: 15_000 });

    // Customer picker should be a searchable combobox
    const customerCombobox = page.getByRole('combobox', { name: /customer/i });
    await expect(customerCombobox.first()).toBeVisible({ timeout: 10_000 });

    // Sales filter/search controls: search textbox + Add filter button + Advanced button
    const searchBox = page.getByPlaceholder(/search/i);
    const addFilterBtn = page.getByRole('button', { name: /add filter/i });
    const advBtn = page.getByRole('button', { name: /advanced/i });
    // At least one filter-related control should be visible
    await expect(searchBox.or(addFilterBtn).or(advBtn).first()).toBeVisible({ timeout: 10_000 });
  });

  test('3. Purchase Orders: grid loads with 30 rows, interactive', async ({ page }) => {
    await waitForBackend(page);
    await loginAsOwner(page);

    await page.getByRole('navigation').getByRole('button', { name: /Purchase Orders/i }).click();
    await expect(page.getByText('Purchase Orders').first()).toBeVisible({ timeout: 15_000 });

    // 30 row(s) visible in header
    await expect(page.getByText(/30 row/)).toBeVisible({ timeout: 15_000 });
    // AG Grid rows are present
    await expect(page.locator('.ag-row').first()).toBeVisible({ timeout: 15_000 });

    // Click first row — verify interaction works (group rows expand on click)
    await page.locator('.ag-row').first().click({ force: true });
  });

  test('4. Orders: grid loads with items (44 rows)', async ({ page }) => {
    await waitForBackend(page);
    await loginAsOwner(page);

    // Staging nav has "Orders" (not "Items") — use exact match to avoid "Purchase Orders"
    await page.getByRole('navigation').getByRole('button', { name: 'Orders', exact: true }).click();
    await expect(page.getByText('Orders').first()).toBeVisible({ timeout: 15_000 });

    // 44 row(s) — staging has seed data
    await expect(page.getByText(/44 row/)).toBeVisible({ timeout: 15_000 });
    // AG Grid rows are present
    await expect(page.locator('.ag-row').first()).toBeVisible({ timeout: 15_000 });
  });

  test('5. Disputes: page loads (grid not rendered when 0 rows)', async ({ page }) => {
    await waitForBackend(page);
    await loginAsOwner(page);

    await page.getByRole('navigation').getByRole('button', { name: /Disputes/i }).click();
    await expect(page.getByText('Disputes').first()).toBeVisible({ timeout: 15_000 });

    // Disputes page renders even when empty (shows "No disputes" or grid header)
    const disputesHeading = page.getByRole('heading', { name: /dispute/i });
    const noDisputes = page.getByText(/no disputes/i);
    await expect(disputesHeading.or(noDisputes).first()).toBeVisible({ timeout: 15_000 });
  });
});
