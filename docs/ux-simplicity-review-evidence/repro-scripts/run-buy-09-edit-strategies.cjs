const { launch, snap, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await nukeOverlay(page);
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(1000);
  await nukeOverlay(page);
  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' });
  await page.waitForTimeout(500);
  const grid = page.getByRole('region', { name: 'New PO lines' });
  const edState = () => page.evaluate(() => {
    const ed = document.querySelector('.ag-cell-inline-editing, .ag-popup-editor, .ag-text-field-input:focus, input:focus, textarea:focus');
    const a = document.activeElement;
    return { ed: ed ? ed.tagName + '.' + (ed.className || '').slice(0, 50) : null, active: a ? a.tagName + '.' + (a.className || '').slice(0, 50) + ' val=' + (a.value ?? '') : null };
  });

  const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="unitCost"]').first();
  await cell.scrollIntoViewIfNeeded();

  console.log('--- strategy A: single click then F2 ---');
  await cell.click();
  await page.keyboard.press('F2');
  await page.waitForTimeout(400);
  console.log(JSON.stringify(await edState()));
  await page.keyboard.press('Escape');

  console.log('--- strategy B: single click then Enter ---');
  await cell.click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  console.log(JSON.stringify(await edState()));
  await page.keyboard.press('Escape');

  console.log('--- strategy C: single click then type digit ---');
  await cell.click();
  await page.keyboard.type('4');
  await page.waitForTimeout(400);
  console.log(JSON.stringify(await edState()));
  await page.keyboard.press('Escape');

  console.log('--- strategy D: dblclick ---');
  await cell.dblclick();
  await page.waitForTimeout(400);
  console.log(JSON.stringify(await edState()));

  // is the cell maybe covered? elementFromPoint check
  const cover = await cell.evaluate(el => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return t ? t.tagName + '.' + (t.className || '').toString().slice(0, 80) : null;
  });
  console.log('elementFromPoint over cell:', cover);
  await snap(page, '09-strategies');
  await page.getByRole('button', { name: 'Cancel draft PO' }).click().catch(() => {});
  await done();
})().catch(e => { console.error(e); process.exit(1); });
