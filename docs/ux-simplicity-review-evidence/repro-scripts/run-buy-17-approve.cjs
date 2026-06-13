const { launch, snap, readToasts, nukeOverlay, nukeOverlay: _, ROOT } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  await nukeOverlay(page);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('MQBMLD15-018');
  await page.waitForTimeout(700);
  // status cell text in list
  console.log('list row center:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await list.locator('.ag-cell').filter({ hasText: 'PO-MQBMLD15-018' }).first().click();
  await page.waitForTimeout(1500);
  console.log('summary after reload:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  const barBtns = await page.evaluate(() => [...document.querySelectorAll('.selection-summary button')].map(b => ({ t: b.innerText.trim(), dis: b.disabled, title: b.title || null })));
  console.log('bar buttons:', JSON.stringify(barBtns));
  await snap(page, '17-finalized-bar');

  // Approve
  const approve = page.getByRole('button', { name: /^Approve/ }).last();
  if (await approve.isVisible().catch(() => false)) {
    console.log('Approve: disabled=', await approve.isDisabled(), 'title=', await approve.getAttribute('title'));
    await approve.click();
    console.log('clicked Approve');
    await page.waitForTimeout(2500);
    await snap(page, '17-after-approve');
    console.log('summary:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
    console.log('bar buttons now:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.selection-summary button')].map(b => ({ t: b.innerText.trim(), dis: b.disabled, title: b.title || null })))));
    const more = page.getByRole('button', { name: 'More', exact: true }).last();
    if (await more.isVisible().catch(() => false)) {
      await more.click(); await page.waitForTimeout(400);
      console.log('TRAY now:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button')].map(e => ({ text: e.innerText.trim().slice(0, 70), disabled: e.disabled ?? e.getAttribute('aria-disabled'), title: e.title || null }))), null, 1));
      await snap(page, '17-tray');
      await page.keyboard.press('Escape');
    }
  } else console.log('Approve still not visible');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
