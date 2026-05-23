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
  await expect(page.getByText('All Contacts')).toBeVisible();
  await expect(page.locator('.ag-root:visible').first()).toBeVisible();

  // Click into the first contact
  const firstContactLink = page.locator('button.text-button').first();
  await firstContactLink.click();

  // Profile page should load
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();

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
