// Expand a Deterministic Match row group to find Accept/Dismiss/outreach detail.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(2500);
  const dmGrid = page.locator('.ag-root-wrapper').first();
  const rows = dmGrid.locator('.ag-center-cols-container .ag-row');
  // expander lives usually in the row's group cell; try .ag-group-contracted icon
  const exp = dmGrid.locator('.ag-row .ag-group-contracted').first();
  console.log('expander count:', await dmGrid.locator('.ag-group-contracted').count());
  await exp.click({ force: true }).catch(e => console.log('exp click fail', String(e).slice(0, 120)));
  await page.waitForTimeout(1500);
  await d.shot('02e-mm-01-expanded');
  await d.dump('expanded row detail');
  // buttons within detail
  const btns = await page.evaluate(() => Array.from(document.querySelectorAll('.ag-details-row button, .ag-full-width-container button')).map(b => ({ t: (b.textContent || '').trim().slice(0, 60), disabled: b.disabled })));
  console.log('detail buttons:', JSON.stringify(btns));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
