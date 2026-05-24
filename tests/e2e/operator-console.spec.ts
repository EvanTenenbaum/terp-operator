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
  await page.waitForLoadState('networkidle');

  await expect(page.getByText('Owner Daily Decision View').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Cash/files on hand').first()).toBeVisible();

  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: /Intake/ }).click();
  await expect(page.getByText('Intake queue').first()).toBeVisible();
  await expect(page.locator('.ag-root:visible').first()).toBeVisible();

  await page.getByRole('button', { name: /^Search/ }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');

  await nav.getByRole('button', { name: /Sales/ }).click();
  await expect(page.getByText('Sales Orders').first()).toBeVisible();

  await nav.getByRole('button', { name: /Fulfillment/ }).click();
  await expect(page.getByRole('button', { name: /Fulfillment \d+ row/ })).toBeVisible();
  await expect(page.getByText('Fulfillment Lines').first()).toBeVisible();

  await nav.getByRole('button', { name: /Settings/ }).click();
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await expect(page.getByText('Inbound Requests').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Action log' }).click();
  await expect(page.getByRole('button', { name: /Action Log \d+ row/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admin tools' })).toBeVisible();
  await page.getByRole('tab', { name: 'Archive' }).click();
  await expect(page.getByText('Archive Runs').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Adjustment/ })).toBeVisible();
});

test('collapsed mobile navigation keeps accessible route names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const keel = page.getByRole('banner', { name: 'Global workspace keel' });
  await keel.getByRole('button', { name: 'Quick actions' }).click();
  await expect(keel.getByRole('menuitem', { name: 'New Sale', exact: true })).toBeVisible();
  await expect(keel.getByRole('menuitem', { name: 'New PO', exact: true })).toBeVisible();
  await expect(keel.getByRole('menuitem', { name: 'Receive', exact: true })).toBeVisible();

  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Recovery' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Closeout' })).toHaveCount(0);
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
  await keel.getByRole('button', { name: 'Quick actions' }).click();
  await expect(keel.getByRole('menuitem', { name: 'New Sale', exact: true })).toBeVisible();
  await expect(keel.getByRole('menuitem', { name: 'New PO', exact: true })).toBeVisible();
  await expect(keel.getByRole('menuitem', { name: 'Receive', exact: true })).toBeVisible();
  await expect(keel.getByRole('menuitem', { name: 'Money in', exact: true })).toBeVisible();
  await expect(keel.getByRole('menuitem', { name: 'Money out', exact: true })).toBeVisible();

  await keel.getByRole('menuitem', { name: 'New Sale', exact: true }).click();
  await page.getByLabel('Customer').selectOption({ label: 'Cobalt Reserve' });
  // Use region role to avoid strict-mode match against both the section label and inner span
  await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible();
  // Issue #60/#63: panel was renamed from "Customer Workspace" to "Sale Builder"
  await expect(page.getByRole('button', { name: 'Sale Builder', exact: true })).toBeVisible();

  const finder = page.getByTestId('inventory-finder');
  await expect(finder.getByText('Inventory Finder')).toBeVisible();
  await finder.locator('input[placeholder*="Search"]').fill('flower under 100');
  await expect(finder.getByText('search: flower under 100')).toBeVisible();
  await expect(finder.getByText('<= $100')).toBeVisible();
  await expect(finder.getByRole('button', { name: 'Copy List for Customer' })).toBeVisible();
  await finder.getByLabel('Finder category').selectOption('Flower');
  await finder.getByLabel('Finder maximum price').fill('100');
  await expect(finder.getByText(/\d+ \/ \d+ shown/)).toBeVisible();
  await page.keyboard.press('Escape');

  await keel.getByRole('button', { name: 'Quick actions' }).click();
  await keel.getByRole('menuitem', { name: 'New PO' }).click();
  await expect(page.getByRole('button', { name: /Recent purchase orders \d+ row/ })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'New PO' }).click();
  await expect(page.getByText('New PO lines').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Add line row/ })).toBeVisible();
  const poWorkspace = page.getByLabel('New purchase order workspace');
  await poWorkspace.locator('.ag-cell[col-id="productName"]').first().dblclick();
  await page.keyboard.type('QA Zero Cost');
  await page.keyboard.press('Enter');
  await expect(poWorkspace.getByRole('button', { name: 'Approve PO' })).toBeDisabled();
  await expect(page.locator('.selection-pill.danger').first()).toBeVisible({ timeout: 10000 });

  await keel.getByRole('button', { name: 'Quick actions' }).click();
  await keel.getByRole('menuitem', { name: 'Receive', exact: true }).click();
  await expect(page.getByText('Intake queue')).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV import' })).toBeVisible();

  await keel.getByRole('button', { name: 'Quick actions' }).click();
  await keel.getByRole('menuitem', { name: 'Money in', exact: true }).click();
  await expect(page.getByRole('button', { name: /Payments \d+ row/ })).toBeVisible();
  await expect(page.getByText('Transaction Ledger')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Receiving', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paying', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Receiving Ledger' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paying Ledger' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'PO / FIFO / target' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Paying Ledger' }).click();
  await expect(page.getByText('Entity paying cash to')).toHaveCount(0);
  await page.getByRole('button', { name: 'Paying Ledger' }).click();
  await expect(page.getByText('Entity paying cash to')).toBeVisible();
});

