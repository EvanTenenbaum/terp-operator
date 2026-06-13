const { launch, snap, nukeOverlay, aria, readToasts } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  const queue = page.getByRole('region', { name: 'Intake queue' });
  const row = queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first();
  // click the chevron (expansion)
  const chev = row.getByRole('button').first();
  console.log('chevron count:', await chev.count());
  await chev.click();
  await page.waitForTimeout(1500);
  await snap(page, '30-expanded');
  // dump expanded content
  const detail = await page.evaluate(() => {
    const fw = document.querySelector('.ag-full-width-container');
    return fw ? fw.innerText.slice(0, 1500) : '(no full width row)';
  });
  console.log('full-width detail:', detail);
  const a = await aria(page, '.ag-full-width-container').catch(() => null);
  if (a) console.log(a.slice(0, 6000));
  console.log('TOASTS:', JSON.stringify(await readToasts(page)));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
