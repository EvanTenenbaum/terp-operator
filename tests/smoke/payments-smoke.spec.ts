import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('PaymentsView renders with Payment allocations section', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  // M8 FIX: use getByRole for nav navigation consistent with other smoke specs.
  // Shell.tsx defines the nav item as { view: 'payments', label: 'Payments' },
  // so the button has accessible name 'Payments'.
  // Previously used page.click('[data-testid="sidenav-item-payments"]') which
  // mixed selector strategies with the rest of the suite and used the deprecated
  // page.click(selector) API instead of a locator.
  await page.getByRole('navigation').getByRole('button', { name: /Payments/ }).click();

  // h2 "Payment allocations" confirmed in OperationsViews.tsx:1162
  await expect(page.getByText('Payment allocations').first()).toBeVisible({ timeout: 15_000 });
});
