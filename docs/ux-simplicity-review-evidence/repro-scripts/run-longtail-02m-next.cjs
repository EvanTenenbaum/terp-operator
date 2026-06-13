// Expand accepted row via aria-label chevron div; verify Next links.
const { start } = require('./lib-longtail.cjs');
const expandAccepted = (page) => page.evaluate(() => {
  const grid = document.querySelector('.ag-root-wrapper');
  const row = Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row')).find(x => (x.innerText || '').toLowerCase().includes('accepted'));
  if (!row) return 'no accepted row';
  const ri = row.getAttribute('row-index');
  const pinned = grid.querySelector(`.ag-pinned-left-cols-container .ag-row[row-index="${ri}"]`);
  const chev = (pinned || row).querySelector('[aria-label="Expand row details"]');
  if (!chev) return 'no chevron div';
  const o = { bubbles: true, cancelable: true, view: window };
  chev.dispatchEvent(new MouseEvent('click', o));
  return 'expanded row ' + ri;
});
const scrollToAccepted = async (page) => {
  for (let s = 0; s <= 5000; s += 300) {
    await page.evaluate((top) => { const vp = document.querySelector('.ag-root-wrapper .ag-body-viewport'); if (vp) vp.scrollTop = top; }, s);
    await page.waitForTimeout(350);
    const f = await page.evaluate(() => Array.from(document.querySelectorAll('.ag-root-wrapper .ag-center-cols-container .ag-row')).some(r => (r.innerText || '').toLowerCase().includes('accepted')));
    if (f) return true;
  }
  return false;
};
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(4000);
  console.log('scrolled to accepted?', await scrollToAccepted(page));
  console.log(await expandAccepted(page));
  await page.waitForTimeout(1500);
  // nudge scroll so detail row visible
  await page.evaluate(() => { const vp = document.querySelector('.ag-root-wrapper .ag-body-viewport'); if (vp) vp.scrollTop += 80; });
  await d.shot('02m-mm-01-expanded');
  const detail = await page.evaluate(() => {
    const el = document.querySelector('.ag-details-row, [class*="detail"], .ag-full-width-container');
    return el ? el.innerText.slice(0, 500) : '(no detail el)';
  });
  console.log('detail:', detail.replace(/\n/g, ' | '));
  const body = await page.locator('body').innerText();
  console.log('Next: visible?', body.includes('Next:'));
  const poCount = await page.getByRole('button', { name: 'Create PO' }).count();
  console.log('Create PO count:', poCount);
  if (poCount) {
    await page.evaluate(() => { Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Create PO'))?.click(); });
    await page.waitForTimeout(2500);
    console.log('Create PO landed:', page.url());
    await d.shot('02m-mm-02-po-landing');
    const b2 = await page.locator('body').innerText();
    const i = b2.search(/New Purchase|Quick/i);
    console.log('po landing snippet:', b2.slice(Math.max(0, i), i + 700).replace(/\n/g, ' | '));
    // Create Sale leg
    await page.goto('http://localhost:5173/matchmaking');
    await page.waitForTimeout(3500);
    await scrollToAccepted(page);
    console.log(await expandAccepted(page));
    await page.waitForTimeout(1500);
    if (await page.getByRole('button', { name: 'Create Sale' }).count()) {
      await page.evaluate(() => { Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Create Sale'))?.click(); });
      await page.waitForTimeout(2500);
      console.log('Create Sale landed:', page.url());
      await d.shot('02m-mm-03-sale-landing');
      const b3 = await page.locator('body').innerText();
      const i3 = b3.search(/New Sale|Quick/i);
      console.log('sale landing snippet:', b3.slice(Math.max(0, i3), i3 + 700).replace(/\n/g, ' | '));
    } else console.log('NO Create Sale');
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
