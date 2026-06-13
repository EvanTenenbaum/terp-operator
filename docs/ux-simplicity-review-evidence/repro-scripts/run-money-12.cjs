// Step 12: draft pile size, presets + count pills, find my payout in finder, open RowInspector
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);

  // draft pile: count rows in money-in quick ledger table
  const counts = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')];
    return tables.map(t => ({ rows: t.querySelectorAll('tbody tr').length, firstHead: (t.querySelector('th:nth-child(4)')||{}).textContent }));
  });
  console.log('tables:', JSON.stringify(counts));

  // preset buttons + pills near "Payments 508"
  const presets = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim().replace(/\s+/g,' ')).filter(t => /Unpaid|Overdue|Unapplied|Posted|Draft|All/.test(t)).slice(0,20));
  console.log('preset-ish buttons:', JSON.stringify(presets));

  // scroll to finder grid
  const finderHeading = page.getByText(/Payments\s*\d+ row/);
  await finderHeading.first().scrollIntoViewIfNeeded().catch(()=>{});
  await page.waitForTimeout(800);
  await d.shot('12-finder-top');

  // Click "Unapplied" preset
  await page.getByRole('button', { name: /Unapplied/ }).first().click();
  await page.waitForTimeout(2000);
  const headTxt = await page.evaluate(() => (document.body.innerText.match(/Payments\s*\n?\s*\d+[\s\S]{0,40}/)||[''])[0].replace(/\s+/g,' '));
  console.log('after Unapplied preset:', headTxt);
  await d.shot('12-unapplied-preset');

  // search the grid for my payout note. Is there a quick search box?
  const search = page.locator('input[placeholder*=earch]');
  console.log('search inputs:', await search.count());

  // dump first rows of the ag-grid (finder)
  const gridRows = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ag-center-cols-container .ag-row, [role=rowgroup] [role=row]')].slice(0, 8);
    return rows.map(r => (r.textContent||'').trim().replace(/\s+/g,' ').slice(0, 160));
  });
  console.log('finder rows sample:', JSON.stringify(gridRows, null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
