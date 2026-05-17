import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

test.describe('Processor Transactions', () => {
  test('complete crypto cash-in transaction flow', async ({ page }) => {
    test.setTimeout(60_000);
    await waitForBackend(page);

    // Login
    await page.goto('/');
    await page.getByLabel('Email').fill('owner@terpagro.local');
    await page.getByLabel('Password').fill('terp-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Owner Daily Decision View')).toBeVisible();

    // Navigate to Transaction Ledger via Quick actions
    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await keel.getByRole('button', { name: 'Quick actions' }).click();
    await keel.getByRole('menuitem', { name: 'Money in', exact: true }).click();

    await expect(page.getByText('Transaction Ledger')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Receiving', exact: true })).toBeVisible();

    // Click "Receiving" to add new row
    await page.getByRole('button', { name: 'Receiving', exact: true }).click();

    // Get the draft row (should be the first tbody row)
    const draftRow = page.locator('tbody tr').first();

    // Fill in entity type (customer)
    await draftRow.locator('select').nth(0).selectOption('customer');

    // Select first customer from entity dropdown
    await draftRow.locator('select').nth(1).selectOption({ index: 1 });

    // Select crypto payment transaction type
    // The third select is the transaction type selector
    const transactionTypeSelect = draftRow.locator('select').nth(2);
    await transactionTypeSelect.selectOption({ label: /crypto.*payment/i });

    // Fill processor fields (these only appear for processor transaction types)
    // Gross amount input (should have placeholder "Gross")
    await draftRow.getByPlaceholder('Gross').fill('100.00');

    // Select processor from dropdown (should have "Choose processor" default option)
    const processorSelect = draftRow.locator('select:has(option:text-is("Choose processor"))');
    await processorSelect.selectOption({ index: 1 });

    // Verify fee calculation (fee input should auto-fill or be editable)
    const feeInput = draftRow.getByPlaceholder('Fee');
    await expect(feeInput).toBeVisible();
    // Fee should either be auto-calculated or allow manual entry
    // We don't assert specific value as it depends on processor config

    // Verify net amount display exists
    // The net amount should be visible in the row
    await expect(draftRow.locator('td').filter({ hasText: /\$/ })).toHaveCount({ timeout: 5000, min: 1 });

    // Commit transaction
    await draftRow.getByRole('button', { name: /Commit/ }).click();

    // Verify success - row should show success status
    await expect(page.locator('.finder-chip.success')).toBeVisible({ timeout: 10000 });
  });

  test('complete crypto cashout transaction flow', async ({ page }) => {
    test.setTimeout(60_000);
    await waitForBackend(page);

    // Login
    await page.goto('/');
    await page.getByLabel('Email').fill('owner@terpagro.local');
    await page.getByLabel('Password').fill('terp-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Owner Daily Decision View')).toBeVisible();

    // Navigate to Transaction Ledger
    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await keel.getByRole('button', { name: 'Quick actions' }).click();
    await keel.getByRole('menuitem', { name: 'Money out', exact: true }).click();

    await expect(page.getByText('Transaction Ledger')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Paying', exact: true })).toBeVisible();

    // Click "Paying" to add cashout row
    await page.getByRole('button', { name: 'Paying', exact: true }).click();

    // Get the draft row
    const draftRow = page.locator('tbody tr').first();

    // Fill in entity type (customer for cashout)
    await draftRow.locator('select').nth(0).selectOption('customer');

    // Select first customer
    await draftRow.locator('select').nth(1).selectOption({ index: 1 });

    // Select crypto cashout transaction type
    const transactionTypeSelect = draftRow.locator('select').nth(2);
    await transactionTypeSelect.selectOption({ label: /crypto.*cashout/i });

    // Fill processor fields
    await draftRow.getByPlaceholder('Gross').fill('100.00');

    // Select processor
    const processorSelect = draftRow.locator('select:has(option:text-is("Choose processor"))');
    await processorSelect.selectOption({ index: 1 });

    // Commit
    await draftRow.getByRole('button', { name: /Commit/ }).click();

    // Verify success
    await expect(page.locator('.finder-chip.success')).toBeVisible({ timeout: 10000 });
  });
});
