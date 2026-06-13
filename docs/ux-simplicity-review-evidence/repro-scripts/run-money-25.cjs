// Step 25: RowInspector hunt + Apply Discount reachability
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('SO-REAL-00444');
  await page.waitForTimeout(2000);
  const row = page.locator('.ag-center-cols-container .ag-row').first();
  await row.click();
  await page.waitForTimeout(1500);

  // Apply Discount reachability: select allocation 1
  const allocIdx = await page.evaluate(() => [...document.querySelectorAll('select')].findIndex(s => s.options[0] && s.options[0].text === 'Choose' && s.options.length > 1 && /INV-/.test(s.options[1].text) && s.options.length < 10));
  console.log('allocIdx:', allocIdx);
  if (allocIdx >= 0) {
    const sel = page.locator('select').nth(allocIdx);
    console.log('allocations:', JSON.stringify(await sel.evaluate(s => [...s.options].map(o => o.text))));
    await sel.selectOption({ index: 1 });
    await page.waitForTimeout(800);
    const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Unallocate|Apply Discount/.test(b.textContent)).map(b => ({ t: b.textContent.trim(), disabled: b.disabled })));
    console.log('buttons w/ allocation selected:', JSON.stringify(btns));
    // discount input?
    const discInput = await page.evaluate(() => {
      const inps = [...document.querySelectorAll('input')].filter(i => /discount/i.test(i.placeholder || i.getAttribute('aria-label') || ''));
      return inps.map(i => ({ ph: i.placeholder, aria: i.getAttribute('aria-label'), val: i.value }));
    });
    console.log('discount inputs:', JSON.stringify(discInput));
    await d.shot('25-discount-reachability');
  }

  // RowInspector: double-click the grid row
  await row.dblclick();
  await page.waitForTimeout(2000);
  let dlg = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(x => ({ tabs: [...x.querySelectorAll('[role=tab]')].map(t => t.textContent.trim()), txt: (x.textContent||'').trim().replace(/\s+/g,' ').slice(0,300) })));
  console.log('after dblclick dialogs:', JSON.stringify(dlg, null, 1));
  await d.shot('25-after-dblclick');

  // panel header expand icon (the unnamed button in panel header)
  const expandBtn = page.locator('button').filter({ hasText: /^$/ });
  console.log('empty-label buttons count:', await expandBtn.count());
  // breadcrumb at top: "PAYMENTS /" — click it?
  const crumb = await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button,div,span')].find(e => /^PAYMENTS$/i.test((e.textContent||'').trim()));
    return el ? el.tagName : 'none';
  });
  console.log('breadcrumb PAYMENTS element:', crumb);
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
