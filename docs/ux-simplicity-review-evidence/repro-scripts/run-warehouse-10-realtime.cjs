// Realtime test v2: pageA /pick on line; pageB /sales -> Canyon Market -> SO-REAL-00013 lines -> Recall from pick
const { launch, snap, readToasts, wireIssues } = require('./wh-lib.cjs');
(async () => {
  const { context, page: pageA, issues, done } = await launch();
  const pageB = await context.newPage();
  wireIssues(pageB, issues);

  // PAGE A on /pick line of PICK-REAL-00013
  await pageA.goto('http://localhost:5173/pick');
  await pageA.waitForTimeout(2500);
  await pageA.locator('button', { hasText: 'PICK-REAL-00013' }).first().click();
  await pageA.waitForTimeout(2000);
  const lineBtns = pageA.locator('ul.divide-y li button:not([disabled])');
  const nLines = await lineBtns.count();
  const firstLineName = await lineBtns.first().locator('p').first().textContent();
  console.log('A lines:', nLines, 'first:', firstLineName);
  await lineBtns.first().click();
  await pageA.waitForTimeout(1200);

  // PAGE B: /sales -> choose customer Canyon Market
  await pageB.goto('http://localhost:5173/sales');
  await pageB.waitForTimeout(3000);
  await pageB.selectOption('select[aria-label="Choose customer"]', { label: 'Canyon Market' });
  await pageB.waitForTimeout(4000);
  // select order SO-REAL-00013 in Sales Orders grid
  const fbox = pageB.getByLabel('Filter Sales Orders grid');
  await fbox.fill('orderNo:SO-REAL-00013');
  await fbox.press('Enter');
  await pageB.waitForTimeout(1500);
  const rect = await pageB.evaluate(() => {
    const wrappers = [...document.querySelectorAll('.ag-root-wrapper')];
    for (const w of wrappers) {
      if (!w.innerText.includes('SO-REAL-00013')) continue;
      const r = w.querySelector('.ag-center-cols-container .ag-row');
      if (r) { const b = r.getBoundingClientRect(); return { x: b.x + 100, y: b.y + b.height / 2 }; }
    }
    return null;
  });
  console.log('order row rect:', rect);
  if (rect) await pageB.mouse.click(rect.x, rect.y);
  await pageB.waitForTimeout(3000);
  await snap(pageB, '10-B-order-selected');

  // Find the Customer Draft Lines grid; expand the row matching firstLineName via chevron
  const lineInfo = await pageB.evaluate((itemName) => {
    const wrappers = [...document.querySelectorAll('.ag-root-wrapper')];
    const out = [];
    for (const w of wrappers) {
      const rows = [...w.querySelectorAll('.ag-pinned-left-cols-container .ag-row, .ag-center-cols-container .ag-row')].map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 90));
      out.push(rows.slice(0, 8));
    }
    return out;
  }, firstLineName);
  console.log('grids rows:', JSON.stringify(lineInfo, null, 1).slice(0, 2000));
  // click chevron on the draft-lines row that matches the item
  const chev = await pageB.evaluate((itemName) => {
    const rows = [...document.querySelectorAll('.ag-row')];
    for (const r of rows) {
      if (!r.innerText.includes(itemName)) continue;
      const idx = r.getAttribute('row-index');
      const wrapper = r.closest('.ag-root-wrapper');
      const btn = wrapper?.querySelector(`.ag-row[row-index="${idx}"] [col-id="expansion-chevron"] button`) ||
                  wrapper?.querySelector(`.ag-row[row-index="${idx}"] [col-id="expansion-chevron"]`);
      if (btn) { const b = btn.getBoundingClientRect(); if (b.width) return { x: b.x + b.width/2, y: b.y + b.height/2 }; }
    }
    return null;
  }, firstLineName);
  console.log('chevron at:', chev);
  if (chev) await pageB.mouse.click(chev.x, chev.y);
  await pageB.waitForTimeout(2000);
  await snap(pageB, '10-B-line-expanded');
  const recallBtn = pageB.getByRole('button', { name: 'Recall from pick' });
  console.log('Recall from pick buttons:', await recallBtn.count());
  if (await recallBtn.count()) {
    const t0 = Date.now();
    await recallBtn.first().click({ force: true });
    await pageB.waitForTimeout(800);
    console.log('B toasts:', await readToasts(pageB));
    let seen = null;
    for (let i = 0; i < 30; i++) {
      if (await pageA.locator('[role="alertdialog"]').isVisible().catch(() => false)) { seen = Date.now() - t0; break; }
      await pageA.waitForTimeout(500);
    }
    console.log('A overlay after ms:', seen);
    await snap(pageA, '10-A-recall-overlay');
    console.log('A overlay text:', await pageA.locator('[role="alertdialog"]').innerText().catch(() => '(none)'));
    if (seen != null) {
      await pageA.getByRole('button', { name: 'Got it' }).click();
      await pageA.waitForTimeout(1500);
      await snap(pageA, '10-A-after-gotit');
      console.log('A list after Got it:', (await pageA.evaluate(() => document.body.innerText.slice(1100, 1800))).replace(/\n+/g, ' | ').slice(0, 400));
    }
  }
  await done();
})().catch(e => { console.error(e); process.exit(1); });
