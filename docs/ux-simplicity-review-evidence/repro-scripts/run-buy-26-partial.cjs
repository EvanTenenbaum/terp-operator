const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);
  const PO = 'PO-ACTIVE-005';
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill(PO);
  await page.waitForTimeout(900);
  await list.locator('.ag-cell').filter({ hasText: PO }).first().click();
  await page.waitForTimeout(1500);
  const lines = page.getByRole('region', { name: `${PO} Lines` });
  const lf = lines.getByRole('textbox', { name: new RegExp(`Filter ${PO} Lines`) });
  if ((await lf.inputValue().catch(() => '')) !== '') { await lf.fill(''); await page.waitForTimeout(500); }

  // scroll right to find receiveQty col
  await page.evaluate((poName) => {
    const reg = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === `${poName} Lines`);
    const vp = reg.querySelector('.ag-center-cols-viewport');
    vp.scrollLeft = vp.scrollWidth;
  }, PO);
  await page.waitForTimeout(400);
  const colsNow = await page.evaluate((poName) => {
    const reg = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === `${poName} Lines`);
    return [...reg.querySelectorAll('.ag-header-cell')].map(h => h.getAttribute('col-id') + ':' + h.innerText.trim());
  }, PO);
  console.log('cols rendered:', JSON.stringify(colsNow));

  async function setReceiveQty(value) {
    await nukeOverlay(page);
    const cell = lines.locator('.ag-row[row-index="0"] .ag-cell[col-id="receiveQty"]').first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    console.log('receiveQty cell ->', await lines.locator('.ag-row[row-index="0"] .ag-cell[col-id="receiveQty"]').first().innerText().catch(() => '?'));
  }

  // OVER-ASK: 50 > 34.869
  await setReceiveQty('50');
  await snap(page, '26-overask-entered');
  // select the line row (click product cell pinned)
  await lines.locator('.ag-pinned-left-cols-container .ag-row[row-index="0"]').click();
  await page.waitForTimeout(500);
  // find "Receive selected qty" — it was in PO row tray; for lines maybe in lines selection bar
  const trayBtnTexts = await page.evaluate(() => [...document.querySelectorAll('.selection-summary button')].map(b => b.innerText.trim()));
  console.log('selection bars buttons:', JSON.stringify(trayBtnTexts));
  // PO row tray version:
  await list.locator('.ag-cell').filter({ hasText: PO }).first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(600);
  const more = page.getByRole('button', { name: 'More', exact: true }).last();
  await more.click(); await page.waitForTimeout(400);
  const items = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button')].map(e => ({ text: e.innerText.trim(), disabled: e.disabled ?? e.getAttribute('aria-disabled'), title: e.title || null })));
  console.log('TRAY:', JSON.stringify(items, null, 1));
  const rsq = page.getByRole('menuitem', { name: /Receive selected qty/ }).or(page.locator('[role="menu"] button', { hasText: 'Receive selected qty' })).first();
  if (await rsq.isVisible().catch(() => false)) {
    const dis = await rsq.evaluate(e => e.disabled ?? e.getAttribute('aria-disabled'));
    console.log('Receive selected qty disabled?', dis, 'title:', await rsq.getAttribute('title'));
    if (!dis || dis === 'false') {
      await rsq.click();
      await page.waitForTimeout(2500);
      console.log('after over-ask receive click');
      await snap(page, '26-overask-result');
    } else { await page.keyboard.press('Escape'); }
  } else { await page.keyboard.press('Escape'); }
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await snap(page, '26-end');
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
