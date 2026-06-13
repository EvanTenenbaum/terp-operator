// Step 33: Client Balances recon + balance drill
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/clients');
  await page.waitForTimeout(3500);
  await d.shot('33-clients-initial');
  const info = await page.evaluate(() => ({
    headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.textContent.trim().replace(/\s+/g,' ').slice(0,80)),
    gridHeaders: [...document.querySelectorAll('.ag-header-cell-text')].map(h => h.textContent.trim()),
    rowCount: (document.body.innerText.match(/\d+ row\(s\)/)||['?'])[0],
    firstRows: [...document.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0,5).map(r => r.textContent.replace(/\s+/g,' ').slice(0,160)),
  }));
  console.log(JSON.stringify(info, null, 1));

  // click a balance cell on first row (find a currency-looking cell)
  const row = page.locator('.ag-center-cols-container .ag-row').first();
  const cells = await row.evaluate(r => [...r.querySelectorAll('.ag-cell')].map(c => ({ col: c.getAttribute('col-id'), txt: c.textContent.trim().slice(0,40) })));
  console.log('first row cells:', JSON.stringify(cells, null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
