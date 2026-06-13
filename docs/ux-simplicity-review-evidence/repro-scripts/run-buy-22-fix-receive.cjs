const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBN0Y6Y-629');
  await page.waitForTimeout(900);
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBN0Y6Y-629' }).first().click();
  await page.waitForTimeout(1500);
  const lines = page.getByRole('region', { name: 'PO-MQBN0Y6Y-629 Lines' });
  const lf = lines.getByRole('textbox', { name: /Filter PO-MQBN0Y6Y-629 Lines/ });
  if ((await lf.inputValue().catch(() => '')) !== '') { await lf.fill(''); await page.waitForTimeout(500); }
  // check available columns incl hidden (Columns menu)
  await lines.getByRole('button', { name: 'Columns' }).click();
  await page.waitForTimeout(500);
  console.log('COLUMNS MENU:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role="menu"] *, .quick-action-popover *')].filter(e => e.tagName === 'LABEL' || e.tagName === 'BUTTON' || e.type === 'checkbox').map(e => e.innerText?.trim() || e.getAttribute('aria-label')).filter(Boolean).slice(0, 40))));
  await snap(page, '22-columns-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // set subcategory on row 0
  async function setCell(rowIdx, colId, value) {
    await nukeOverlay(page);
    const cell = lines.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    console.log(`cell[${rowIdx}.${colId}] ->`, await lines.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first().innerText().catch(() => '?'));
  }
  await setCell(0, 'subcategory', 'Indoor');
  // retry receive
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBN0Y6Y-629' }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const receive = page.getByRole('button', { name: 'Receive PO' });
  await receive.click();
  console.log('clicked Receive PO (after subcategory fix)');
  await page.waitForTimeout(2500);
  await snap(page, '22-after-receive2');
  console.log('URL:', page.url());
  // reload status
  await page.reload(); await page.waitForTimeout(2200);
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBN0Y6Y-629');
  await page.waitForTimeout(900);
  console.log('list row:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
