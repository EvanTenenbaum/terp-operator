// Step 24: with order selected, click "Auto-apply oldest" and see what it actually does
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, payload: JSON.stringify(pd.payload||{}).slice(0,300), ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,250})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('SO-REAL-00444');
  await page.waitForTimeout(2000);
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await page.waitForTimeout(2000);

  const ordIdx = await page.evaluate(() => [...document.querySelectorAll('select')].findIndex(s => s.options[0] && s.options[0].text === 'Choose order'));
  const ord = page.locator('select').nth(ordIdx);
  const optIdx = await ord.evaluate(s => [...s.options].findIndex(o => /INV-REAL-00444/.test(o.text)));
  await ord.selectOption({ index: optIdx });
  await page.waitForTimeout(1000);
  await d.shot('24-before-apply');
  await page.getByRole('button', { name: /Auto-apply oldest/ }).click();
  await page.waitForTimeout(3000);
  console.log('api:', JSON.stringify(api, null, 1));
  const panel = await page.evaluate(() => (document.body.innerText.match(/Payment allocations[\s\S]{0,200}/)||['?'])[0].split('\n').slice(0,7).join(' | '));
  console.log('panel:', panel);
  console.log('grid row:', await page.evaluate(() => (document.querySelector('.ag-center-cols-container .ag-row')?.textContent||'').replace(/\s+/g,' ').slice(0,180)));
  await d.shot('24-after-apply');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
