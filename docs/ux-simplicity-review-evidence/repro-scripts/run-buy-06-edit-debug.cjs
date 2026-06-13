const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await nukeOverlay(page);

  // First: find the draft PO I just saved (filter by Vista Verde)
  const listRegion = page.getByRole('region', { name: 'Recent purchase orders' });
  await listRegion.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('Vista');
  await page.waitForTimeout(800);
  const rows = await listRegion.locator('.ag-center-cols-container .ag-row').allInnerTexts();
  console.log('Vista rows:', JSON.stringify(rows, null, 1));
  const pinned = await listRegion.locator('.ag-pinned-left-cols-container .ag-row').allInnerTexts();
  console.log('Vista pinned:', JSON.stringify(pinned, null, 1));
  await snap(page, '06-vista-filter');

  // Now open a fresh New PO to debug editing
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(800);
  await nukeOverlay(page);
  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' });
  await page.waitForTimeout(400);
  const grid = page.getByRole('region', { name: 'New PO lines' });
  const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="productName"]').first();
  await cell.scrollIntoViewIfNeeded();
  await cell.dblclick();
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const editing = document.querySelector('.ag-cell-inline-editing');
    const popup = document.querySelector('.ag-popup-editor');
    const a = document.activeElement;
    return {
      inlineEditing: editing ? editing.outerHTML.slice(0, 300) : null,
      popup: popup ? popup.outerHTML.slice(0, 300) : null,
      active: a ? a.tagName + ' ' + (a.className || '').slice(0, 80) : null,
    };
  });
  console.log('after dblclick:', JSON.stringify(state, null, 2));
  // Try pressing Enter on the focused cell instead
  await cell.click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const state2 = await page.evaluate(() => {
    const editing = document.querySelector('.ag-cell-inline-editing');
    const a = document.activeElement;
    return { inlineEditing: editing ? editing.outerHTML.slice(0, 300) : null, active: a ? a.tagName + ' cls=' + (a.className || '').slice(0, 80) : null };
  });
  console.log('after click+Enter:', JSON.stringify(state2, null, 2));
  // try just typing while cell focused
  await page.keyboard.press('Escape');
  await cell.click();
  await page.keyboard.type('Hello');
  await page.waitForTimeout(400);
  const state3 = await page.evaluate(() => {
    const editing = document.querySelector('.ag-cell-inline-editing');
    const a = document.activeElement;
    return { inlineEditing: editing ? editing.outerHTML.slice(0, 400) : null, active: a ? a.tagName + ' val=' + (a.value ?? '') : null };
  });
  console.log('after click+type:', JSON.stringify(state3, null, 2));
  await snap(page, '06-edit-debug');
  console.log('TOASTS:', await readToasts(page));
  // cancel this draft
  await page.getByRole('button', { name: 'Cancel draft PO' }).click();
  await page.waitForTimeout(800);
  console.log('after cancel toasts:', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
