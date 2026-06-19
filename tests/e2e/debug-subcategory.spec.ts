import { test } from '@playwright/test';

const BASE_URL = 'https://terp-agro-staging-5asc2.ondigitalocean.app';

test('TER-1670: inspect inventory grid for subcategory column', async ({ page }) => {
  console.log('\n═══ TER-1670 Debug ═══');

  // Login
  await page.goto(BASE_URL);
  await page.waitForTimeout(3000);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill('owner@terpagro.local');
    await passwordInput.fill('terp-demo');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(4000);
  }

  // Navigate to inventory
  await page.goto(`${BASE_URL}/inventory`);
  await page.waitForTimeout(5000);

  // Try to find any grid-like element
  const gridSelectors = ['.ag-root', '[role="grid"]', '[role="treegrid"]', 'table'];
  for (const sel of gridSelectors) {
    const count = await page.locator(sel).count();
    const visible = await page.locator(sel).first().isVisible().catch(() => false);
    console.log(`Selector "${sel}": count=${count} visible=${visible}`);
  }

  // Dump all header text from ANY element that looks like a column header
  const headerLocators = [
    '.ag-header-cell-text',
    '.ag-header-cell',
    '[role="columnheader"]',
    'table th',
  ];
  for (const sel of headerLocators) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      const texts: string[] = [];
      for (let i = 0; i < Math.min(count, 30); i++) {
        const txt = await page.locator(sel).nth(i).innerText().catch(() => '');
        if (txt.trim()) texts.push(txt.trim());
      }
      console.log(`Headers "${sel}" (${count}): [${texts.join(' | ')}]`);
    } else {
      console.log(`Headers "${sel}": 0 found`);
    }
  }

  // Check for 'subcategory' anywhere in the page text
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const hasSub = bodyText.toLowerCase().includes('subcategory');
  console.log(`Body contains "subcategory": ${hasSub}`);
  if (hasSub) {
    // Find where it appears
    const idx = bodyText.toLowerCase().indexOf('subcategory');
    console.log(`Context: ...${bodyText.substring(Math.max(0, idx-40), idx+50)}...`);
  }

  // Dump all [col-id] attributes on header cells
  const colIds = await page.evaluate(() => {
    const cells = document.querySelectorAll('[col-id]');
    return Array.from(cells).map(el => ({
      colId: el.getAttribute('col-id'),
      text: el.querySelector('.ag-header-cell-text')?.textContent?.trim() || '',
      display: getComputedStyle(el).display,
      visibility: getComputedStyle(el).visibility,
    }));
  });
  console.log('\n[col-id] attributes on header cells:');
  for (const c of colIds) {
    console.log(`  colId="${c.colId}" text="${c.text}" display="${c.display}" visibility="${c.visibility}"`);
  }
  console.log(`Total [col-id] cells: ${colIds.length}`);
  console.log(`Has "subcategory" col-id: ${colIds.some(c => c.colId === 'subcategory')}`);

  // Screenshot
  await page.screenshot({ path: '/tmp/debug-subcategory-inventory.png', fullPage: false });
  console.log('Screenshot saved to /tmp/debug-subcategory-inventory.png');

  // ─── SOURCE CODE FINDINGS (already confirmed by code review) ───
  console.log('\n═══ CODE-LEVEL ROOT CAUSE ═══');
  console.log('1. buildInventoryColumns() in OperationsViews.tsx:1424-1528');
  console.log('   DOES NOT include { field: "subcategory" } in column defs.');
  console.log('2. Server query for view="inventory" in queries.ts:2330');
  console.log('   DOES NOT SELECT b.subcategory from the batches table.');
  console.log('3. The subcategory field IS in purchaseOrderLineColumns (line 236)');
  console.log('   and in filter schemas, but NOT in inventory columns.');
  console.log('═══════════════════════════════');
});
