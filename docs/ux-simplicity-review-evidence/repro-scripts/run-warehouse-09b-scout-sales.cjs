// Scout /sales page structure
const { launch, snap } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/sales');
  await page.waitForTimeout(3500);
  await snap(page, '09b-sales');
  const tb = await page.evaluate(() => [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].map(i => ({ ph: i.placeholder, label: i.getAttribute('aria-label') })).slice(0, 20));
  console.log('inputs:', JSON.stringify(tb, null, 1));
  const regions = await page.evaluate(() => [...document.querySelectorAll('[role="region"]')].map(r => r.getAttribute('aria-label')));
  console.log('regions:', regions);
  await done();
})().catch(e => { console.error(e); process.exit(1); });
