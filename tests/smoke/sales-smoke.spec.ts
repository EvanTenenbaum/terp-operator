import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('SalesView renders with AG Grid', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
  await expect(page.getByText('Sales Orders').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
});
