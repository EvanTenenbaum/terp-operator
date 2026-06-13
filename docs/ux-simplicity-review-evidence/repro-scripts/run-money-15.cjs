// Step 15: click posted payout row (and its "-" commit cell); finder filter Cobalt; open inspector from finder
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);

  // click my posted payout row in money-out table
  const t2 = page.locator('table').nth(1);
  const payoutRow = t2.locator('tbody tr').filter({ hasText: 'money-lane QA payout 1' }).first();
  console.log('payout row found:', await payoutRow.count());
  // what buttons does it have?
  const btns = await payoutRow.evaluate(tr => [...tr.querySelectorAll('button,a')].map(b => ({ t: (b.textContent||'').trim(), aria: b.getAttribute('aria-label')||'', title: b.title||'' })));
  console.log('posted row buttons:', JSON.stringify(btns));
  await payoutRow.click();
  await page.waitForTimeout(1500);
  const drawer1 = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(x => (x.textContent||'').trim().replace(/\s+/g,' ').slice(0,300)));
  console.log('after row click, dialogs:', JSON.stringify(drawer1));
  await d.shot('15-payout-row-click');

  // finder: filter Cobalt
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('Cobalt');
  await page.waitForTimeout(2000);
  const gridRows = await page.evaluate(() => [...document.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0,6).map(r => (r.textContent||'').trim().replace(/\s+/g,' ').slice(0,180)));
  console.log('finder Cobalt rows:', JSON.stringify(gridRows, null, 1));
  const cnt = await page.evaluate(() => (document.body.innerText.match(/Payments\s*\d+ row\(s\)/)||['?'])[0]);
  console.log('count label:', cnt);
  await d.shot('15-finder-cobalt');

  if (gridRows.length) {
    await page.locator('.ag-center-cols-container .ag-row').first().click();
    await page.waitForTimeout(2000);
    await d.shot('15-inspector');
    const drawer = await page.evaluate(() => {
      const dlgs = [...document.querySelectorAll('[role=dialog]')];
      const dlg = dlgs[dlgs.length-1];
      if (!dlg) return 'no dialog';
      return { tabs: [...dlg.querySelectorAll('[role=tab]')].map(b => (b.textContent||'').trim()), buttons: [...dlg.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean).slice(0,25), text: (dlg.textContent||'').trim().replace(/\s+/g,' ').slice(0, 700) };
    });
    console.log('inspector:', JSON.stringify(drawer, null, 1));
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