test('persona workspaces keep only the relevant starts visible', async ({ page }) => {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('sales@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const keel = page.getByRole('banner', { name: 'Global workspace keel' });
  await keel.getByRole('button', { name: 'Quick actions' }).click();
  await expect(keel.getByRole('menuitem', { name: 'New Sale', exact: true })).toBeVisible();
  await expect(keel.getByRole('menuitem', { name: 'Money in', exact: true })).toBeVisible();
  await expect(keel.getByRole('menuitem', { name: 'New PO', exact: true })).toHaveCount(0);
  await expect(keel.getByRole('menuitem', { name: 'Receive', exact: true })).toHaveCount(0);
  await expect(keel.getByRole('menuitem', { name: 'Money out', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Settings' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Email').fill('viewer@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const viewerKeel = page.getByRole('banner', { name: 'Global workspace keel' });
  await expect(viewerKeel.getByRole('button', { name: 'Find', exact: true })).toBeVisible();
  await expect(viewerKeel.getByRole('menuitem', { name: 'New Sale', exact: true })).toHaveCount(0);
  await expect(viewerKeel.getByRole('menuitem', { name: 'New PO', exact: true })).toHaveCount(0);
  await expect(viewerKeel.getByRole('menuitem', { name: 'Receive', exact: true })).toHaveCount(0);
  await expect(viewerKeel.getByRole('menuitem', { name: 'Money in', exact: true })).toHaveCount(0);
  await expect(viewerKeel.getByRole('menuitem', { name: 'Money out', exact: true })).toHaveCount(0);
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
  // Use role-scoped locator to avoid ambiguity with activity-row text that contains "sales order"
  await expect(page.getByRole('region', { name: 'Sales Orders' })).toBeVisible();
  await page.getByLabel('Expand Sales Orders').click();
  await expect(keel.getByRole('button', { name: 'Quick actions' })).toBeVisible();
  // Issue #60/#63: focused sibling now renders a minimized rail (title + restore button)
  // rather than disappearing entirely. Title is still visible.
  // Scoped to data-testid="inventory-finder" to avoid the tab-strip button added by #62.
  await expect(page.getByTestId('inventory-finder').getByText('Inventory Finder')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore Inventory Finder' })).toBeVisible();
  // Rail does not render panel content (search input is absent from DOM)
  await expect(page.getByTestId('inventory-finder').locator('input[placeholder*="Search"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(keel).toBeVisible();
  // Scoped to data-testid="inventory-finder" to avoid the tab-strip button added by #62.
  await expect(page.getByTestId('inventory-finder').getByText('Inventory Finder')).toBeVisible();
  // After restore, full panel content is rendered again
  await expect(page.getByTestId('inventory-finder').locator('input[placeholder*="Search"]')).toBeVisible();

  await page.getByRole('button', { name: /Collapse navigation/ }).click();
  await expect(page.getByRole('button', { name: /Expand navigation/ })).toBeVisible();
});

test('backend-wired operator abilities are visible in the frontend', { annotation: { type: 'fixme', description: 'AG Grid row/button detaches during virtualization re-render' } }, async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const nav = page.getByRole('navigation');
  const main = page.getByRole('main');

  await nav.getByRole('button', { name: /Purchase Orders/ }).click();
  await expect(main.getByRole('button', { name: /Recent purchase orders \d+ row/ })).toBeVisible();
  await expect(main.getByRole('button', { name: 'New PO' })).toBeVisible();
  // Select the finalized PO so the dynamic primary button label reads "Approve PO"
  // Use force: true to avoid AG Grid row detach race during virtualization
  const poRow = page.locator('.ag-row', { hasText: 'PO-DEMO-003' });
  await expect(poRow).toBeVisible({ timeout: 15000 });
  await poRow.click({ force: true });
  // Two "Approve PO" buttons are visible when a finalized PO is selected (toolbar + compact header);
  // use .first() to avoid strict-mode violation while confirming the button is present.
  await expect(main.getByRole('button', { name: 'Approve PO' }).first()).toBeVisible();
  // Expand the first row to verify row-level actions (the "More" tray button was replaced by inline expansion chevron).
  // AG Grid re-renders rows after row selection (virtualization), which can detach the expand
  // button before the click lands. Wait for the element to be attached and visible first.
  await page.waitForTimeout(300);
  const expandBtn = page.locator('[aria-label="Expand row details"]').first();
  await expect(expandBtn).toBeAttached({ timeout: 10000 });
  await expect(expandBtn).toBeVisible({ timeout: 5000 });
  await expandBtn.click({ force: true });
  await expect(main.getByRole('button', { name: 'Draft intake' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Cancel draft PO' })).toBeVisible();
  await expect(main.getByRole('button', { name: /Lines Procurement cost lines/ })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Draft selected lines' })).toBeVisible();

  await nav.getByRole('button', { name: /Intake/ }).click();
  await expect(page.getByText('Intake queue')).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV import' })).toBeVisible();
  await page.getByRole('button', { name: 'CSV import' }).click();
  await expect(page.getByText('Validate-first CSV import')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();

  await nav.getByRole('button', { name: /Sales/ }).click();
  await page.getByRole('button', { name: 'Sale tray' }).click();
  await expect(page.getByRole('button', { name: 'Reserve' }).first()).toBeVisible();

  await nav.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pick list' })).toBeVisible();

  await nav.getByRole('button', { name: /Payments/ }).click();
  await expect(page.getByRole('button', { name: 'Receiving', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paying', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Types' }).first()).toBeVisible();
  await expect(page.getByText('Product payment').first()).toBeVisible();
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
  // "Inventory controls" section heading was removed; row actions now live behind a
  // "Row actions" toggle that appears in SelectionSummary only after a row is selected.
  await page.locator('.ag-root:visible').first().locator('.ag-center-cols-container .ag-row').first().click();
  await page.getByRole('button', { name: 'Row actions' }).click();
  await expect(page.getByRole('button', { name: 'Set status' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move location' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move ownership' })).toBeVisible();
  await expect(page.getByText('Photo URL/path')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach' })).toBeVisible();

  await nav.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('tab', { name: 'Requests' }).click();
  await expect(page.getByText('Inbound Requests')).toBeVisible();
  await expect(page.getByText('VIP customer').first()).toBeVisible();
  await expect(page.getByText('Live order').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Route' })).toHaveCount(0);
  await expect(page.getByText(/routed/i)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Action log' }).click();
  await expect(page.getByRole('button', { name: /Action Log \d+ row/ })).toBeVisible();
  await expect(page.getByText('Command Name')).toHaveCount(0);
  await expect(page.getByText('createSalesOrder')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Admin tools' })).toBeVisible();
  await page.getByRole('tab', { name: 'Archive' }).click();
  await expect(page.getByText('Archive Runs')).toBeVisible();
});
