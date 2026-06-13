const { launch, snap, nukeOverlay, readToasts } = require('./buy-lib.cjs');
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
  await page.waitForTimeout(1500);
  const fw = page.locator('.ag-full-width-container');
  const statusTxt = async () => page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    const s = fw2?.querySelector('.ag-cell[col-id="status"]');
    const dr = fw2?.querySelector('.ag-cell[col-id="discrepancyReason"]');
    return { status: s?.innerText.trim(), reason: dr?.innerText.trim() };
  });
  console.log('before verify:', JSON.stringify(await statusTxt()));
  await fw.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.waitForTimeout(2000);
  console.log('after verify:', JSON.stringify(await statusTxt()));
  const idx = await poRow.getAttribute('row-index');
  console.log('actions col:', JSON.stringify(await queue.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${idx}"]`).allInnerTexts()));
  await snap(page, '34-after-verify');
  // any dialog?
  console.log('dialogs:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map(d => d.getAttribute('aria-label')))));
  console.log('TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
