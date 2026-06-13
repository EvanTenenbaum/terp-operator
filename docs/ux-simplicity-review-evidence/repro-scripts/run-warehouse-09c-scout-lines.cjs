// Scout sales order lines grid after selecting SO-REAL-00013
const { launch, snap } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/sales');
  await page.waitForTimeout(3000);
  const fbox = page.getByLabel(/Filter Sales Orders grid/i).first();
  await fbox.fill('orderNo:SO-REAL-00013');
  await fbox.press('Enter');
  await page.waitForTimeout(2000);
  const rect = await page.evaluate(() => {
    const r = document.querySelector('.ag-center-cols-container .ag-row');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.x + 100, y: b.y + b.height / 2 };
  });
  if (rect) await page.mouse.click(rect.x, rect.y);
  await page.waitForTimeout(3000);
  // how many grids?
  const grids = await page.evaluate(() => [...document.querySelectorAll('.ag-root-wrapper')].map((g, i) => {
    const rows = g.querySelectorAll('.ag-center-cols-container .ag-row').length;
    const headers = [...g.querySelectorAll('.ag-header-cell-text')].map(h => h.textContent).join(',');
    return { i, rows, headers: headers.slice(0, 250) };
  }));
  console.log(JSON.stringify(grids, null, 1));
  // scroll each lines-like grid fully right
  await page.evaluate(() => {
    document.querySelectorAll('.ag-body-horizontal-scroll-viewport, .ag-center-cols-viewport').forEach(v => { v.scrollLeft = v.scrollWidth; });
  });
  await page.waitForTimeout(1500);
  const btns = await page.evaluate(() => [...document.querySelectorAll('.ag-root-wrapper button')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 40));
  console.log('grid buttons after h-scroll:', btns);
  await snap(page, '09c-lines-scrolled');
  await done();
})().catch(e => { console.error(e); process.exit(1); });
