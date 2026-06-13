// Step 13: test all three presets, the quick filter, and open RowInspector on my posted payout
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);

  const countTxt = async () => (await page.evaluate(() => (document.body.innerText.match(/Payments\s*\d+ row\(s\)/)||['?'])[0]));
  const filterBox = page.locator('input[placeholder*="filter" i], input[placeholder*="Type" i], input[placeholder*="quick" i]');
  console.log('filter box count:', await filterBox.count(), 'ph:', await filterBox.first().getAttribute('placeholder').catch(()=>null));

  for (const p of ['Unpaid', 'Overdue', 'Unapplied']) {
    await page.getByRole('button', { name: p, exact: true }).click();
    await page.waitForTimeout(1800);
    const fb = await filterBox.first().inputValue().catch(() => 'n/a');
    console.log(p, '=>', await countTxt(), '| filter box:', fb);
    // toggle off
    await page.getByRole('button', { name: p, exact: true }).click();
    await page.waitForTimeout(1200);
  }

  // quick filter plain text: my payout
  await filterBox.first().fill('money-lane QA payout 1');
  await page.waitForTimeout(1800);
  console.log('after note filter:', await countTxt());
  await d.shot('13-filter-payout');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0,5).map(r => (r.textContent||'').trim().replace(/\s+/g,' ').slice(0,200)));
  console.log('grid rows:', JSON.stringify(rows, null, 1));

  // click the row to open inspector
  const cell = page.locator('.ag-center-cols-container .ag-row').first();
  if (await cell.count()) {
    await cell.click();
    await page.waitForTimeout(1800);
    await d.shot('13-row-inspector');
    const drawer = await page.evaluate(() => {
      const dlg = document.querySelector('[role=dialog], [class*=drawer], [class*=Drawer], aside');
      if (!dlg) return 'no drawer';
      return { tabs: [...dlg.querySelectorAll('[role=tab],button')].map(b => (b.textContent||'').trim()).filter(Boolean).slice(0,25), text: (dlg.textContent||'').trim().replace(/\s+/g,' ').slice(0, 600) };
    });
    console.log('drawer:', JSON.stringify(drawer, null, 1));
  } else { console.log('payout row not found in finder'); }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
