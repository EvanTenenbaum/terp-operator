const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);
  const PO = 'PO-ACTIVE-008';
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  const selectPo = async () => {
    await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill(PO);
    await page.waitForTimeout(900);
    await list.locator('.ag-cell').filter({ hasText: PO }).first().click();
    await page.waitForTimeout(1200);
  };
  await selectPo();
  const lines = page.getByRole('region', { name: `${PO} Lines` });
  const lf = lines.getByRole('textbox', { name: new RegExp(`Filter ${PO} Lines`) });
  if ((await lf.inputValue().catch(() => '')) !== '') { await lf.fill(''); await page.waitForTimeout(500); }

  async function setCell(colId, value) {
    await nukeOverlay(page);
    await page.evaluate(([poName, cid]) => {
      const reg = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === `${poName} Lines`);
      const vp = reg?.querySelector('.ag-center-cols-viewport');
      if (vp) vp.scrollLeft = ['receiveQty', 'receivedQty', 'status', 'internalNotes', 'tags'].includes(cid) ? vp.scrollWidth : 0;
    }, [PO, colId]);
    await page.waitForTimeout(350);
    const cell = lines.locator(`.ag-row[row-index="0"] .ag-cell[col-id="${colId}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    console.log(`cell[${colId}] ->`, JSON.stringify(await lines.locator(`.ag-row[row-index="0"] .ag-cell[col-id="${colId}"]`).first().innerText().catch(() => '?')));
  }
  // 1. subcategory fix
  await setCell('subcategory', 'House');
  console.log('toasts after subcat:', JSON.stringify(await readToasts(page)));

  // 2. partial receive 100
  await setCell('receiveQty', '100');
  // select PO row & receive selected qty
  await selectPo();
  const more = page.getByRole('button', { name: 'More', exact: true }).last();
  await more.click(); await page.waitForTimeout(400);
  const rsq = page.locator('[role="menu"] button, [role="menu"] [role="menuitem"]').filter({ hasText: 'Receive selected qty' }).first();
  console.log('rsq disabled?', await rsq.evaluate(e => e.disabled ?? e.getAttribute('aria-disabled')), 'title:', await rsq.getAttribute('title'));
  await rsq.click({ force: true }).catch(async e => { console.log('rsq click err', e.message.slice(0, 100)); });
  await page.waitForTimeout(2500);
  await snap(page, '28-after-partial-100');
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  // reload to check status
  await page.reload(); await page.waitForTimeout(2200);
  await nukeOverlay(page);
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill(PO);
  await page.waitForTimeout(900);
  console.log('list row after partial:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await snap(page, '28-status-after-partial');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
