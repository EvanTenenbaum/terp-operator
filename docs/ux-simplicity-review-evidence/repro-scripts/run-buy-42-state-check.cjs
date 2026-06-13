const { launch, snap, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  for (const po of ['PO-ACTIVE-008', 'PO-ACTIVE-002']) {
    await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill(po);
    await page.waitForTimeout(900);
    console.log(po, 'row:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
    await list.locator('.ag-cell').filter({ hasText: po }).first().click();
    await page.waitForTimeout(1000);
    console.log(po, 'summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
    await page.keyboard.press('Space').catch(() => {});
    await page.waitForTimeout(300);
  }
  // receipts for both POs
  await page.goto('http://localhost:5173/purchaseReceipts');
  await page.waitForTimeout(2200);
  const f = page.getByRole('textbox', { name: /Filter Purchase Receipts/ });
  for (const q of ['PO-ACTIVE-008', 'PO-ACTIVE-002']) {
    await f.fill(q);
    await page.waitForTimeout(900);
    const pin = await page.locator('main .ag-pinned-left-cols-container .ag-row').allInnerTexts();
    const cen = await page.locator('main .ag-center-cols-container .ag-row').allInnerTexts();
    console.log(q, 'receipts:', JSON.stringify(pin.map((p, i) => p.replace(/\n/g, ' ') + ' | ' + (cen[i] || '').replace(/\n/g, ' '))));
  }
  // intake queue state for 008
  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2200);
  const queue = page.getByRole('region', { name: 'Intake queue' });
  const poRow = queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first();
  console.log('008 in queue still?', await poRow.count());
  if (await poRow.count()) {
    const idx = await poRow.getAttribute('row-index');
    console.log('queue row:', JSON.stringify(await queue.locator(`.ag-center-cols-container .ag-row[row-index="${idx}"]`).allInnerTexts()));
    console.log('actions:', JSON.stringify(await queue.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${idx}"]`).allInnerTexts()));
  }
  await snap(page, '42-state');
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
