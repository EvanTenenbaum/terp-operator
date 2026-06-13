const { launch, snap, nukeOverlay, readToasts, aria } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('PO-ACTIVE-008');
  await page.waitForTimeout(900);
  console.log('PO row:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await list.locator('.ag-cell').filter({ hasText: 'PO-ACTIVE-008' }).first().click();
  await page.waitForTimeout(1200);
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  await snap(page, '35-po-after-receipt1');

  // receipts view
  await page.goto('http://localhost:5173/purchaseReceipts');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const main = await aria(page, 'main');
  console.log('--- purchaseReceipts head ---');
  console.log(main.slice(0, 2500));
  // find my receipt
  const reg = page.locator('main [role="region"], main section').first();
  const filter = page.getByRole('textbox', { name: /Filter/ }).first();
  if (await filter.isVisible().catch(() => false)) {
    await filter.fill('MQBNJOGV');
    await page.waitForTimeout(900);
    console.log('receipt rows:', JSON.stringify(await page.locator('main .ag-center-cols-container .ag-row').allInnerTexts()));
    console.log('receipt pinned:', JSON.stringify(await page.locator('main .ag-pinned-left-cols-container .ag-row').allInnerTexts()));
  }
  await snap(page, '35-receipts');
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
