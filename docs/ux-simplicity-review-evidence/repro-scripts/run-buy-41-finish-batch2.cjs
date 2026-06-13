const { launch, snap, nukeOverlay, readToasts, ROOT } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 300);

  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  const queue = page.getByRole('region', { name: 'Intake queue' });
  const poRow = queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first();
  await poRow.locator('.ag-group-contracted').click();
  await page.waitForTimeout(1800);
  const fw = page.locator('.ag-full-width-container');

  // dump rows w/ status
  await page.evaluate(() => { const vp = document.querySelector('.ag-full-width-container .ag-center-cols-viewport'); if (vp) vp.scrollLeft = vp.scrollWidth; });
  await page.waitForTimeout(400);
  const dump = () => page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    const out = [];
    fw2?.querySelectorAll('.ag-pinned-left-cols-container .ag-row').forEach(r => {
      const idx = r.getAttribute('row-index');
      const center = fw2.querySelector(`.ag-center-cols-container .ag-row[row-index="${idx}"]`);
      const cells = {};
      center?.querySelectorAll('.ag-cell').forEach(c => cells[c.getAttribute('col-id')] = c.innerText.trim());
      out.push({ idx, code: r.innerText.trim(), status: cells.status, qty: cells.intakeQty, reason: (cells.discrepancyReason || '').slice(0, 30) });
    });
    return out;
  });
  console.log('rows:', JSON.stringify(await dump(), null, 1));
  await page.evaluate(() => { const vp = document.querySelector('.ag-full-width-container .ag-center-cols-viewport'); if (vp) vp.scrollLeft = 0; });
  await page.waitForTimeout(300);

  // delete the duplicate (3rd row = copy). find row whose code != 155/805
  const rows = await dump();
  const dup = rows.find(r => !['BATCH-MQBNAI3X-155', 'BATCH-MQBNLV5W-805'].includes(r.code));
  console.log('dup row:', JSON.stringify(dup));
  if (dup) {
    const delBtn = fw.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${dup.idx}"], .ag-row[row-index="${dup.idx}"]`).getByRole('button', { name: 'Delete' }).first();
    await delBtn.click();
    await page.waitForTimeout(1000);
    // confirm dialog?
    const conf = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasNotText: 'Context drawer' }).first();
    if (await conf.isVisible().catch(() => false)) {
      console.log('confirm dialog:', (await conf.innerText()).slice(0, 200).replace(/\n/g, ' | '));
      await snap(page, '41-delete-confirm');
      await conf.getByRole('button', { name: /delete|confirm|yes/i }).last().click();
      await page.waitForTimeout(1200);
    }
    console.log('toasts after delete:', JSON.stringify(await readToasts(page)));
    console.log('rows now:', JSON.stringify((await dump()).map(r => r.code)));
  }

  // select remaining draft row, preview receipt
  const draftRow = fw.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'BATCH-MQBNLV5W-805' }).first();
  await draftRow.click();
  await page.waitForTimeout(700);
  console.log('strip:', JSON.stringify(await page.evaluate(() => document.querySelector('.intake-summary, [class*="strip"], [role="status"]')?.innerText?.slice(0, 200) || null)));
  const pv = page.getByRole('button', { name: 'Preview receipt' }).first();
  await pv.click();
  await page.waitForTimeout(1800);
  const drawer = page.locator('aside[aria-label="Receipt preview"]');
  if (await drawer.isVisible().catch(() => false)) {
    console.log('PREVIEW DRAWER:', (await drawer.innerText()).slice(0, 800).replace(/\n/g, ' | '));
    await snap(page, '41-preview-drawer');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else console.log('preview drawer not visible');

  // re-select row and process via ⌘⌥I
  await draftRow.click();
  await page.waitForTimeout(600);
  await page.keyboard.press('Meta+Alt+KeyI');
  await page.waitForTimeout(2500);
  console.log('toasts after process:', JSON.stringify(await readToasts(page)));
  await snap(page, '41-after-process');

  // check PO status
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2200);
  const list = page.getByRole('region', { name: 'Recent purchase orders' });
  await list.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('PO-ACTIVE-008');
  await page.waitForTimeout(900);
  console.log('PO row:', JSON.stringify(await list.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await snap(page, '41-po-final-status');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
