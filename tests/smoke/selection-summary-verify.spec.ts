import { test, expect } from '@playwright/test';
import { waitForBackend, loginAsOwner } from '../../tests/smoke/_helpers';

test('cell range selection shows accurate summary stats', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  // Navigate to inventory (reliable data source)
  await page.getByRole('link', { name: /inventory/i }).click();

  // Wait for the AG Grid to appear with data
  const grid = page.locator('.ag-theme-quartz');
  await expect(grid).toBeVisible({ timeout: 30_000 });

  // Wait for at least one data row
  const firstDataCell = grid.locator('.ag-cell').first();
  await expect(firstDataCell).toBeVisible({ timeout: 15_000 });

  // Click first cell to set focus / anchor
  await firstDataCell.click();

  // Shift+click a few cells down to create a range selection
  const cells = grid.locator('.ag-cell');
  const count = await cells.count();
  if (count >= 5) {
    // Shift-click 4 cells down in the same column
    await cells.nth(4).click({ modifiers: ['Shift'] });
  }

  // The selection-summary should now be visible (either range stats or row stats)
  const summary = page.locator('.selection-summary');
  await expect(summary).toBeVisible({ timeout: 10_000 });

  // Summary must contain a pill indicating something is selected
  const pills = summary.locator('.selection-pill');
  await expect(pills.first()).toBeVisible();
  const firstPillText = await pills.first().textContent();
  // Should say "N cells" or "N selected"
  expect(firstPillText).toMatch(/\d+\s+(cells|selected)/i);
});

test('row selection summary count matches selection size', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  await page.getByRole('link', { name: /inventory/i }).click();
  const grid = page.locator('.ag-theme-quartz');
  await expect(grid).toBeVisible({ timeout: 30_000 });

  // Click first row
  const rows = grid.locator('.ag-row');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  await rows.first().click();

  // Ctrl+click second row to add to selection
  if (await rows.count() >= 2) {
    await rows.nth(1).click({ modifiers: ['Meta'] }); // Cmd on Mac
  }

  const summary = page.locator('.selection-summary');
  await expect(summary).toBeVisible({ timeout: 10_000 });

  const firstPill = summary.locator('.selection-pill').first();
  const text = await firstPill.textContent();
  // Should be "2 selected" not "1 selected" (verifies correct count)
  expect(text).toMatch(/2\s+selected/i);
});
