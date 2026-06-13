// Step 17: dump expanded allocations panel content properly
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('active-payment-1');
  await page.waitForTimeout(2000);
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    // smallest element containing "allocation(s)"
    let nodes = [...document.querySelectorAll('div,section')].filter(e => /allocation\(s\)/.test(e.textContent || ''));
    let el = nodes[nodes.length - 1];
    // walk up until it contains a select or button beyond itself
    while (el && !el.querySelector('select') && el.parentElement) el = el.parentElement;
    if (!el) return 'not found';
    return {
      text: (el.textContent||'').trim().replace(/\s+/g,' ').slice(0, 1500),
      buttons: [...el.querySelectorAll('button')].map(b => ({ t: (b.textContent||'').trim().slice(0,50), disabled: b.disabled })),
      selects: [...el.querySelectorAll('select')].map(s => ({ aria: s.getAttribute('aria-label'), val: s.value, opts: [...s.options].slice(0,10).map(o => o.text.slice(0,60)) })),
      inputs: [...el.querySelectorAll('input')].map(i => ({ aria: i.getAttribute('aria-label'), ph: i.placeholder, val: i.value, type: i.type })),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await d.shot('17-alloc-panel-expanded');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
