import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

test('owner can log in, inspect dashboard, and navigate spreadsheet grids', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Owner Daily Decision View')).toBeVisible();
  await expect(page.getByText('Cash/files on hand')).toBeVisible();

  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: /Intake/ }).click();
  await expect(page.getByText('J02 Fast Inventory Intake')).toBeVisible();
  await expect(page.locator('.ag-root:visible').first()).toBeVisible();

  await page.getByRole('button', { name: /Search commands/ }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');

  await nav.getByRole('button', { name: /Sales/ }).click();
  await expect(page.getByText('J03 Guided Selling / Sales Orders')).toBeVisible();

  await nav.getByRole('button', { name: /Fulfillment/ }).click();
  await expect(page.getByText('J07 Fulfillment and Bagging')).toBeVisible();
  await expect(page.getByText('Fulfillment Lines')).toBeVisible();

  await nav.getByRole('button', { name: /Recovery/ }).click();
  await expect(page.getByText('J09 Mistake Recovery')).toBeVisible();
  await expect(page.getByRole('button', { name: /Support packet/ })).toBeVisible();

  await nav.getByRole('button', { name: /Closeout/ }).click();
  await expect(page.getByText('J10 Archive and Closeout')).toBeVisible();
  await expect(page.getByRole('button', { name: /Adjustment/ })).toBeVisible();
});

test('collapsed mobile navigation keeps accessible route names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Recovery' }).click();
  await expect(page.getByText('J09 Mistake Recovery')).toBeVisible();
  await nav.getByRole('button', { name: 'Closeout' }).click();
  await expect(page.getByText('J10 Archive and Closeout')).toBeVisible();
});

test('keel chips and row-native tools support fastest operator starts', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });

  const keel = page.getByRole('banner', { name: 'Global workspace keel' });
  await expect(keel.getByRole('button', { name: 'Sale', exact: true })).toBeVisible();
  await expect(keel.getByRole('button', { name: 'Purchase', exact: true })).toBeVisible();
  await expect(keel.getByRole('button', { name: 'Receive', exact: true })).toBeVisible();
  await expect(keel.getByRole('button', { name: '$ In', exact: true })).toBeVisible();
  await expect(keel.getByRole('button', { name: '$ Out', exact: true })).toBeVisible();

  await keel.getByRole('button', { name: 'Sale', exact: true }).click();
  await page.getByLabel('Customer').selectOption({ label: 'Cobalt Reserve' });
  await page.getByRole('button', { name: 'New Sale' }).first().click();
  await expect(page.getByText('J03 Guided Selling / Sales Orders')).toBeVisible();
  await expect(page.getByText('Customer Workspace')).toBeVisible();

  const finder = page.getByTestId('inventory-finder');
  await expect(finder.getByText('Inventory Finder')).toBeVisible();
  await finder.locator('input[placeholder*="Search"]').fill('flower under 100');
  await expect(finder.getByText('search: flower under 100')).toBeVisible();
  await expect(finder.getByText('<= $100')).toBeVisible();
  await expect(finder.getByRole('button', { name: 'Copy slice' })).toBeVisible();
  await finder.getByLabel('Finder category').selectOption('Flower');
  await finder.getByLabel('Finder maximum price').fill('100');
  await expect(finder.getByText(/shown/)).toBeVisible();

  await keel.getByRole('button', { name: 'Purchase' }).click();
  await expect(page.getByRole('button', { name: /Purchase Orders \d+ row/ })).toBeVisible();
  await page.getByRole('button', { name: 'New PO' }).click();
  await expect(page.getByRole('button', { name: /Add Line/ })).toBeVisible();

  await keel.getByRole('button', { name: 'Receive', exact: true }).click();
  await expect(page.getByText('J02 Fast Inventory Intake')).toBeVisible();
  await expect(page.getByRole('button', { name: /Receive Inventory/ })).toBeVisible();

  await keel.getByRole('button', { name: '$ In', exact: true }).click();
  await expect(page.getByText('J05 Payment Logging and Allocation')).toBeVisible();
  await expect(page.getByText('Quick Ledger')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Money In', exact: true })).toBeVisible();
});

test('operators can reclaim space while keeping the keel available', async ({ page }) => {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const keel = page.getByRole('banner', { name: 'Global workspace keel' });
  await expect(keel).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
  await expect(page.getByText('J03 Guided Selling / Sales Orders')).toBeVisible();
  await page.getByLabel('Expand J03 Guided Selling / Sales Orders').click();
  await expect(keel.getByRole('button', { name: 'Sale', exact: true })).toBeVisible();
  await expect(page.getByText('Inventory Finder')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(keel).toBeVisible();
  await expect(page.getByText('Inventory Finder')).toBeVisible();

  await page.getByRole('button', { name: /Collapse navigation/ }).click();
  await expect(page.getByRole('button', { name: /Expand navigation/ })).toBeVisible();
});

test('backend-wired operator abilities are visible in the frontend', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const nav = page.getByRole('navigation');
  const main = page.getByRole('main');

  await nav.getByRole('button', { name: /Purchase Orders/ }).click();
  await expect(main.getByRole('button', { name: /Purchase Orders \d+ row/ })).toBeVisible();
  await expect(main.getByRole('button', { name: 'New PO' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(main.getByText('PO receiving only drafts intake rows.')).toBeVisible();
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await main.getByRole('button', { name: 'PO tray' }).click();
  await expect(main.getByRole('button', { name: 'Draft intake' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Add Line' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Draft selected lines' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Line tray' })).toBeVisible();

  await nav.getByRole('button', { name: /Intake/ }).click();
  await expect(page.getByRole('button', { name: 'CSV import' })).toBeVisible();
  await page.getByRole('button', { name: 'CSV import' }).click();
  await expect(page.getByText('Validate-first CSV import')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
  await expect(page.locator('label.field-inline').filter({ hasText: 'Lot code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set lot info' })).toBeVisible();
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await expect(page.getByRole('button', { name: 'Intake tray' })).toBeVisible();
  await page.getByRole('button', { name: 'Intake tray' }).click();
  await expect(page.getByRole('button', { name: 'Delete draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Server CSV' }).first()).toBeVisible();

  await nav.getByRole('button', { name: /Sales/ }).click();
  await page.getByRole('button', { name: 'Sale tray' }).click();
  await expect(page.getByRole('button', { name: 'Reserve' }).first()).toBeVisible();

  await nav.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pick list' })).toBeVisible();

  await nav.getByRole('button', { name: /Payments/ }).click();
  await expect(page.getByRole('button', { name: 'Money In', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Money Out', exact: true })).toBeVisible();
  await expect(page.getByText('Payment allocations')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unallocate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Early discount' })).toBeVisible();

  await nav.getByRole('button', { name: /Vendor Payouts/ }).click();
  await expect(page.getByText('Vendor bill and payout tools')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create bill' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Void payout' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Payout tray' })).toBeVisible();

  await nav.getByRole('button', { name: /Inventory/ }).click();
  await expect(page.getByText('Photography Queue')).toBeVisible();
  await expect(page.getByText('Inventory controls')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set status' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move location' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move ownership' })).toBeVisible();
  await expect(page.getByText('Photo URL/path')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach' })).toBeVisible();

  await nav.getByRole('button', { name: /Connectors/ }).click();
  await expect(page.getByRole('button', { name: 'Approve' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Route' }).first()).toBeVisible();
});
