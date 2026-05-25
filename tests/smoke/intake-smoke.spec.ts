import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from './_helpers';

test('IntakeView renders AG Grid and command palette opens', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  await page.getByRole('navigation').getByRole('button', { name: /Intake/ }).click();
  await expect(page.getByText('Intake queue').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });

  // M6 FIX: assert at least one data row exists — empty grid renders the same
  // DOM as a loaded grid; a regression that breaks data fetch is otherwise invisible.
  await expect(page.locator('.ag-row').first()).toBeVisible({ timeout: 10_000 });

  // Command palette must open — core operator interaction surface
  await page.getByRole('button', { name: /^Search/ }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');
});
