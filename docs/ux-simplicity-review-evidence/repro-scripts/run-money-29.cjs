// Step 29: Vendor Payouts recon + find my payout + History tab
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/vendors');
  await page.waitForTimeout(3500);
  await d.shot('29-vendors-initial');
  const info = await page.evaluate(() => ({
    url: location.href,
    headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.textContent.trim().replace(/\s+/g,' ').slice(0,80)),
    buttons: [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean).slice(20, 70),
    text: document.body.innerText.replace(/\s+/g,' ').slice(0, 600),
  }));
  console.log(JSON.stringify(info, null, 1));

  // find my payout
  const filterBox = page.locator('input[placeholder*="filter" i]');
  console.log('filter boxes:', await filterBox.count());
  if (await filterBox.count()) {
    await filterBox.first().fill('Boulder');
    await page.waitForTimeout(1500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0,8).map(r => r.textContent.replace(/\s+/g,' ').slice(0,150)));
    console.log('Boulder rows:', JSON.stringify(rows, null, 1));
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
