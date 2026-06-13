const { launch, snap, nukeOverlay, aria, readToasts } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  const queue = page.getByRole('region', { name: 'Intake queue' });
  // find PO-ACTIVE-008 row, check actions col
  const row = queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first();
  console.log('row found:', await row.count());
  const idx = await row.getAttribute('row-index').catch(() => null);
  console.log('row-index:', idx);
  const actions = queue.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${idx}"]`);
  console.log('actions cell:', JSON.stringify(await actions.allInnerTexts()));
  const actionBtns = await actions.locator('button').all();
  for (const b of actionBtns) console.log('action btn:', await b.innerText(), 'title:', await b.getAttribute('title'), 'disabled:', await b.isDisabled());
  // click the row PO cell to open detail
  await row.click();
  await page.waitForTimeout(1500);
  await snap(page, '29-intake-008-selected');
  const main = await aria(page, 'main');
  console.log(main.slice(0, 7000));
  console.log('TOASTS:', JSON.stringify(await readToasts(page)));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
