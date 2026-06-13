const { launch, snap, nukeOverlay, readToasts } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 300);
  const PO = 'PO-ACTIVE-008';
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill(PO);
  await page.waitForTimeout(900);
  await list.locator('.ag-cell').filter({ hasText: PO }).first().click();
  await page.waitForTimeout(1200);
  const lines = page.getByRole('region', { name: `${PO} Lines` });
  const lf = lines.getByRole('textbox', { name: new RegExp(`Filter ${PO} Lines`) });
  if ((await lf.inputValue().catch(() => '')) !== '') { await lf.fill(''); await page.waitForTimeout(500); }
  // set receiveQty to remainder 166.294
  await page.evaluate((poName) => {
    const reg = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === `${poName} Lines`);
    const vp = reg?.querySelector('.ag-center-cols-viewport');
    if (vp) vp.scrollLeft = vp.scrollWidth;
  }, PO);
  await page.waitForTimeout(350);
  const cell = lines.locator('.ag-row[row-index="0"] .ag-cell[col-id="receiveQty"]').first();
  await cell.click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('166.294');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  console.log('receiveQty:', await lines.locator('.ag-row[row-index="0"] .ag-cell[col-id="receiveQty"]').first().innerText());
  // receive selected qty
  await list.locator('.ag-cell').filter({ hasText: PO }).first().click();
  await page.waitForTimeout(700);
  const more = page.getByRole('button', { name: 'More', exact: true }).last();
  await more.click(); await page.waitForTimeout(400);
  await page.locator('[role="menu"] button, [role="menu"] [role="menuitem"]').filter({ hasText: 'Receive selected qty' }).first().click();
  await page.waitForTimeout(2500);
  console.log('TOASTS:', JSON.stringify(toastLog, null, 1));
  await snap(page, '36-partial2-materialized');
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
