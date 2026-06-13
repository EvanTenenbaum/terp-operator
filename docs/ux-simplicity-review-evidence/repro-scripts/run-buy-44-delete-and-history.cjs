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
  await page.waitForTimeout(1800);
  const fw = page.locator('.ag-full-width-container');
  const idx = await page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    return [...fw2.querySelectorAll('.ag-pinned-left-cols-container .ag-row')].find(x => x.innerText.includes('MQBNRJIH-877'))?.getAttribute('row-index');
  });
  const actionsRow = fw.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${idx}"]`);
  await actionsRow.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(500);
  console.log('inline confirm:', JSON.stringify(await actionsRow.allInnerTexts()));
  await snap(page, '44-inline-confirm');
  await actionsRow.getByRole('button', { name: 'Confirm delete' }).click();
  await page.waitForTimeout(1500);
  console.log('toasts after confirm delete:', JSON.stringify(await readToasts(page)));
  console.log('rows now:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.ag-full-width-container .ag-pinned-left-cols-container .ag-row')].map(r => r.innerText.trim()))));

  // History / Reverse receipt on posted batch1 (155)
  const idx2 = await page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    return [...fw2.querySelectorAll('.ag-pinned-left-cols-container .ag-row')].find(x => x.innerText.includes('MQBNAI3X-155'))?.getAttribute('row-index');
  });
  const hist = fw.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${idx2}"]`).getByRole('button', { name: /History \/ Reverse receipt/ });
  console.log('history btn count:', await hist.count());
  await hist.click();
  await page.waitForTimeout(2500);
  console.log('URL after history click:', page.url());
  await snap(page, '44-recovery-deeplink');
  const main = await page.locator('main').innerText();
  console.log('main head:', main.slice(0, 1200).replace(/\n/g, ' | '));
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
