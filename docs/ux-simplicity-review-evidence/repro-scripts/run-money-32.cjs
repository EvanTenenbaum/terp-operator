const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/vendors');
  await page.waitForTimeout(3500);
  const venIdx = await page.evaluate(() => [...document.querySelectorAll('select')].findIndex(s => [...s.options].some(o => o.text === 'Boulder Creek')));
  await page.locator('select').nth(venIdx).selectOption({ label: 'Boulder Creek' });
  await page.waitForTimeout(2500);
  const sels = await page.evaluate(() => [...document.querySelectorAll('select')].slice(0,6).map((s,i) => ({ i, val: s.value, opts: [...s.options].map(o => o.text.slice(0,50)).slice(0,12) })));
  console.log(JSON.stringify(sels, null, 1));
  // payout count text
  console.log('payout count:', await page.evaluate(() => (document.body.innerText.match(/\d+ payout\(s\)/)||['?'])[0]));
  await d.shot('32-bill-select');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
