const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(4500);
  const views = await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /View/.test(e.textContent) && e.textContent.trim().length < 12).map(e => ({ tag: e.tagName, txt: e.textContent.trim(), parentTag: e.parentElement.tagName, grand: (e.closest('[role=button],a,button')||{}).tagName || 'none' })).slice(0, 12));
  console.log(JSON.stringify(views, null, 1));
  // click the first leaf "View"
  await page.getByText('View', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(2500);
  console.log('url after click:', page.url());
  await d.shot('40-view-click');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
