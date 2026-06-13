// Step 1 recon: load /payments, dump structure
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);
  await d.shot('01-payments-initial');
  // Dump headings, buttons, tabs, table headers
  const info = await page.evaluate(() => {
    const txt = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const grab = (sel) => [...document.querySelectorAll(sel)].map(txt).filter(Boolean);
    return {
      headings: grab('h1,h2,h3'),
      buttons: grab('button').slice(0, 80),
      tabs: grab('[role=tab]'),
      tableHeaders: grab('th'),
      links: grab('a').slice(0, 40),
      presets: grab('[data-preset], .preset, [class*=preset]').slice(0, 30),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
