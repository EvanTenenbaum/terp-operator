// Step 16: deep-dive Payment allocations panel on the seeded active payment row
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,160})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('active-payment-1');
  await page.waitForTimeout(2000);
  const rows = page.locator('.ag-center-cols-container .ag-row');
  console.log('rows matching active-payment-1:', await rows.count());
  await rows.first().click();
  await page.waitForTimeout(2000);

  // Find the allocations panel
  const panel = page.locator('section,div').filter({ has: page.getByRole('heading', { name: /Payment allocations/i }) }).last();
  const panelInfo = await panel.evaluate(p => ({
    text: (p.textContent||'').trim().replace(/\s+/g,' ').slice(0, 1200),
    buttons: [...p.querySelectorAll('button')].map(b => ({ t: (b.textContent||'').trim().slice(0,40), disabled: b.disabled })),
    selects: [...p.querySelectorAll('select')].map(s => ({ aria: s.getAttribute('aria-label'), opts: [...s.options].slice(0,8).map(o => o.text.slice(0,50)) })),
    inputs: [...p.querySelectorAll('input')].map(i => ({ aria: i.getAttribute('aria-label'), ph: i.placeholder, val: i.value })),
  }));
  console.log('PANEL:', JSON.stringify(panelInfo, null, 1));
  await d.shot('16-alloc-panel');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
