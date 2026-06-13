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

  // lines grid filter leak check
  const linesRegion = page.getByRole('region', { name: 'PO-MQBMLD15-018 Lines' });
  const linesFilter = linesRegion.getByRole('textbox', { name: /Filter PO-MQBMLD15-018 Lines/ });
  console.log('lines filter value (leak check):', await linesFilter.inputValue());
  await snap(page, '13-lines-filter-leak');
  await linesFilter.fill('');
  await page.waitForTimeout(600);
  const lineRows = await linesRegion.locator('.ag-center-cols-container .ag-row').allInnerTexts();
  const linePinned = await linesRegion.locator('.ag-pinned-left-cols-container .ag-row').allInnerTexts();
  console.log('line rows center:', JSON.stringify(lineRows, null, 1));
  console.log('line rows pinned:', JSON.stringify(linePinned, null, 1));
  await snap(page, '13-lines-after-clear');

  async function dumpActionBar(label) {
    // the selection summary strip holds primary verb + More
    const strip = page.locator('.selection-summary, [class*="selection"]').last();
    const stripAria = await aria(page, '.selection-summary').catch(() => null);
    console.log(`--- ACTION BAR @ ${label} ---`);
    if (stripAria) console.log(stripAria);
    else {
      // fallback: find buttons after "selected" text
      const btns = await page.locator('main button').allInnerTexts();
      console.log('main buttons:', JSON.stringify(btns.filter(b => b.trim())));
    }
    // open More tray
    const more = page.getByRole('button', { name: 'More', exact: true }).last();
    if (await more.isVisible().catch(() => false)) {
      await more.click();
      await page.waitForTimeout(500);
      const menu = await aria(page, '[role="menu"], .operator-context-menu, [role="dialog"]').catch(() => '(no menu found)');
      console.log('TRAY:', menu);
      // also disabled states with titles
      const items = await page.evaluate(() => {
        const els = [...document.querySelectorAll('[role="menu"] [role="menuitem"], .operator-context-menu button, [data-radix-popper-content-wrapper] button')];
        return els.map(e => ({ text: e.innerText.trim().slice(0, 60), disabled: e.disabled ?? e.getAttribute('aria-disabled'), title: e.title || null }));
      });
      console.log('TRAY ITEMS:', JSON.stringify(items, null, 1));
      await snap(page, `13-tray-${label}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else console.log('(no More button visible)');
  }

  await dumpActionBar('draft');

  // FINALIZE
  const fin = page.getByRole('button', { name: 'Finalize PO' });
  console.log('Finalize visible:', await fin.isVisible().catch(() => false), 'disabled:', await fin.isDisabled().catch(() => 'n/a'), 'title:', await fin.getAttribute('title').catch(() => null));
  await fin.click();
  await page.waitForTimeout(2000);
  await snap(page, '13-after-finalize');
  console.log('TOASTS so far:', JSON.stringify(toastLog, null, 1));
  await dumpActionBar('finalized');

  // what is the new primary?
  const summary = await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?');
  console.log('summary:', summary.replace(/\n/g, ' | '));

  // APPROVE
  const approveBtn = page.getByRole('button', { name: /Approve/ }).last();
  if (await approveBtn.isVisible().catch(() => false)) {
    console.log('Approve disabled:', await approveBtn.isDisabled(), 'title:', await approveBtn.getAttribute('title'));
    await approveBtn.click();
    await page.waitForTimeout(2000);
    await snap(page, '13-after-approve');
    await dumpActionBar('approved');
    console.log('summary after approve:', (await page.getByRole('region', { name: 'Selected purchase order summary' }).innerText().catch(() => '?')).replace(/\n/g, ' | '));
  } else console.log('No Approve button visible after finalize');

  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
