const { launch, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('status:approved');
  await page.waitForTimeout(900);
  const pinned = await list.locator('.ag-pinned-left-cols-container .ag-row').allInnerTexts();
  const center = await list.locator('.ag-center-cols-container .ag-row').allInnerTexts();
  pinned.forEach((p, i) => console.log(p.replace(/\n/g, ' '), '||', (center[i] || '').replace(/\n/g, ' ')));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
