// Scroll dm grid to accepted row, expand, verify Next links + landing config.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(4000);
  // scroll the grid viewport until an accepted row is visible
  let found = false;
  for (let s = 0; s <= 4000 && !found; s += 300) {
    await page.evaluate((top) => {
      const vp = document.querySelector('.ag-root-wrapper .ag-body-viewport');
      if (vp) vp.scrollTop = top;
    }, s);
    await page.waitForTimeout(500);
    found = await page.evaluate(() => {
      const grid = document.querySelector('.ag-root-wrapper');
      return Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row')).some(r => (r.innerText || '').toLowerCase().includes('accepted'));
    });
  }
  console.log('accepted row visible?', found);
  const r = await page.evaluate(() => {
    const grid = document.querySelector('.ag-root-wrapper');
    const rows = Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row'));
    const row = rows.find(x => (x.innerText || '').toLowerCase().includes('accepted'));
    if (!row) return 'no accepted row';
    const ri = row.getAttribute('row-index');
    const pinned = grid.querySelector(`.ag-pinned-left-cols-container .ag-row[row-index="${ri}"]`);
    const chev = pinned && (pinned.querySelector('[col-id="expansion-chevron"] button') || pinned.querySelector('[col-id="expansion-chevron"]'));
    if (!chev) return 'no chevron; pinned=' + !!pinned + ' pinnedHTML=' + (pinned ? pinned.innerHTML.slice(0, 200) : '');
    const o = { bubbles: true, cancelable: true, view: window };
    chev.dispatchEvent(new MouseEvent('mousedown', o));
    chev.dispatchEvent(new MouseEvent('mouseup', o));
    chev.dispatchEvent(new MouseEvent('click', o));
    return 'chevron clicked row ' + ri + ' text=' + (row.innerText || '').replace(/\n/g, ' ').slice(0, 80);
  });
  console.log(r);
  await page.waitForTimeout(1500);
  await d.shot('02l-mm-01-expanded');
  const detail = await page.locator('.ag-full-width-container').innerText().catch(() => '(none)');
  console.log('detail panel:', detail.replace(/\n/g, ' | ').slice(0, 400));
  const body = await page.locator('body').innerText();
  console.log('Next: visible?', body.includes('Next:'));
  if (await page.getByRole('button', { name: 'Create PO' }).count()) {
    await page.evaluate(() => { Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Create PO'))?.click(); });
    await page.waitForTimeout(2500);
    console.log('Create PO landed:', page.url());
    await d.shot('02l-mm-02-po-landing');
    const b2 = await page.locator('body').innerText();
    const i = b2.search(/Quick|New Purchase/i);
    console.log('po landing snippet:', b2.slice(i, i + 600).replace(/\n/g, ' | '));
    // go back and do Create Sale
    await page.goto('http://localhost:5173/matchmaking');
    await page.waitForTimeout(3500);
    for (let s = 0; s <= 4000; s += 300) {
      await page.evaluate((top) => { const vp = document.querySelector('.ag-root-wrapper .ag-body-viewport'); if (vp) vp.scrollTop = top; }, s);
      await page.waitForTimeout(400);
      const f = await page.evaluate(() => Array.from(document.querySelectorAll('.ag-root-wrapper .ag-center-cols-container .ag-row')).some(r => (r.innerText || '').toLowerCase().includes('accepted')));
      if (f) break;
    }
    const r2 = await page.evaluate(() => {
      const grid = document.querySelector('.ag-root-wrapper');
      const row = Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row')).find(x => (x.innerText || '').toLowerCase().includes('accepted'));
      if (!row) return 'no accepted row';
      const ri = row.getAttribute('row-index');
      const pinned = grid.querySelector(`.ag-pinned-left-cols-container .ag-row[row-index="${ri}"]`);
      const chev = pinned && (pinned.querySelector('[col-id="expansion-chevron"] button') || pinned.querySelector('[col-id="expansion-chevron"]'));
      if (!chev) return 'no chevron';
      const o = { bubbles: true, cancelable: true, view: window };
      chev.dispatchEvent(new MouseEvent('click', o));
      return 'chevron clicked ' + ri;
    });
    console.log(r2);
    await page.waitForTimeout(1500);
    if (await page.getByRole('button', { name: 'Create Sale' }).count()) {
      await page.evaluate(() => { Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Create Sale'))?.click(); });
      await page.waitForTimeout(2500);
      console.log('Create Sale landed:', page.url());
      await d.shot('02l-mm-03-sale-landing');
      const b3 = await page.locator('body').innerText();
      const i3 = b3.search(/New Sale|Quick/i);
      console.log('sale landing snippet:', b3.slice(i3, i3 + 600).replace(/\n/g, ' | '));
    } else console.log('NO Create Sale after expand');
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
