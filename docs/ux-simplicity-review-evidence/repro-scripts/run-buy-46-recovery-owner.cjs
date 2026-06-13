const { launch, snap, nukeOverlay, readToasts, aria } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  // 1. confirm /recovery direct as intake
  await page.goto('http://localhost:5173/recovery');
  await page.waitForTimeout(2000);
  console.log('intake direct /recovery URL:', page.url());
  console.log('main head:', (await page.locator('main').innerText().catch(() => '?')).slice(0, 200).replace(/\n/g, ' | '));
  await snap(page, '46-recovery-as-intake');
  await done();

  // 2. as owner
  const o = await launch('owner@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(o.page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 300);
  await o.page.goto('http://localhost:5173/intake');
  await o.page.waitForTimeout(2500);
  await nukeOverlay(o.page);
  const queue = o.page.getByRole('region', { name: 'Intake queue' });
  const poRow = queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first();
  await poRow.locator('.ag-group-contracted').click();
  await o.page.waitForTimeout(1800);
  const fw = o.page.locator('.ag-full-width-container');
  const idx2 = await o.page.evaluate(() => [...document.querySelectorAll('.ag-full-width-container .ag-pinned-left-cols-container .ag-row')].find(x => x.innerText.includes('MQBNAI3X-155'))?.getAttribute('row-index'));
  await fw.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${idx2}"]`).getByRole('button', { name: /History/ }).click();
  await o.page.waitForTimeout(2500);
  console.log('owner URL after history:', o.page.url());
  await snap(o.page, '46-recovery-owner');
  const main = await aria(o.page, 'main');
  console.log(main.slice(0, 7000));
  console.log('TOASTS:', JSON.stringify(toastLog, null, 1));
  await o.done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
