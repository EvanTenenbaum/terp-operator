import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('PaymentsView renders with Payment allocations section', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  // PaymentsView navigation uses data-testid (confirmed in payment-processor-qa.spec.ts)
  await page.click('[data-testid="sidenav-item-payments"]');
  // h2 "Payment allocations" confirmed in OperationsViews.tsx:1162
  await expect(page.getByText('Payment allocations').first()).toBeVisible({ timeout: 15_000 });
});
