// Measure grid re-render churn; select row via raw mouse; Mark fulfilled
const { launch, snap, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(2500);

  // Measure DOM row replacement churn over 5s
  const churn = await page.evaluate(() => new Promise((resolve) => {
    let added = 0, removed = 0;
    const target = document.querySelector('.ag-center-cols-container');
    if (!target) return resolve({ error: 'no grid' });
    const mo = new MutationObserver((muts) => {
      for (const m of muts) { added += m.addedNodes.length; removed += m.removedNodes.length; }
    });
    mo.observe(target, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); resolve({ added, removed }); }, 5000);
  }));
  console.log('grid DOM churn over 5s:', churn);

  const fbox = page.getByLabel('Filter Fulfillment grid');
  await fbox.fill('pickNo:PICK-REAL-00007');
  await fbox.press('Enter');
  await page.waitForTimeout(1500);

  // raw mouse click on first row center
  const rect = await page.evaluate(() => {
    const r = document.querySelector('.ag-center-cols-container .ag-row');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.x + 100, y: b.y + b.height / 2 };
  });
  console.log('row rect:', rect);
  if (rect) { await page.mouse.click(rect.x, rect.y); }
  await page.waitForTimeout(2500);
  console.log('pills:', await page.locator('.selection-pill').allTextContents());
  const linesTxt = await page.evaluate(() => {
    const r = [...document.querySelectorAll('[role="region"], section')].find(x => x.getAttribute?.('aria-label') === 'Fulfillment Lines' || x.textContent?.startsWith('Fulfillment Lines'));
    return r ? r.innerText.replace(/\s+/g, ' ').slice(0, 700) : 'NOT FOUND';
  });
  console.log('LINES PANEL:', linesTxt);
  await snap(page, '08-row-selected');

  const mf = page.getByRole('button', { name: /Mark fulfilled/ });
  console.log('Mark fulfilled count:', await mf.count());
  if (await mf.count()) {
    const dis = await mf.first().isDisabled();
    console.log('disabled:', dis, 'title:', await mf.first().getAttribute('title'));
    if (!dis) {
      await mf.first().click();
      await page.waitForTimeout(3500);
      console.log('TOASTS after fulfill:', await readToasts(page));
      const viewOrder = page.getByRole('button', { name: 'View order' });
      console.log('View order action count:', await viewOrder.count());
      await snap(page, '08-after-fulfill');
      await fbox.fill('pickNo:PICK-REAL-00007');
      await fbox.press('Enter');
      await page.waitForTimeout(1500);
      console.log('grid rows after refilter:', await page.evaluate(() => document.querySelector('.ag-center-cols-container')?.innerText?.replace(/\s+/g,' ').slice(0,200)));
      await snap(page, '08-after-fulfill-grid');
    }
  }
  await done();
})().catch(e => { console.error(e); process.exit(1); });
