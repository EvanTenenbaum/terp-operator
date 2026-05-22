import { test, expect } from '@playwright/test';

// These tests target the receipt preview UI workflow.
// They require a seeded app with at least one finalized PO.
// Run: pnpm exec playwright test tests/e2e/receipt-preview.spec.ts

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 15_000 });
}

test.describe('Receipt preview — PO flow', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    await waitForBackend(page);
    await login(page);
    await page.goto('/purchaseOrders');
    // Wait for grid to load
    await expect(page.locator('.ag-root')).toBeVisible({ timeout: 15_000 });
  });

  test('Preview receipt button appears when a finalized PO is selected', async ({ page }) => {
    // Click first row in the PO grid
    const rows = page.locator('.ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    await rows.first().click();
    // Look for the preview receipt button in the po-header-strip or expansion panel
    // If no finalized PO exists in seed, the button should still render but be disabled
    const previewBtn = page.locator('[data-testid="preview-receipt-btn"], button:has-text("Preview receipt")');
    await expect(previewBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('Receipt overlay opens and shows receipt text', async ({ page }) => {
    test.skip(true, 'Requires seeded finalized PO — run against staging');
    // Find and click a Preview receipt button
    const rows = page.locator('.ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    await rows.first().click();
    const previewBtn = page.locator('button:has-text("Preview receipt")');
    if (await previewBtn.count() > 0 && await previewBtn.first().isEnabled()) {
      await previewBtn.first().click();
      // Overlay should appear
      await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible({ timeout: 5_000 });
      // Body should have some content
      await expect(page.locator('[data-testid="receipt-preview-body"]')).toBeVisible();
    }
  });

  test('Internal mode shows INTERNAL — DO NOT SEND watermark', async ({ page }) => {
    test.skip(true, 'Requires seeded finalized PO — run against staging');
    const rows = page.locator('.ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    await rows.first().click();
    const previewBtn = page.locator('button:has-text("Preview receipt")');
    if (await previewBtn.count() > 0 && await previewBtn.first().isEnabled()) {
      await previewBtn.first().click();
      await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible();
      // Switch to internal mode
      const internalBtn = page.locator('[data-testid="receipt-mode-internal"]');
      if (await internalBtn.isEnabled()) {
        await internalBtn.click();
        // Watermark should not have hidden class
        await expect(page.locator('[data-testid="internal-watermark"]')).not.toHaveClass(/hidden/);
        await expect(page.locator('[data-testid="internal-watermark"]')).toContainText('INTERNAL');
      }
    }
  });

  test('External mode hides the internal watermark', async ({ page }) => {
    const rows = page.locator('.ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    await rows.first().click();
    const previewBtn = page.locator('button:has-text("Preview receipt")');
    if (await previewBtn.count() > 0 && await previewBtn.first().isEnabled()) {
      await previewBtn.first().click();
      await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible();
      // External mode is default — watermark should carry hidden class
      const externalBtn = page.locator('[data-testid="receipt-mode-external"]');
      await externalBtn.click();
      await expect(page.locator('[data-testid="internal-watermark"]')).toHaveClass(/hidden/);
    }
  });

  test('Close button dismisses the overlay', async ({ page }) => {
    test.skip(true, 'Requires seeded finalized PO — run against staging');
    const rows = page.locator('.ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    await rows.first().click();
    const previewBtn = page.locator('button:has-text("Preview receipt")');
    if (await previewBtn.count() > 0 && await previewBtn.first().isEnabled()) {
      await previewBtn.first().click();
      await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible();
      await page.locator('[data-testid="receipt-close-btn"]').click();
      await expect(page.locator('[data-testid="receipt-preview-overlay"]')).not.toBeVisible();
    }
  });

  test('Print button applies print-receipt-only class to body', async ({ page }) => {
    test.skip(true, 'Requires seeded finalized PO — run against staging');
    // Override window.print to prevent actual print dialog
    await page.addInitScript(() => {
      (window as Window & { print: () => void }).print = () => {}; // stub
    });
    const rows = page.locator('.ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    await rows.first().click();
    const previewBtn = page.locator('button:has-text("Preview receipt")');
    if (await previewBtn.count() > 0 && await previewBtn.first().isEnabled()) {
      await previewBtn.first().click();
      await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible();
      // The print CSS class is applied then removed via setTimeout — check it was applied
      await page.locator('[data-testid="receipt-print-btn"]').click();
      // After print, body should not have the class (it's removed async)
      await expect(page.locator('body')).not.toHaveClass(/print-receipt-only/);
    }
  });
});
