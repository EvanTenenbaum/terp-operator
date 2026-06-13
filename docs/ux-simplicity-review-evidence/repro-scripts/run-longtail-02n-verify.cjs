// Final verification: real Playwright click on Create Sale in expanded detail; poll URL.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(4000);
  for (let s = 0; s <= 5000; s += 300) {
    await page.evaluate((top) => { const vp = document.querySelector('.ag-root-wrapper .ag-body-viewport'); if (vp) vp.scrollTop = top; }, s);
    await page.waitForTimeout(350);
    const f = await page.evaluate(() => Array.from(document.querySelectorAll('.ag-root-wrapper .ag-center-cols-container .ag-row')).some(r => (r.innerText || '').toLowerCase().includes('accepted')));
    if (f) break;
  }
  console.log(await page.evaluate(() => {
    const grid = document.querySelector('.ag-root-wrapper');
    const row = Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row')).find(x => (x.innerText || '').toLowerCase().includes('accepted'));
    if (!row) return 'no accepted row';
    const ri = row.getAttribute('row-index');
    const pinned = grid.querySelector(`.ag-pinned-left-cols-container .ag-row[row-index="${ri}"]`);
    const chev = (pinned || row).querySelector('[aria-label="Expand row details"]');
    if (!chev) return 'no chevron';
    chev.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 'expanded ' + ri;
  }));
  await page.waitForTimeout(1500);
  const btn = page.getByRole('button', { name: 'Create Sale' }).first();
  console.log('Create Sale present?', await btn.count());
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 6000, force: true }).catch(e => console.log('real click fail:', String(e).slice(0, 120)));
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(200);
    const u = page.url();
    if (!u.endsWith('/matchmaking')) { console.log('URL CHANGED at', i * 200, 'ms →', u); break; }
    if (i === 14) console.log('URL never changed in 3s:', u);
  }
  await d.shot('02n-mm-create-sale-real-click');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
