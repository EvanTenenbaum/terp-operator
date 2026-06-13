const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/clients');
  await page.waitForTimeout(3500);
  const nameBtn = page.locator('.ag-pinned-left-cols-container .ag-row').first().locator('button').filter({ hasText: /Wellness|Market|Buyers/ }).first();
  console.log('name btn:', await nameBtn.textContent());
  await nameBtn.click();
  await page.waitForTimeout(4000);
  console.log('url after name click:', page.url());
  await d.shot('47-name-click');
  // direct route probe with a real contact id
  const cid = await page.evaluate(async () => {
    const r = await fetch('/trpc/queries.clientBalances?batch=1&input=' + encodeURIComponent(JSON.stringify({0:{json:{}}})));
    return r.status;
  });
  console.log('clientBalances probe status:', cid);
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
