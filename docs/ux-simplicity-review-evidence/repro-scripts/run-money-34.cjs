// Step 34: balance drill, relationship drawer, name->contact link, Link contact
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/clients');
  await page.waitForTimeout(3500);

  // pinned name cells
  const names = await page.evaluate(() => [...document.querySelectorAll('.ag-pinned-left-cols-container .ag-row')].slice(0,6).map(r => r.textContent.trim().replace(/\s+/g,' ').slice(0,60)));
  console.log('first names:', JSON.stringify(names));

  // 1) click the balance cell
  const balCell = page.locator('.ag-center-cols-container .ag-row').first().locator('[col-id=balance]');
  await balCell.click();
  await page.waitForTimeout(1800);
  console.log('after balance click url:', page.url());
  const dlg1 = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(x => (x.textContent||'').replace(/\s+/g,' ').slice(0,200)));
  console.log('dialogs after balance click:', JSON.stringify(dlg1));
  await d.shot('34-balance-click');

  // 2) name cell: links?
  const nameCell = page.locator('.ag-pinned-left-cols-container .ag-row').first();
  const nameLinks = await nameCell.evaluate(r => [...r.querySelectorAll('a,button')].map(e => ({ tag: e.tagName, t: e.textContent.trim().slice(0,40), href: e.getAttribute('href') })));
  console.log('name cell links:', JSON.stringify(nameLinks));

  // 3) right-click -> Relationship drawer
  await page.locator('.ag-center-cols-container .ag-row').first().click({ button: 'right' });
  await page.waitForTimeout(1000);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].map(e => e.textContent.trim()));
  console.log('ctx menu:', JSON.stringify(menu));
  await page.getByText('Relationship', { exact: true }).last().click();
  await page.waitForTimeout(2500);
  const dlg = page.locator('[role=dialog]').last();
  const drawerInfo = await dlg.evaluate(x => ({
    tabs: [...x.querySelectorAll('[role=tab]')].map(t => ({ t: t.textContent.trim(), sel: t.getAttribute('aria-selected') })),
    txt: (x.textContent||'').trim().replace(/\s+/g,' ').slice(0, 1000),
  })).catch(() => 'no dialog');
  console.log('relationship drawer:', JSON.stringify(drawerInfo, null, 1));
  await d.shot('34-relationship-drawer');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
