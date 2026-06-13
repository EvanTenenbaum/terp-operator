// Step 19: find what "Auto apply to oldest" is, click it, then unallocate
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, payload: JSON.stringify(pd.payload||{}).slice(0,220), ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,160})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('active-payment-1');
  await page.waitForTimeout(2000);
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await page.waitForTimeout(2000);

  const els = await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /Auto apply to oldest/.test(e.textContent||'')).map(e => ({ tag: e.tagName, cls: (e.className||'').toString().slice(0,80), txt: e.textContent.trim().slice(0,60) })));
  console.log('auto-apply elements:', JSON.stringify(els, null, 1));

  const auto = page.getByText('Auto apply to oldest', { exact: false }).last();
  await auto.click();
  await page.waitForTimeout(2500);
  console.log('api after auto-apply click:', JSON.stringify(api, null, 1));

  const panelTxt = await page.evaluate(() => {
    let nodes = [...document.querySelectorAll('div,section')].filter(e => /allocation\(s\)/.test(e.textContent || ''));
    let el = nodes[nodes.length - 1];
    while (el && !el.querySelector('select') && el.parentElement) el = el.parentElement;
    return (el.textContent||'').trim().replace(/\s+/g,' ').slice(0, 300);
  });
  console.log('panel after:', panelTxt);
  const gridRow = await page.evaluate(() => (document.querySelector('.ag-center-cols-container .ag-row')?.textContent||'').replace(/\s+/g,' ').slice(0,200));
  console.log('grid row now:', gridRow);
  await d.shot('19-after-auto-apply');

  // allocation select options now
  const allocSel = page.locator('select').nth(await page.locator('select').count() - 2); // panel's first select
  // safer: find select whose option mentions INV- and is the Allocation select (first select in panel)
  const allSelects = await page.evaluate(() => [...document.querySelectorAll('select')].map((s,i) => ({ i, opts: [...s.options].slice(0,4).map(o => o.text.slice(0,50)) })));
  console.log('all selects:', JSON.stringify(allSelects.slice(-6), null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
