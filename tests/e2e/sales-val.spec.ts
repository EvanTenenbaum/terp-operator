import { test, expect, type Page } from '@playwright/test';

const U = 'https://terp-agro-staging-5asc2.ondigitalocean.app';

test('Sales / New Sale validation', async ({ page }) => {
  test.setTimeout(300_000);

  // ── login ──
  await page.goto(U, { waitUntil: 'networkidle' });
  const emailEl = page.locator('#email, input[type="email"]').first();
  if (await emailEl.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailEl.fill('owner@terpagro.local');
    await page.locator('#password, input[type="password"]').first().fill('terp-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 45_000 });
  console.log('1. ✅ Login');

  // ── navigate to sales ──
  await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
  await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ag-row').first()).toBeVisible({ timeout: 10_000 });
  console.log('2. ✅ Navigate to Sales — grid with data');
  await page.screenshot({ path: '/tmp/sv-02-sales.png' });

  // ── 3: customer picker (GH #350) ──
  let isSearchInput = false;
  const combo = page.locator('[role="combobox"]').first();
  isSearchInput = await combo.isVisible({ timeout: 4000 }).catch(() => false);
  if (isSearchInput) {
    await combo.click();
    await combo.fill('Cob');
    await page.waitForTimeout(400);
    const opts = await page.locator('[role="option"]').count().catch(() => 0);
    console.log(`3. ${opts > 0 ? '✅' : '⚠️'} Customer picker — ${opts > 0 ? 'searchable input (' + opts + ' options for "Cob")' : 'not filtering'}`);
  } else {
    const sel = page.locator('select[aria-label="Customer"]').first();
    const isFlat = await sel.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`3. ${isFlat ? '⚠️ FINDING' : '⚠️ FINDING'} — ${isFlat ? 'flat <select> (GH #350 not deployed)' : 'no selector found'}`);
  }
  await page.screenshot({ path: '/tmp/sv-03-picker.png' });

  // ── select customer for remaining checks ──
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (isSearchInput) {
    const val = await combo.inputValue().catch(() => '');
    if (!val.includes('Cobalt')) {
      await combo.click();
      await combo.fill('Cobalt');
      await page.waitForTimeout(500);
      const opt = page.locator('[role="option"]').filter({ hasText: 'Cobalt' }).first();
      if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await opt.click().catch(() => page.keyboard.press('Enter'));
      }
    }
  }
  await page.waitForTimeout(1000);

  // ── 4: history widget (TER-1672) ──
  const hist = page.locator('[data-testid*="history" i], [aria-label*="history" i], [aria-label*="History" i]').first();
  const hVis = await hist.isVisible({ timeout: 5000 }).catch(() => false);
  if (hVis) {
    const ae = await hist.getAttribute('aria-expanded').catch(() => null);
    const ds = await hist.getAttribute('data-state').catch(() => null);
    const closed = ae === 'false' || ds === 'closed';
    console.log(`4. ${closed ? '✅' : (ae === 'true' || ds === 'open' ? '⚠️ FINDING' : '⚠️ FINDING')} — history ${ae === 'false' || ds === 'closed' ? 'closed' : (ae === 'true' || ds === 'open' ? 'open/squished' : 'state unclear')} (aria-expanded=${ae}, data-state=${ds})`);
  } else {
    console.log('4. ⚠️ FINDING — no history widget detected');
  }
  await page.screenshot({ path: '/tmp/sv-04-history.png' });

  // ── 5: open invoices (GH #349) ──
  const inv = page.getByText(/open.*invoice/i).first();
  const iVis = await inv.isVisible({ timeout: 5000 }).catch(() => false);
  if (iVis) {
    const t = await inv.textContent().catch(() => '');
    console.log(`5. ✅ Open invoices — "${t?.substring(0, 80)}"`);
  } else {
    console.log('5. ⚠️ FINDING — no open invoice indicator');
  }
  await page.screenshot({ path: '/tmp/sv-05-invoices.png' });

  // ── 6: repeat last order (GH #352) ──
  const rpt = page.locator('button:has-text("Repeat"), button:has-text("repeat"), [data-testid="repeat"]').first();
  const rVis = await rpt.isVisible({ timeout: 4000 }).catch(() => false);
  console.log(`6. ${rVis ? '✅' : '⚠️ FINDING'} — repeat last order button ${rVis ? 'visible' : 'not found'}`);
  await page.screenshot({ path: '/tmp/sv-06-repeat.png' });

  // ── 7: filters (GH #351) ──
  const cat = page.locator('[data-testid*="category" i], label:has-text("Category"), [aria-label*="category" i]').first();
  const prc = page.locator('[data-testid*="price" i], label:has-text("Price"), [aria-label*="price bracket" i]').first();
  const age = page.locator('[data-testid*="aging" i], [data-testid*="age" i], label:has-text("Aging"), [aria-label*="age" i]').first();
  const c = await cat.isVisible({ timeout: 3000 }).catch(() => false);
  const p = await prc.isVisible({ timeout: 3000 }).catch(() => false);
  const a = await age.isVisible({ timeout: 3000 }).catch(() => false);
  const n = [c, p, a].filter(Boolean).length;
  console.log(`7. ${n >= 2 ? '✅' : '⚠️ FINDING'} — filters: Category=${c ? 'Y' : 'N'} Price=${p ? 'Y' : 'N'} Aging=${a ? 'Y' : 'N'} (${n}/3)`);
  await page.screenshot({ path: '/tmp/sv-07-filters.png' });

  // ── 8: table stability (TER-1671) ──
  const row = page.locator('.ag-row').first();
  const b1 = await row.boundingBox().catch(() => null);
  if (b1) {
    await row.click({ position: { x: 10, y: 5 } });
    await page.waitForTimeout(300);
    const b2 = await row.boundingBox();
    const shift = b2 ? Math.abs(b2.y - b1.y) : 999;
    console.log(`8. ${shift <= 20 ? '✅' : '⚠️ FINDING'} — row y-shift after click: ${Math.round(shift)}px ${shift <= 20 ? '' : '(possible flicker)'}`);
  } else {
    console.log('8. ⚠️ FINDING — could not measure row position');
  }
  await page.screenshot({ path: '/tmp/sv-08-stability.png' });

  // ── 9: right-click context menu (GH #356) ──
  await row.click({ button: 'right' });
  await page.waitForTimeout(800);
  const menu = page.locator('.ag-menu:visible, .ag-context-menu:visible, [role="menu"]:visible').first();
  const mVis = await menu.isVisible({ timeout: 3000 }).catch(() => false);
  if (mVis) {
    const items = await menu.locator('[role="menuitem"], .ag-menu-option').all();
    const t: string[] = [];
    for (const it of items.slice(0, 6)) {
      const tx = await it.innerText().catch(() => '');
      if (tx.trim()) t.push(tx.trim().substring(0, 40));
    }
    console.log(`9. ✅ Context menu — ${t.length} items: ${t.join(' | ')}`);
  } else {
    console.log('9. ⚠️ FINDING — no context menu after right-click');
  }
  await page.screenshot({ path: '/tmp/sv-09-menu.png' });
  await page.keyboard.press('Escape');

  // ── 10: subcategory column (TER-1670) ──
  const sub = page.locator('.ag-header-cell:has-text("Subcategory"), .ag-header-cell:has-text("subcategory"), [col-id="subcategory"]').first();
  const sVis = await sub.isVisible({ timeout: 5000 }).catch(() => false);
  if (sVis) {
    console.log('10. ✅ Subcategory column visible');
  } else {
    const hdrs = await page.locator('.ag-header-cell-text').all();
    const htxt: string[] = [];
    for (const h of hdrs) {
      const tx = await h.innerText().catch(() => '');
      if (tx.trim()) htxt.push(tx.trim());
    }
    console.log(`10. ⚠️ FINDING — subcategory not found. Columns: ${htxt.join(' | ')}`);
  }
  await page.screenshot({ path: '/tmp/sv-10-subcategory.png' });

  console.log('\n══════ DONE ══════');
});
