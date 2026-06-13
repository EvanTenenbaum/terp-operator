const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(4500);
  const list = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /View/.test(b.textContent) && b.textContent.length < 80).map((b,i) => ({ i, t: b.textContent.replace(/\s+/g,' ').trim().slice(0,70) })));
  console.log(JSON.stringify(list, null, 1));
  const r = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => /CASH POSITION/.test(b.textContent) && b.textContent.length < 120);
    if (btns[0]) { btns[0].click(); return btns[0].textContent.replace(/\s+/g,' ').slice(0,80); }
    return 'none';
  });
  console.log('clicked card:', r);
  await page.waitForTimeout(2500);
  console.log('url:', page.url());
  await d.shot('42-cash-card-click');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
