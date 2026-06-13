const { launch, snap, readToasts, nukeOverlay, aria, ROOT } = require('./buy-lib.cjs');
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

  async function setCellEnter(rowIdx, colId, value) {
    await nukeOverlay(page);
    const cell = lines.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter'); // open editor explicitly
    await page.waitForTimeout(250);
    const ed = await page.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, val: a.value ?? null }; });
    console.log(`editor after Enter on ${colId}:`, JSON.stringify(ed));
    if (ed.tag === 'INPUT' || ed.tag === 'TEXTAREA') {
      await page.keyboard.press('Meta+a');
      await page.keyboard.type(String(value));
      await page.keyboard.press('Enter');
    } else {
      console.log('editor did not open via Enter');
    }
    await page.waitForTimeout(600);
    const cell2 = lines.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first();
    console.log(`cell[${rowIdx}.${colId}] -> "${await cell2.innerText().catch(() => '?')}"`);
  }
  await setCellEnter(3, 'category', 'Flower');
  await setCellEnter(3, 'qty', '5');
  await page.waitForTimeout(500);
  await lines.locator('.ag-root').screenshot({ path: ROOT + '/shots/buy-16-lines-grid.png' });

  // summary before finalize
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));

  // FINALIZE
  await nukeOverlay(page);
  await page.getByRole('button', { name: 'Finalize PO' }).click();
  console.log('clicked Finalize');
  await page.waitForTimeout(2500);
  await snap(page, '16-after-finalize');
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  console.log('--- bar @ finalized ---');
  console.log(await aria(page, '.selection-summary').catch(() => '(no strip)'));
  const more = page.getByRole('button', { name: 'More', exact: true }).last();
  if (await more.isVisible().catch(() => false)) {
    await more.click(); await page.waitForTimeout(400);
    console.log('TRAY @ finalized:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button')].map(e => ({ text: e.innerText.trim().slice(0, 70), disabled: e.disabled ?? e.getAttribute('aria-disabled'), title: e.title || null }))), null, 1));
    await snap(page, '16-tray-finalized');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }

  // APPROVE (primary should change)
  const approve = page.getByRole('button', { name: /^Approve/ }).last();
  if (await approve.isVisible().catch(() => false)) {
    console.log('Approve visible. disabled:', await approve.isDisabled(), 'title:', await approve.getAttribute('title'));
    await approve.click();
    console.log('clicked Approve');
    await page.waitForTimeout(2500);
    await snap(page, '16-after-approve');
    console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
    console.log('--- bar @ approved ---');
    console.log(await aria(page, '.selection-summary').catch(() => '(no strip)'));
    if (await more.isVisible().catch(() => false)) {
      await more.click(); await page.waitForTimeout(400);
      console.log('TRAY @ approved:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button')].map(e => ({ text: e.innerText.trim().slice(0, 70), disabled: e.disabled ?? e.getAttribute('aria-disabled'), title: e.title || null }))), null, 1));
      await snap(page, '16-tray-approved');
      await page.keyboard.press('Escape');
    }
  } else {
    console.log('No Approve visible. bar:', await aria(page, '.selection-summary').catch(() => '(none)'));
  }
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
