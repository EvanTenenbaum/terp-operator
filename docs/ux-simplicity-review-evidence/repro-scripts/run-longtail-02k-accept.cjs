// Focused accept + Next links verification with selection retry.
const { start } = require('./lib-longtail.cjs');
const synthRowClick = (page, rowText) => page.evaluate((txt) => {
  const grid = document.querySelector('.ag-root-wrapper');
  const rows = Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row'));
  const row = rows.find(r => ((r.innerText || '') + (r.textContent || '')).toLowerCase().includes(txt.toLowerCase()));
  if (!row) return 'no row';
  const cell = row.querySelector('.ag-cell');
  const o = { bubbles: true, cancelable: true, view: window };
  cell.dispatchEvent(new MouseEvent('mousedown', o));
  cell.dispatchEvent(new MouseEvent('mouseup', o));
  cell.dispatchEvent(new MouseEvent('click', o));
  return 'clicked: ' + (row.innerText || '').replace(/\n/g, ' ').slice(0, 80);
}, rowText);

(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(4000);
  const accept = page.getByRole('button', { name: 'Accept' }).first();
  let enabled = false;
  for (let i = 0; i < 6 && !enabled; i++) {
    console.log(await synthRowClick(page, 'open'));
    await page.waitForTimeout(600);
    enabled = !(await accept.isDisabled());
    console.log('attempt', i, 'Accept enabled?', enabled);
  }
  if (enabled) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim().endsWith('Accept'));
      if (btn && !btn.disabled) btn.click();
    });
    await page.waitForTimeout(1200);
    await d.shot('02k-mm-01-just-after-accept');
    const toasts = await page.locator('[role="status"], [role="alert"], [class*="Toast"], [class*="toast"]').allInnerTexts().catch(() => []);
    console.log('toasts:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 5)));
  }
  // expand accepted row
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const grid = document.querySelector('.ag-root-wrapper');
    const rows = Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row'));
    const row = rows.find(x => (x.innerText || '').toLowerCase().includes('accepted'));
    if (!row) return 'no accepted row visible';
    const ri = row.getAttribute('row-index');
    const pinned = grid.querySelector(`.ag-pinned-left-cols-container .ag-row[row-index="${ri}"]`);
    const chev = pinned && pinned.querySelector('[col-id="expansion-chevron"] button, [col-id="expansion-chevron"]');
    if (!chev) return 'no chevron (pinned row: ' + !!pinned + ')';
    chev.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 'chevron clicked on row ' + ri;
  });
  console.log(r);
  await page.waitForTimeout(1500);
  await d.shot('02k-mm-02-expanded');
  const detail = await page.locator('.ag-full-width-container').innerText().catch(() => '(none)');
  console.log('detail panel:', detail.replace(/\n/g, ' | ').slice(0, 300));
  const hasNext = (await page.locator('body').innerText()).includes('Next:');
  console.log('Next: visible?', hasNext);
  const po = page.getByRole('button', { name: 'Create PO' }).first();
  console.log('Create PO count:', await po.count());
  if (await po.count()) {
    await page.evaluate(() => { Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Create PO'))?.click(); });
    await page.waitForTimeout(2500);
    console.log('Create PO landed:', page.url());
    await d.shot('02k-mm-03-po-landing');
    await d.dump('po landing');
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
