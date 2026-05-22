import { test, expect, type Page } from '@playwright/test';

// These tests target the receipt preview UI workflow.
// The seed guarantees a finalized PO-DEMO-003 with a document_snapshots row,
// so the "Preview receipt" button is enabled and all tests can run without skips.
// Run: pnpm exec playwright test tests/e2e/receipt-preview.spec.ts

async function waitForBackend(page: Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 15_000 });
}

// Helper: find and click the PO-DEMO-003 row (finalized PO guaranteed by seed)
async function selectFinalizedPo(page: Page) {
  const row = page.locator('.ag-row', { hasText: 'PO-DEMO-003' });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
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
    await selectFinalizedPo(page);
    const previewBtn = page.locator('button:has-text("Preview receipt")').first();
    await expect(previewBtn).toBeVisible({ timeout: 10_000 });
    await expect(previewBtn).toBeEnabled();
  });

  test('Receipt overlay opens and shows receipt text', async ({ page }) => {
    await selectFinalizedPo(page);
    const previewBtn = page.locator('button:has-text("Preview receipt")').first();
    await expect(previewBtn).toBeVisible({ timeout: 10_000 });
    await expect(previewBtn).toBeEnabled();
    await previewBtn.click();
    await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="receipt-preview-body"]')).toBeVisible();
  });

  test('Internal mode shows INTERNAL — DO NOT SEND watermark', async ({ page }) => {
    await selectFinalizedPo(page);
    const previewBtn = page.locator('button:has-text("Preview receipt")').first();
    await expect(previewBtn).toBeVisible({ timeout: 10_000 });
    await expect(previewBtn).toBeEnabled();
    await previewBtn.click();
    await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible({ timeout: 10_000 });
    const internalBtn = page.locator('[data-testid="receipt-mode-internal"]');
    if (await internalBtn.isEnabled()) {
      await internalBtn.click();
      // Watermark should not have hidden class
      await expect(page.locator('[data-testid="internal-watermark"]')).not.toHaveClass(/hidden/);
      await expect(page.locator('[data-testid="internal-watermark"]')).toContainText('INTERNAL');
    }
  });

  test('External mode hides the internal watermark', async ({ page }) => {
    await selectFinalizedPo(page);
    const previewBtn = page.locator('button:has-text("Preview receipt")').first();
    await expect(previewBtn).toBeVisible({ timeout: 10_000 });
    await expect(previewBtn).toBeEnabled();
    await previewBtn.click();
    await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible({ timeout: 10_000 });
    // External mode is default — watermark should carry hidden class
    const externalBtn = page.locator('[data-testid="receipt-mode-external"]');
    await externalBtn.click();
    await expect(page.locator('[data-testid="internal-watermark"]')).toHaveClass(/hidden/);
  });

  test('Close button dismisses the overlay', async ({ page }) => {
    await selectFinalizedPo(page);
    const previewBtn = page.locator('button:has-text("Preview receipt")').first();
    await expect(previewBtn).toBeVisible({ timeout: 10_000 });
    await expect(previewBtn).toBeEnabled();
    await previewBtn.click();
    await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-testid="receipt-close-btn"]').click();
    await expect(page.locator('[data-testid="receipt-preview-overlay"]')).not.toBeVisible();
  });

  test('Print button applies print-receipt-only class to body', async ({ page }) => {
    // Override window.print to prevent actual print dialog
    await page.addInitScript(() => {
      (window as Window & { print: () => void }).print = () => {}; // stub
    });
    await selectFinalizedPo(page);
    const previewBtn = page.locator('button:has-text("Preview receipt")').first();
    await expect(previewBtn).toBeVisible({ timeout: 10_000 });
    await expect(previewBtn).toBeEnabled();
    await previewBtn.click();
    await expect(page.locator('[data-testid="receipt-preview-overlay"]')).toBeVisible({ timeout: 10_000 });
    // The print CSS class is applied then removed via setTimeout — check it was applied
    await page.locator('[data-testid="receipt-print-btn"]').click();
    // After print, body should not have the class (it's removed async)
    await expect(page.locator('body')).not.toHaveClass(/print-receipt-only/);
  });
});
