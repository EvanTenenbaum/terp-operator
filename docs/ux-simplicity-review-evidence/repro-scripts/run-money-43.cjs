const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(4500);
  for (const name of ['Cash Position', 'What we owe vendors', 'What clients owe']) {
    await page.locator('button').filter({ hasText: name }).first().click();
    await page.waitForTimeout(2500);
    console.log(name, '->', page.url());
    await d.shot('43-' + name.replace(/\s+/g,'-').toLowerCase());
    await page.goto('http://localhost:5173/dashboard');
    await page.waitForTimeout(3500);
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
