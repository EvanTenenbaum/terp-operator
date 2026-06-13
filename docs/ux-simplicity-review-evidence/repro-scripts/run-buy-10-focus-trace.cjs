const { launch, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await nukeOverlay(page);
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' });
  await page.waitForTimeout(500);

  // instrument focus/blur
  await page.evaluate(() => {
    window.__focusLog = [];
    document.addEventListener('focusin', e => window.__focusLog.push(['focusin', e.target.tagName, (e.target.className || '').toString().slice(0, 60), performance.now() | 0]), true);
    document.addEventListener('focusout', e => window.__focusLog.push(['focusout', e.target.tagName, (e.target.className || '').toString().slice(0, 60), performance.now() | 0]), true);
  });
  const grid = page.getByRole('region', { name: 'New PO lines' });
  const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="unitCost"]').first();
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.waitForTimeout(800);
  console.log('focus log:', JSON.stringify(await page.evaluate(() => window.__focusLog), null, 1));
  console.log('activeElement:', await page.evaluate(() => document.activeElement.tagName + '.' + (document.activeElement.className || '').toString().slice(0, 60)));
  // Now force focus the cell and try typing
  await page.evaluate(() => {
    const c = document.querySelector('[aria-label="New PO lines"] .ag-row[row-index="0"] .ag-cell[col-id="unitCost"]');
    c.focus();
  });
  await page.keyboard.type('4');
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => {
    const ed = document.querySelector('.ag-cell-inline-editing, .ag-popup-editor');
    const a = document.activeElement;
    return { ed: ed ? ed.className.slice(0, 60) : null, active: a.tagName + ' val=' + (a.value ?? '') };
  });
  console.log('after manual focus + type:', JSON.stringify(st));
  if (st.ed) {
    await page.keyboard.type('00');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    console.log('cell value now:', await cell.innerText());
  }
  await page.getByRole('button', { name: 'Cancel draft PO' }).click().catch(() => {});
  await done();
})().catch(e => { console.error(e); process.exit(1); });
