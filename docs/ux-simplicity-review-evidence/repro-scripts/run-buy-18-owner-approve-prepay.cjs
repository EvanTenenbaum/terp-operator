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
  await page.waitForTimeout(700);
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
  await page.waitForTimeout(1500);

  // Approve as owner
  const approve = page.getByRole('button', { name: /^Approve/ }).last();
  console.log('Approve visible:', await approve.isVisible().catch(() => false));
  await approve.click();
  await page.waitForTimeout(2500);
  console.log('toasts after approve:', JSON.stringify(await readToasts(page)));
  await snap(page, '18-after-approve-owner');

  // reload to get fresh status + bar
  await page.reload();
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBMLD15-018');
  await page.waitForTimeout(700);
  console.log('list row:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
  await page.waitForTimeout(1500);
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  console.log('bar buttons:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.selection-summary button')].map(b => ({ t: b.innerText.trim(), dis: b.disabled, title: b.title || null })))));
  await snap(page, '18-approved-bar');

  // tray @ approved
  const more = page.getByRole('button', { name: 'More', exact: true }).last();
  await more.click(); await page.waitForTimeout(400);
  console.log('TRAY @ approved:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button')].map(e => ({ text: e.innerText.trim().slice(0, 70), disabled: e.disabled ?? e.getAttribute('aria-disabled'), title: e.title || null }))), null, 1));
  await snap(page, '18-tray-approved');

  // Record prepayment via tray
  const prepayItem = page.getByRole('menuitem', { name: /prepayment/i }).or(page.locator('[role="menu"] button', { hasText: /prepayment/i })).first();
  if (await prepayItem.isVisible().catch(() => false)) {
    await prepayItem.click();
    await page.waitForTimeout(1000);
    await snap(page, '18-prepay-dialog');
    const dlg = await aria(page, '[role="dialog"]').catch(() => '(no dialog)');
    console.log('PREPAY DIALOG:', dlg);
  } else {
    console.log('no prepayment tray item; menu text:', await page.locator('[role="menu"]').innerText().catch(() => '?'));
  }
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
