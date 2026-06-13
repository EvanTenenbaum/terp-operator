const { launch, snap, readToasts, nukeOverlay, aria } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('owner@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBMLD15-018');
  await page.waitForTimeout(900);
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
  await page.waitForTimeout(1500);
  const more = page.getByRole('button', { name: 'More', exact: true }).last();
  await more.click(); await page.waitForTimeout(400);
  await page.getByRole('menuitem', { name: /prepayment/i }).or(page.locator('[role="menu"] button', { hasText: /prepayment/i })).first().click();
  await page.waitForTimeout(900);
  const dlg = page.getByRole('dialog', { name: 'Record Prepayment' });
  console.log('DIALOG ARIA:');
  console.log(await dlg.ariaSnapshot());
  await snap(page, '19-prepay-dialog');
  // fill amount if needed and submit
  const amt = dlg.getByRole('spinbutton').or(dlg.locator('input[type="number"]')).first();
  if (await amt.isVisible().catch(() => false)) {
    console.log('amount prefilled:', await amt.inputValue());
    await amt.fill('500'); await dlg.getByRole('textbox', { name: /Reference/ }).fill('QA-CASH-1'); await dlg.getByRole('combobox', { name: 'Method' }).selectOption({ label: 'Cash' }); await amt.fill('250');
  }
  const submit = dlg.getByRole('button', { name: /record|save|confirm/i }).last();
  console.log('submit btn:', await submit.innerText());
  await submit.click();
  await page.waitForTimeout(2000);
  await snap(page, '19-after-prepay');
  console.log('toasts:', JSON.stringify(await readToasts(page)));
  // where does prepaid show?
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  // reload and check list columns
  await page.reload(); await page.waitForTimeout(2200);
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBMLD15-018');
  await page.waitForTimeout(900);
  console.log('list row after prepay:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
  await page.waitForTimeout(1200);
  console.log('summary after reload:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  await snap(page, '19-prepaid-listrow');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
