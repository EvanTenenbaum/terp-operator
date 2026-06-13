const { launch, snap } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' });
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const region = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === 'New PO lines');
    const root = region || document;
    const grid = root.querySelector('.ag-root');
    const headers = [...grid.querySelectorAll('.ag-header-cell')].map(h => ({ colId: h.getAttribute('col-id'), txt: h.innerText.trim().slice(0, 30) }));
    const row0 = grid.querySelectorAll('.ag-row[row-index="0"]');
    const row0cells = [...row0].flatMap(r => [...r.querySelectorAll('.ag-cell')].map(c => ({ colId: c.getAttribute('col-id'), txt: c.innerText.trim().slice(0, 20) })));
    return { headers, row0cells };
  });
  console.log(JSON.stringify(info, null, 2));

  // try double-click product cell by col-id
  const gridRegion = page.getByRole('region', { name: 'New PO lines' });
  const prod = gridRegion.locator('.ag-row[row-index="0"] .ag-cell[col-id*="product" i], .ag-row[row-index="0"] .ag-cell[col-id*="strain" i], .ag-row[row-index="0"] .ag-cell[col-id*="name" i]').first();
  console.log('product cell found:', await prod.count());
  await done();
})().catch(e => { console.error(e); process.exit(1); });
