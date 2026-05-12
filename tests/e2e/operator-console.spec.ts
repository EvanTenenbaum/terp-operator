import { test, expect } from '@playwright/test';

test('owner can log in, inspect dashboard, and navigate spreadsheet grids', async ({ page }) => {
  test.setTimeout(60_000);
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

test('quick start and inventory finder support fastest operator starts', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const quickStart = page.getByRole('region', { name: 'Quick Start' });
  await expect(quickStart.getByRole('button', { name: 'Sale', exact: true })).toBeVisible();
  await expect(quickStart.getByRole('button', { name: 'Purchase', exact: true })).toBeVisible();
  await expect(quickStart.getByRole('button', { name: 'Receiving', exact: true })).toBeVisible();
  await expect(quickStart.getByRole('button', { name: 'Money In', exact: true })).toBeVisible();
  await expect(quickStart.getByRole('button', { name: 'Money Out', exact: true })).toBeVisible();

  await quickStart.getByRole('button', { name: 'Sale', exact: true }).click();
  await quickStart.getByRole('button', { name: 'Sale', exact: true }).click();
  await expect(quickStart.getByRole('button', { name: /New Sale/ })).toBeVisible();
  await quickStart.getByLabel('Client').selectOption({ label: 'Cobalt Reserve' });
  await quickStart.getByLabel('Request').fill('flower under 100');
  await quickStart.getByRole('button', { name: /New Sale/ }).click();
  await expect(page.getByText('J03 Guided Selling / Sales Orders')).toBeVisible();
  await expect(page.getByText('Customer Workspace')).toBeVisible();

  const finder = page.getByTestId('inventory-finder');
  await expect(finder.getByText('Inventory Finder')).toBeVisible();
  await expect(finder.getByText('search: flower under 100')).toBeVisible();
  await expect(finder.getByText('<= $100')).toBeVisible();
  await finder.getByLabel('Finder category').selectOption('Flower');
  await finder.getByLabel('Finder maximum price').fill('100');
  await expect(finder.getByText(/shown/)).toBeVisible();

  await quickStart.getByRole('button', { name: 'Purchase' }).click();
  await quickStart.getByLabel('Vendor').selectOption({ index: 1 });
  await quickStart.getByRole('button', { name: /New PO/ }).click();
  await expect(page.getByText('Purchase Orders')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add Line/ })).toBeVisible();

  await quickStart.getByRole('button', { name: 'Receiving' }).click();
  await quickStart.getByLabel('Vendor').selectOption({ index: 1 });
  await quickStart.getByRole('button', { name: /Receive Inventory/ }).click();
  await expect(page.getByText('J02 Fast Inventory Intake')).toBeVisible();
  await expect(page.getByRole('button', { name: /Receive Row/ })).toBeVisible();

  await quickStart.getByRole('button', { name: 'Money In' }).click();
  await quickStart.getByLabel('Client').selectOption({ label: 'Cobalt Reserve' });
  await quickStart.getByLabel('Money in', { exact: true }).fill('25');
  await quickStart.getByLabel('FIFO').uncheck();
  await quickStart.getByRole('button', { name: /Receive Money/ }).click();
  await expect(page.getByText('J05 Payment Logging and Allocation')).toBeVisible();
});

test('operators can minimize chrome and focus the active work panel', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const quickStart = page.getByRole('region', { name: 'Quick Start' });
  await quickStart.getByRole('button', { name: /Quick Start/ }).click();
  await expect(quickStart.getByRole('button', { name: /New Sale/ })).toHaveCount(0);
  await expect(quickStart.getByText(/controls are minimized/)).toBeVisible();
  await quickStart.getByRole('button', { name: /Quick Start/ }).click();
  await expect(quickStart.getByRole('button', { name: /New Sale/ })).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
  await expect(page.getByText('J03 Guided Selling / Sales Orders')).toBeVisible();
  await page.getByLabel('Expand J03 Guided Selling / Sales Orders').click();
  await expect(page.getByRole('region', { name: 'Quick Start' })).toHaveCount(0);
  await expect(page.getByText('Inventory Finder')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Quick Start' })).toBeVisible();
  await expect(page.getByText('Inventory Finder')).toBeVisible();

  await page.getByRole('button', { name: /Collapse navigation/ }).click();
  await expect(page.getByRole('button', { name: /Expand navigation/ })).toBeVisible();
});

test('backend-wired operator abilities are visible in the frontend', async ({ page }) => {
  test.setTimeout(60_000);
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
  await expect(main.getByRole('button', { name: 'Receive to Intake' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await expect(main.getByRole('button', { name: 'Add Line' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Receive Lines' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Remove Line' })).toBeVisible();

  await nav.getByRole('button', { name: /Intake/ }).click();
  await expect(page.getByRole('button', { name: 'CSV import' })).toBeVisible();
  await page.getByRole('button', { name: 'CSV import' }).click();
  await expect(page.getByText('Validate-first CSV import')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
  await expect(page.locator('label.field-inline').filter({ hasText: 'Lot code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set lot info' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Server CSV' }).first()).toBeVisible();

  await nav.getByRole('button', { name: /Sales/ }).click();
  await expect(page.getByRole('button', { name: 'Reserve' }).first()).toBeVisible();

  await nav.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pick list' })).toBeVisible();

  await nav.getByRole('button', { name: /Payments/ }).click();
  await expect(page.getByText('Payment allocations')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unallocate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Early discount' })).toBeVisible();

  await nav.getByRole('button', { name: /Vendor Payouts/ }).click();
  await expect(page.getByText('Vendor bill and payout tools')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create bill' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Void payout' })).toBeVisible();

  await nav.getByRole('button', { name: /Inventory/ }).click();
  await expect(page.getByText('Photography Queue')).toBeVisible();
  await expect(page.getByText('Photo URL/path')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach' })).toBeVisible();

  await nav.getByRole('button', { name: /Connectors/ }).click();
  await expect(page.getByRole('button', { name: 'Approve' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Route' }).first()).toBeVisible();
});
