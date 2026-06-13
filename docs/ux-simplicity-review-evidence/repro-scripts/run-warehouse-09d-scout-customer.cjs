// Scout customer selection on /sales
const { launch, snap } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/sales');
  await page.waitForTimeout(3000);
  const sels = await page.evaluate(() => [...document.querySelectorAll('select')].map(s => ({ label: s.getAttribute('aria-label'), opts: [...s.options].slice(0, 6).map(o => o.text) })));
  console.log('selects:', JSON.stringify(sels, null, 1).slice(0, 1500));
  const combos = await page.evaluate(() => [...document.querySelectorAll('[role="combobox"], input[list]')].map(c => ({ tag: c.tagName, label: c.getAttribute('aria-label'), ph: c.getAttribute('placeholder') })));
  console.log('combos:', JSON.stringify(combos, null, 1));
  const btns = await page.evaluate(() => [...document.querySelectorAll('.control-band button, main > div > button')].map(b => b.textContent.trim()).slice(0, 30));
  console.log('band buttons:', btns);
  await snap(page, '09d-sales-top');
  await done();
})().catch(e => { console.error(e); process.exit(1); });
