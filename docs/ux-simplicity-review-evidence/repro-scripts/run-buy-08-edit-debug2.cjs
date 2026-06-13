const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  page.on('request', r => { if (['POST', 'PUT', 'PATCH'].includes(r.method())) console.log('>>', r.method(), r.url().slice(0, 120), (r.postData() || '').slice(0, 300)); });
  page.on('response', async r => { if (['POST', 'PUT', 'PATCH'].includes(r.request().method())) console.log('<<', r.status(), r.url().slice(0, 120), (await r.text().catch(() => '')).slice(0, 200)); });

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await nukeOverlay(page);
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(1200);
  await nukeOverlay(page);
  // dump rows of lines grid
  const dump = await page.evaluate(() => {
    const regions = [...document.querySelectorAll('[aria-label="New PO lines"]')];
    return regions.map(reg => {
      const rows = [...reg.querySelectorAll('.ag-center-cols-container .ag-row')];
      return { rowCount: rows.length, rowIdx: rows.map(r => r.getAttribute('row-index')).slice(0, 12) };
    });
  });
  console.log('lines grids:', JSON.stringify(dump));

  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' });
  await page.waitForTimeout(500);

  const grid = page.getByRole('region', { name: 'New PO lines' });
  const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="productName"]').first();
  console.log('cell count:', await cell.count());
  await cell.dblclick();
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => {
    const ed = document.querySelector('.ag-cell-inline-editing, .ag-popup-editor');
    const a = document.activeElement;
    return { editor: ed ? ed.outerHTML.slice(0, 400) : null, active: a ? `${a.tagName} cls=${(a.className || '').slice(0, 60)} val=${a.value ?? ''}` : null };
  });
  console.log('after dblclick:', JSON.stringify(st, null, 2));
  if (st.editor) {
    await page.keyboard.type('QA Alpha OG');
    await page.waitForTimeout(300);
    const st2 = await page.evaluate(() => {
      const a = document.activeElement; return `${a.tagName} val=${a.value ?? ''}`;
    });
    console.log('typed, active:', st2);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    console.log('cell text now:', await cell.innerText());
  }
  await snap(page, '08-edit-debug');
  // leave the draft open; cancel to keep clean
  await page.getByRole('button', { name: 'Cancel draft PO' }).click().catch(() => {});
  await page.waitForTimeout(600);
  console.log('TOASTS:', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
