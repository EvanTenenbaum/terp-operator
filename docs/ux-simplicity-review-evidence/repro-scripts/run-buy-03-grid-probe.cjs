const { launch, snap, aria } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' });
  await page.waitForTimeout(500);

  const grid = page.getByRole('region', { name: 'New PO lines' });
  // find product/strain cell in first data row: it is the empty gridcell next to gridcell "1"
  const row1 = grid.getByRole('row').filter({ has: page.getByRole('gridcell', { name: '1', exact: true }) }).first();
  const cells = row1.getByRole('gridcell');
  console.log('row1 cell count:', await cells.count());
  const prodCell = cells.nth(1);
  await prodCell.dblclick();
  await page.waitForTimeout(500);
  // what editor appeared?
  const active = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? { tag: a.tagName, type: a.type || null, cls: (a.className || '').slice(0, 120), aria: a.getAttribute('aria-label'), val: a.value ?? null } : null;
  });
  console.log('active after dblclick product cell:', JSON.stringify(active));
  await page.keyboard.type('Test Strain Alpha');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const active2 = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? { tag: a.tagName, type: a.type || null, aria: a.getAttribute('aria-label'), val: a.value ?? null, txt: (a.innerText||'').slice(0,80) } : null;
  });
  console.log('active after Tab:', JSON.stringify(active2));
  await snap(page, '03-grid-after-type');
  console.log('--- grid aria (first 3 data rows) ---');
  const g = await aria(page, '[role="treegrid"]');
  console.log(g.slice(0, 3000));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
