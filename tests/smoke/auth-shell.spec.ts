import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('login and authenticated shell render', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await loginAsOwner(page);
  // Navigation shell must be present
  await expect(page.getByRole('navigation')).toBeVisible();
  // Quick-actions keel must be present (used by all operator flows)
  await expect(
    page.getByRole('banner', { name: 'Global workspace keel' })
  ).toBeVisible();
});
