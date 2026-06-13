const { launch, snap, nukeOverlay, aria, readToasts, ROOT } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 350);
  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  const queue = page.getByRole('region', { name: 'Intake queue' });
  await queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first().locator('.ag-group-contracted').click();
  await page.waitForTimeout(1500);

  // inner table: scroll right to see all cols, dump cell tint classes
  const info = await page.evaluate(() => {
    const fw = document.querySelector('.ag-full-width-container');
    const cells = [...fw.querySelectorAll('[role="gridcell"], td, .ag-cell')].map(c => ({ col: c.getAttribute('col-id') || c.className.slice(0, 40), txt: c.innerText.trim().slice(0, 40), cls: c.className.slice(0, 120) }));
    return cells;
  });
  console.log('inner cells:', JSON.stringify(info, null, 1));

  // click Verify
  const fw = page.locator('.ag-full-width-container');
  await fw.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.waitForTimeout(1200);
  await snap(page, '31-after-verify-click');
  // dialog?
  const dialogs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map(d => (d.getAttribute('aria-label') || '(unnamed)') + ':' + d.innerText.slice(0, 120).replace(/\n/g, ' ')));
  console.log('dialogs:', JSON.stringify(dialogs, null, 1));
  const vd = page.locator('[role="dialog"]').filter({ hasNotText: 'Context drawer' }).first();
  if (await vd.isVisible().catch(() => false)) {
    console.log('VERIFY DIALOG ARIA:', await vd.ariaSnapshot());
    await snap(page, '31-verify-dialog');
  }
  console.log('TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
