const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('PO-ACTIVE-008');
  await page.waitForTimeout(900);
  await list.locator('.ag-cell').filter({ hasText: 'PO-ACTIVE-008' }).first().click();
  await page.waitForTimeout(1500);
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  await snap(page, '24-before-receive');
  const receive = page.getByRole('button', { name: 'Receive PO' });
  await receive.click();
  console.log('clicked Receive PO');
  await page.waitForTimeout(1500);
  // check for confirm dialog (not the context drawer)
  const dialogs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map(d => d.getAttribute('aria-label') || d.querySelector('h1,h2,h3')?.innerText || '(unnamed)'));
  console.log('dialogs:', JSON.stringify(dialogs));
  const confirmDlg = page.locator('[role="dialog"]').filter({ hasNotText: 'Context drawer' }).first();
  if (await confirmDlg.isVisible().catch(() => false)) {
    console.log('CONFIRM DIALOG:', await confirmDlg.ariaSnapshot().catch(() => '?'));
    await snap(page, '24-receive-dialog');
    const btn = confirmDlg.getByRole('button', { name: /receive|confirm/i }).last();
    if (await btn.isVisible().catch(() => false)) { await btn.click(); console.log('confirmed'); }
  }
  await page.waitForTimeout(3000);
  await snap(page, '24-after-receive');
  console.log('URL:', page.url());
  console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  await page.reload(); await page.waitForTimeout(2200);
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('PO-ACTIVE-008');
  await page.waitForTimeout(900);
  console.log('list row after:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await snap(page, '24-after-reload');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
