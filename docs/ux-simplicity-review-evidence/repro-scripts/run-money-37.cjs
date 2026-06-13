// Step 37: dashboard money drilldowns
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(5000);

  const sections = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].map(h => h.textContent.trim().replace(/\s+/g,' ').slice(0,60)));
  console.log('sections:', JSON.stringify(sections));

  // KPI card click: CASH/FILES ON HAND
  const kpi = page.getByText('CASH/FILES ON HAND', { exact: false }).first();
  // find clickable ancestor
  const kpiClickable = await kpi.evaluate(el => {
    let e = el; while (e && e.tagName !== 'BUTTON' && e.tagName !== 'A' && !e.onclick) e = e.parentElement;
    return e ? e.tagName : 'none';
  });
  console.log('KPI clickable ancestor:', kpiClickable);
  await kpi.click();
  await page.waitForTimeout(2500);
  console.log('after KPI click url:', page.url());
  await d.shot('37-after-kpi-click');

  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(4000);
  // Money buckets section
  const mb = await page.evaluate(() => (document.body.innerText.match(/Money buckets[\s\S]{0,400}/i)||['not found'])[0].replace(/\n+/g,' | ').slice(0,400));
  console.log('money buckets:', mb);
  const cw = await page.evaluate(() => (document.body.innerText.match(/Credit watch[\s\S]{0,400}/i)||['not found'])[0].replace(/\n+/g,' | ').slice(0,400));
  console.log('credit watch:', cw);
  await d.shot('37-dashboard-mid');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
