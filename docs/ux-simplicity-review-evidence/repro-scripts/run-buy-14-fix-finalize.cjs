const { launch, snap, readToasts, nukeOverlay, aria } = require('./buy-lib.cjs');
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
  let lines = page.getByRole('region', { name: 'PO-MQBMLD15-018 Lines' });
  if (!(await lines.isVisible().catch(() => false))) {
    console.log('detail not open after first click; clicking again');
    await snap(page, '14-debug-no-detail');
    await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
    await page.waitForTimeout(1200);
  }
  if (!(await lines.isVisible().catch(() => false))) {
    console.log('still no detail; main text:', (await page.locator('main').innerText()).slice(0, 400));
  }
  await lines.getByRole('textbox', { name: /Filter PO-MQBMLD15-018 Lines/ }).fill('');
  await page.waitForTimeout(500);

  async function setCell(rowIdx, colId, value) {
    await nukeOverlay(page);
    const cell = lines.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(150);
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    console.log(`cell[${rowIdx}.${colId}] -> "${await cell.innerText().catch(() => '?')}"`);
  }
  // fix line 4 (row-index 3): category + unitCost + qty
  await setCell(3, 'category', 'Flower');
  await setCell(3, 'unitCost', '300');
  await setCell(3, 'qty', '5');
  await snap(page, '14-line4-fixed');

  // re-select PO row to get action bar (selection may have moved)
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click().catch(() => {});
  await page.waitForTimeout(800);

  const fin = page.getByRole('button', { name: 'Finalize PO' });
  await fin.click();
  console.log('clicked Finalize');
  await page.waitForTimeout(2500);
  await snap(page, '14-after-finalize');
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));

  // dump action bar + tray
  console.log('--- bar after finalize ---');
  console.log(await aria(page, '.selection-summary').catch(() => 'no .selection-summary'));
  const more = page.getByRole('button', { name: 'More', exact: true }).last();
  if (await more.isVisible().catch(() => false)) {
    await more.click(); await page.waitForTimeout(400);
    const items = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button')].map(e => ({ text: e.innerText.trim().slice(0, 60), disabled: e.disabled ?? e.getAttribute('aria-disabled'), title: e.title || null })));
    console.log('TRAY @ finalized:', JSON.stringify(items, null, 1));
    await snap(page, '14-tray-finalized');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }

  // Approve
  const approve = page.getByRole('button', { name: /^Approve/ }).last();
  if (await approve.isVisible().catch(() => false)) {
    console.log('Approve disabled:', await approve.isDisabled(), 'title:', await approve.getAttribute('title'));
    await approve.click();
    console.log('clicked Approve');
    await page.waitForTimeout(2500);
    await snap(page, '14-after-approve');
    console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
    console.log('--- bar after approve ---');
    console.log(await aria(page, '.selection-summary').catch(() => 'no .selection-summary'));
    if (await more.isVisible().catch(() => false)) {
      await more.click(); await page.waitForTimeout(400);
      const items2 = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button')].map(e => ({ text: e.innerText.trim().slice(0, 60), disabled: e.disabled ?? e.getAttribute('aria-disabled'), title: e.title || null })));
      console.log('TRAY @ approved:', JSON.stringify(items2, null, 1));
      await snap(page, '14-tray-approved');
      await page.keyboard.press('Escape');
    }
  } else console.log('NO Approve button visible — dumping bar buttons:', JSON.stringify(await page.locator('main button').allInnerTexts()));

  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
