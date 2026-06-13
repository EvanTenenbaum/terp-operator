const { launch, snap, readToasts, nukeOverlay, aria } = require('./buy-lib.cjs');
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
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  console.log('bar:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.selection-summary button')].map(b => ({ t: b.innerText.trim(), dis: b.disabled, title: b.title || null })))));

  const receive = page.getByRole('button', { name: 'Receive PO' });
  await receive.click();
  console.log('clicked Receive PO');
  await page.waitForTimeout(1200);
  await snap(page, '21-receive-clicked');
  // dialog?
  const dlg = page.getByRole('dialog').first();
  if (await dlg.isVisible().catch(() => false)) {
    console.log('DIALOG:', await dlg.ariaSnapshot());
    const confirm = dlg.getByRole('button', { name: /receive|confirm|yes/i }).last();
    if (await confirm.isVisible().catch(() => false)) { console.log('confirm btn:', await confirm.innerText()); await confirm.click(); }
    await page.waitForTimeout(2500);
  } else {
    await page.waitForTimeout(2000);
  }
  await snap(page, '21-after-receive');
  console.log('URL now:', page.url());
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  // reload check status
  await page.reload(); await page.waitForTimeout(2200);
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBN0Y6Y-629');
  await page.waitForTimeout(900);
  console.log('list row:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await snap(page, '21-after-receive-reload');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
