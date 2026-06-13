// Step 26: right-click context menu -> RowInspector (History/Receipt/Linked Orders)
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  // first: quick filter syntax check
  await filterBox.first().fill('method:cash');
  await page.waitForTimeout(1500);
  const nCash = await page.evaluate(() => document.querySelectorAll('.ag-center-cols-container .ag-row').length);
  console.log('visible rows for method:cash filter:', nCash);
  await filterBox.first().fill('SO-REAL-00444');
  await page.waitForTimeout(1500);

  const row = page.locator('.ag-center-cols-container .ag-row').first();
  await row.click({ button: 'right' });
  await page.waitForTimeout(1200);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem], [class*=context i] button, [class*=menu i] button')].map(e => (e.textContent||'').trim()).filter(Boolean));
  console.log('context menu items:', JSON.stringify(menu));
  await d.shot('26-context-menu');

  // click History
  const hist = page.getByRole('menuitem', { name: 'History' }).or(page.getByText('History', { exact: true }).last());
  await hist.first().click().catch(e => console.log('history click err', String(e).slice(0,120)));
  await page.waitForTimeout(2000);
  await d.shot('26-inspector-history');
  const dlg = await page.evaluate(() => {
    const x = [...document.querySelectorAll('[role=dialog]')].pop();
    if (!x) return 'no dialog';
    return { tabs: [...x.querySelectorAll('[role=tab],button')].map(t => (t.textContent||'').trim()).filter(Boolean).slice(0,20), txt: (x.textContent||'').trim().replace(/\s+/g,' ').slice(0,500) };
  });
  console.log('inspector:', JSON.stringify(dlg, null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
