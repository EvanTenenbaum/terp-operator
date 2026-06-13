// Step 20: hunt for auto-apply control robustly
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
  await page.waitForTimeout(2500);

  const hits = await page.evaluate(() => [...document.querySelectorAll('button,a,[role=button],span,div')].filter(e => /auto[\s-]?apply/i.test(e.textContent||'') && e.textContent.length < 80).map(e => ({ tag: e.tagName, txt: e.textContent.trim().slice(0,60), btn: e.tagName==='BUTTON' })));
  console.log('auto-apply hits:', JSON.stringify(hits, null, 1));
  // also dump full visible text near the panel
  const txt = await page.evaluate(() => {
    const m = document.body.innerText.match(/Payment allocations[\s\S]{0,900}/);
    return m ? m[0] : 'no match';
  });
  console.log('PANEL VISIBLE TEXT:\n', txt);
  await d.shot('20-panel-state');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
