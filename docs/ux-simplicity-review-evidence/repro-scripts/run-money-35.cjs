// Step 35: name->contact profile; dashboard money drilldowns
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/clients');
  await page.waitForTimeout(3000);
  await page.locator('.ag-pinned-left-cols-container .ag-row').first().getByRole('button').first().click();
  await page.waitForTimeout(2500);
  console.log('after name click url:', page.url());
  await d.shot('35-contact-profile');
  const prof = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').slice(0, 350));
  console.log('profile text:', prof);

  // Dashboard
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(3500);
  await d.shot('35-dashboard');
  const dash = await page.evaluate(() => ({
    headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.textContent.trim().replace(/\s+/g,' ').slice(0,60)),
    kpis: [...document.querySelectorAll('[class*=kpi i],[class*=card i] ')].slice(0,0),
    text: document.body.innerText.replace(/\s+/g,' ').slice(0, 1500),
  }));
  console.log(JSON.stringify(dash, null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
