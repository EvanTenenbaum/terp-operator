const { launch, snap, nukeOverlay, readToasts } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  const queue = page.getByRole('region', { name: 'Intake queue' });
  const poRow = queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first();
  await poRow.locator('.ag-group-contracted').click();
  await page.waitForTimeout(1500);
  // scroll inner grid right fully and dump everything
  const dump = await page.evaluate(() => {
    const fw = document.querySelector('.ag-full-width-container');
    const grids = [...fw.querySelectorAll('.ag-root')];
    const out = [];
    for (const g of grids) {
      const vp = g.querySelector('.ag-center-cols-viewport');
      const headers = [...g.querySelectorAll('.ag-header-cell')].map(h => h.getAttribute('col-id'));
      out.push({ headers });
    }
    return out;
  });
  console.log('inner grids:', JSON.stringify(dump, null, 1));
  // scroll right
  await page.evaluate(() => {
    const vp = document.querySelector('.ag-full-width-container .ag-center-cols-viewport');
    if (vp) vp.scrollLeft = vp.scrollWidth;
  });
  await page.waitForTimeout(500);
  const cells = await page.evaluate(() => {
    const fw = document.querySelector('.ag-full-width-container');
    return [...fw.querySelectorAll('.ag-cell')].map(c => ({ col: c.getAttribute('col-id'), txt: c.innerText.trim().slice(0, 60), cls: (c.className.match(/tint|yellow|red|warn|danger|discrep/gi) || []).join(',') }));
  });
  console.log('cells (scrolled right):', JSON.stringify(cells, null, 1));
  await snap(page, '33-inner-right');
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
