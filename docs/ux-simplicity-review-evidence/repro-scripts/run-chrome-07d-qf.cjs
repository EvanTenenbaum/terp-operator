const { start } = require('./lib-chrome.cjs');
(async () => {
  const { page, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);
  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(3500);
  const qf = page.locator('input[aria-label="Filter Inventory Batches grid"]');
  const batchRows = () => page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll('.ag-root-wrapper'));
    const root = roots.find(r => r.querySelector('.ag-header-cell[col-id="batchCode"]'));
    return root ? root.querySelectorAll('.ag-center-cols-container .ag-row').length : -1;
  });
  const subtitle = async () => page.locator('text=/^[0-9,]+ row\\(s\\)/').first().innerText().catch(() => 'n/a');
  obs('before:', await batchRows(), await subtitle());
  await qf.fill('NF-002');
  await page.waitForTimeout(1200);
  obs('after NF-002:', await batchRows(), await subtitle());
  await qf.fill('');
  await heal(); await finish();
})().catch(e => { console.error(e); process.exit(1); });
