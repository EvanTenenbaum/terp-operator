const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(4500);
  const r = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => /^\s*View\s*$/.test(b.textContent));
    const target = btns.find(b => /CASH POSITION/.test((b.closest('div')?.parentElement?.parentElement?.textContent)||''));
    const info = btns.map(b => ((b.closest('div')?.parentElement?.parentElement?.textContent)||'').replace(/\s+/g,' ').slice(0,50));
    if (target) target.click();
    return { count: btns.length, contexts: info.slice(0,8), clicked: Boolean(target) };
  });
  console.log(JSON.stringify(r, null, 1));
  await page.waitForTimeout(2500);
  console.log('url:', page.url());
  await d.shot('41-cash-view-precise');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
