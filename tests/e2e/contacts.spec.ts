import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

test('owner can navigate contacts directory and view a profile', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible();

  // Navigate to Contacts
  await page.getByRole('navigation').getByRole('button', { name: /Contacts/ }).click();
  await expect(page.getByText('All Contacts').first()).toBeVisible();
  await expect(page.locator('.ag-root:visible').first()).toBeVisible();

  // Wait for grid rows to actually render before clicking
  await expect(page.locator('.ag-row')).toHaveCount({ minimum: 1 }, { timeout: 15_000 }).catch(() => null);
  await page.waitForTimeout(500); // let AG Grid finish rendering cell renderers

  // Click into the first contact — use grid-scoped selector to avoid non-grid text-buttons
  const firstContactLink = page.locator('.ag-row button.text-button').first();
  await expect(firstContactLink).toBeVisible({ timeout: 10_000 });
  await firstContactLink.click();

  // Wait for profile navigation to complete (React Router pushState)
  await page.waitForURL(/\/contacts\/[a-f0-9-]{36}/, { timeout: 20_000 });

  // Profile page should load (tablist may take a moment for tRPC data to resolve)
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible({ timeout: 10_000 });

  // Switch to Appointments tab
  await page.getByRole('tab', { name: 'Appointments' }).click();
  await expect(page.getByText('Upcoming')).toBeVisible();
  await expect(page.getByText('Past')).toBeVisible();

  // Add an appointment
  await page.getByRole('button', { name: 'Add Appointment' }).click();
  await expect(page.getByRole('dialog', { name: /Appointment/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('textbox', { name: /Title/i }).fill('Test meeting');
  const tomorrow = new Date(Date.now() + 86400000);
  const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}T10:00`;
  await page.getByRole('dialog').locator('input[type="datetime-local"]').first().fill(dateStr);
  await page.getByRole('button', { name: 'Add Appointment' }).last().click();
  await expect(page.getByText('Appointment added')).toBeVisible();
  await expect(page.getByText('Test meeting')).toBeVisible();
});
