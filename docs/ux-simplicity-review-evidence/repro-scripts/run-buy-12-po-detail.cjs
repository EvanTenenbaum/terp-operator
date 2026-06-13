const { launch, snap, readToasts, nukeOverlay, aria } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBMLD15-018');
  await page.waitForTimeout(800);
  await list.locator('.ag-pinned-left-cols-container .ag-row .ag-cell[col-id="poNumber"], .ag-pinned-left-cols-container .ag-row .ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
  await page.waitForTimeout(1500);
  await snap(page, '12-po-detail-draft');
  const main = await aria(page, 'main');
  console.log(main.slice(0, 9000));
  console.log('TOASTS:', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
