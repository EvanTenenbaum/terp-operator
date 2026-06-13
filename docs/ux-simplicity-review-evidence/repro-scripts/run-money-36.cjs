const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,200)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0,300)));
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(6000);
  console.log('url:', page.url());
  console.log('body text:', await page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').slice(0,500)));
  console.log('errors:', JSON.stringify(errs, null, 1));
  await d.shot('36-dashboard-direct');
  // also try clicking nav Dashboard
  await page.getByRole('button', { name: /Dashboard/ }).first().click();
  await page.waitForTimeout(5000);
  console.log('after nav click url:', page.url());
  console.log('main content text:', await page.evaluate(() => (document.querySelector('main')||document.body).innerText.replace(/\s+/g,' ').slice(0,400)));
  await d.shot('36-dashboard-navclick');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
