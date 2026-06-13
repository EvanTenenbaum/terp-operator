// Step 14: locate my posted payout in money-out ledger + finder; open inspector
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);

  // money-out table = second table
  const found = await page.evaluate(() => {
    const t = document.querySelectorAll('table')[1];
    const rows = [...t.querySelectorAll('tbody tr')];
    const hit = rows.findIndex(tr => tr.textContent.includes('money-lane QA payout 1'));
    return { totalRows: rows.length, hitIndex: hit, hitText: hit >= 0 ? [...rows[hit].querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,60)) : null };
  });
  console.log('money-out search:', JSON.stringify(found, null, 1));

  // finder filter by Boulder
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('Boulder');
  await page.waitForTimeout(2000);
  const gridRows = await page.evaluate(() => [...document.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0,8).map(r => (r.textContent||'').trim().replace(/\s+/g,' ').slice(0,180)));
  console.log('finder Boulder rows:', JSON.stringify(gridRows, null, 1));
  await d.shot('14-finder-boulder');

  if (gridRows.length) {
    await page.locator('.ag-center-cols-container .ag-row').first().click();
    await page.waitForTimeout(2000);
    await d.shot('14-inspector');
    const drawer = await page.evaluate(() => {
      const dlgs = [...document.querySelectorAll('[role=dialog], aside, [class*=Drawer i]')];
      const dlg = dlgs[dlgs.length-1];
      if (!dlg) return 'no drawer';
      return { tabs: [...dlg.querySelectorAll('[role=tab],button')].map(b => (b.textContent||'').trim()).filter(Boolean).slice(0,30), text: (dlg.textContent||'').trim().replace(/\s+/g,' ').slice(0, 800) };
    });
    console.log('drawer:', JSON.stringify(drawer, null, 1));
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
