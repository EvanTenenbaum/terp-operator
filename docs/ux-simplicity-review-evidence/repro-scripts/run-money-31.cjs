// Step 31: vendor payout voiding tool on MY payout
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, payload: JSON.stringify(pd.payload||{}).slice(0,200), ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,250})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/vendors');
  await page.waitForTimeout(3500);

  // Vendor select in tools panel
  const venIdx = await page.evaluate(() => [...document.querySelectorAll('select')].findIndex(s => [...s.options].some(o => o.text === 'Boulder Creek')));
  console.log('vendor select idx:', venIdx);
  const sel = page.locator('select').nth(venIdx);
  await sel.selectOption({ label: 'Boulder Creek' });
  await page.waitForTimeout(2000);
  const toolsTxt = await page.evaluate(() => (document.body.innerText.match(/Vendor bill and payout tools[\s\S]{0,800}/)||['?'])[0].replace(/\n+/g,' | ').slice(0,800));
  console.log('tools panel:', toolsTxt);
  await d.shot('31-vendor-tools-boulder');

  // list buttons in tools area
  const btns = await page.evaluate(() => {
    const m = [...document.querySelectorAll('div,section')].filter(e => /payout voiding/i.test(e.textContent||''));
    const el = m[m.length-1];
    return el ? [...el.querySelectorAll('button')].map(b => ({ t: (b.textContent||'').trim().slice(0,60), d: b.disabled })).filter(b => b.t) : [];
  });
  console.log('tool buttons:', JSON.stringify(btns, null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
