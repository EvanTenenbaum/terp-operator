const { launch, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  for (const po of ['PO-ACTIVE-005', 'PO-ACTIVE-002']) {
    await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill(po);
    await page.waitForTimeout(900);
    await list.locator('.ag-cell').filter({ hasText: po }).first().click();
    await page.waitForTimeout(1500);
    const lines = page.getByRole('region', { name: `${po} Lines` });
    const lf = lines.getByRole('textbox', { name: new RegExp(`Filter ${po} Lines`) });
    if ((await lf.inputValue().catch(() => '')) !== '') { await lf.fill(''); await page.waitForTimeout(500); }
    const dump = await page.evaluate((poName) => {
      const reg = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === `${poName} Lines`);
      if (!reg) return 'no region';
      const out = [];
      reg.querySelectorAll('.ag-pinned-left-cols-container .ag-row').forEach(r => {
        const idx = r.getAttribute('row-index');
        const center = reg.querySelector(`.ag-center-cols-container .ag-row[row-index="${idx}"]`);
        const cells = {};
        center?.querySelectorAll('.ag-cell').forEach(c => cells[c.getAttribute('col-id')] = c.innerText.trim());
        out.push({ product: r.innerText.replace(/\n/g, ' ').slice(0, 40), cat: cells.category, sub: cells.subcategory, qty: cells.qty, recvQty: cells.receiveQty ?? cells['receive_qty'] ?? null, received: cells.received ?? null, cols: Object.keys(cells).join(',') });
      });
      return out;
    }, po);
    console.log(po, JSON.stringify(dump, null, 1));
    // deselect
    await page.keyboard.press('Space').catch(() => {});
  }
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
