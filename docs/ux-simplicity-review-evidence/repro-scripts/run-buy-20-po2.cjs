const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('owner@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(900);
  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Upland Craft Farm' });
  await page.waitForTimeout(400);
  const grid = page.getByRole('region', { name: 'New PO lines' });
  async function setCell(rowIdx, colId, value) {
    await nukeOverlay(page);
    const cell = grid.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
  }
  await setCell(0, 'productName', 'QA Solo Kush');
  await setCell(0, 'unitCost', '100');
  await setCell(0, 'qty', '4');
  const approveBtn = grid.getByRole('button', { name: 'Approve PO' });
  console.log('Approve PO disabled?', await approveBtn.isDisabled(), 'title:', await approveBtn.getAttribute('title'));
  await approveBtn.click();
  await page.waitForTimeout(3500);
  await snap(page, '20-po2-after-approve');
  console.log('TOASTS:', JSON.stringify(toastLog, null, 1));
  // find PO number
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('Upland');
  await page.waitForTimeout(900);
  console.log('Upland pinned:', JSON.stringify(await list.locator('.ag-pinned-left-cols-container .ag-row').allInnerTexts()));
  console.log('Upland center:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
