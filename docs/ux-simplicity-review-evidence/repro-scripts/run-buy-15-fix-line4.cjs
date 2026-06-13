const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBMLD15-018');
  await page.waitForTimeout(700);
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
  await page.waitForTimeout(1200);
  const lines = page.getByRole('region', { name: 'PO-MQBMLD15-018 Lines' });
  if (!(await lines.isVisible().catch(() => false))) {
    await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
    await page.waitForTimeout(1200);
  }
  const lf = lines.getByRole('textbox', { name: /Filter PO-MQBMLD15-018 Lines/ });
  if ((await lf.inputValue()) !== '') { await lf.fill(''); await page.waitForTimeout(500); }

  async function rowIdxOf(product) {
    return page.evaluate((p) => {
      const reg = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label')?.includes('Lines') && e.getAttribute('aria-label')?.includes('MQBMLD15-018'));
      const rows = [...reg.querySelectorAll('.ag-pinned-left-cols-container .ag-row')];
      for (const r of rows) if (r.innerText.includes(p)) return r.getAttribute('row-index');
      return null;
    }, product);
  }
  async function setCell(product, colId, value) {
    await nukeOverlay(page);
    const idx = await rowIdxOf(product);
    if (idx == null) { console.log('row not found for', product); return; }
    const cell = lines.locator(`.ag-row[row-index="${idx}"] .ag-cell[col-id="${colId}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(200);
    // check what editor opens on typing
    await page.keyboard.type(String(value)[0]);
    await page.waitForTimeout(250);
    const edInfo = await page.evaluate(() => {
      const a = document.activeElement;
      return { tag: a.tagName, cls: (a.className || '').toString().slice(0, 60), val: a.value ?? null, isSelect: a.tagName === 'SELECT' };
    });
    console.log(`editor for ${colId}:`, JSON.stringify(edInfo));
    await page.keyboard.type(String(value).slice(1));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const idx2 = await rowIdxOf(product);
    const txt = await lines.locator(`.ag-row[row-index="${idx2}"] .ag-cell[col-id="${colId}"]`).first().innerText().catch(() => '?');
    console.log(`cell[${product}.${colId}] -> "${txt}"`);
  }
  await setCell('QA Delta Diesel', 'category', 'Flower');
  await setCell('QA Delta Diesel', 'qty', '5');
  // verify all line values
  await page.waitForTimeout(500);
  const dump = await page.evaluate(() => {
    const reg = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label')?.includes('MQBMLD15-018 Lines'));
    const out = [];
    const pin = [...reg.querySelectorAll('.ag-pinned-left-cols-container .ag-row')];
    for (const r of pin) {
      const idx = r.getAttribute('row-index');
      const center = reg.querySelector(`.ag-center-cols-container .ag-row[row-index="${idx}"]`);
      const cells = {};
      center?.querySelectorAll('.ag-cell').forEach(c => cells[c.getAttribute('col-id')] = c.innerText.trim());
      out.push({ idx, product: r.innerText.replace(/\n/g, ' '), ...cells });
    }
    return out;
  });
  console.log('LINES:', JSON.stringify(dump, null, 1));
  await snap(page, '15-lines-final');
  console.log('TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
