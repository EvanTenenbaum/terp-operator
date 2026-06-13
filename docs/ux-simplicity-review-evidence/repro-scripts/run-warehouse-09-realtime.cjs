// Two-page realtime: pageA on /pick line; pageB recalls from /sales
const { launch, snap, readToasts, wireIssues } = require('./wh-lib.cjs');
(async () => {
  const { context, page: pageA, issues, done } = await launch();
  const pageB = await context.newPage();
  wireIssues(pageB, issues);

  // PAGE A: /pick -> PICK-REAL-00013 -> first line
  await pageA.goto('http://localhost:5173/pick');
  await pageA.waitForTimeout(2500);
  const q = pageA.locator('button', { hasText: 'PICK-REAL-00013' });
  console.log('PICK-REAL-00013 in queue:', await q.count());
  await q.first().click();
  await pageA.waitForTimeout(2000);
  const listTxt = await pageA.evaluate(() => document.body.innerText.slice(1100, 1900));
  console.log('LIST A:', listTxt.replace(/\n+/g, ' | ').slice(0, 400));
  const lineBtns = pageA.locator('ul.divide-y li button:not([disabled])');
  const firstLineName = await lineBtns.first().locator('p').first().textContent();
  console.log('first line item:', firstLineName);
  await lineBtns.first().click();
  await pageA.waitForTimeout(1500);
  await snap(pageA, '09-A-on-line');

  // PAGE B: /sales -> filter SO-REAL-00013 -> select -> recall first queued line
  await pageB.goto('http://localhost:5173/sales');
  await pageB.waitForTimeout(3000);
  const fbox = pageB.getByLabel(/Filter Sales Orders grid/i).first();
  console.log('sales filter box found:', await fbox.count().catch(()=>0));
  await fbox.fill('orderNo:SO-REAL-00013');
  await fbox.press('Enter');
  await pageB.waitForTimeout(2000);
  const rect = await pageB.evaluate(() => {
    const r = document.querySelector('.ag-center-cols-container .ag-row');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.x + 100, y: b.y + b.height / 2, text: r.innerText.replace(/\s+/g,' ').slice(0,120) };
  });
  console.log('sales row:', rect);
  if (rect) await pageB.mouse.click(rect.x, rect.y);
  await pageB.waitForTimeout(3000);
  await snap(pageB, '09-B-order-selected');
  // find Recall buttons in lines area
  const recallBtns = pageB.getByRole('button', { name: 'Recall', exact: true });
  console.log('Recall buttons visible:', await recallBtns.count());
  if (await recallBtns.count()) {
    const t0 = Date.now();
    await recallBtns.first().click({ force: true });
    await pageB.waitForTimeout(500);
    console.log('B toasts:', await readToasts(pageB));
    // PAGE A: poll for recall overlay
    let seen = null;
    for (let i = 0; i < 30; i++) {
      const overlay = await pageA.locator('[role="alertdialog"]').isVisible().catch(()=>false);
      if (overlay) { seen = Date.now() - t0; break; }
      await pageA.waitForTimeout(500);
    }
    console.log('A recall overlay seen after ms:', seen);
    await snap(pageA, '09-A-recall-overlay');
    console.log('A overlay text:', await pageA.locator('[role="alertdialog"]').innerText().catch(()=>'(none)'));
    if (seen != null) {
      await pageA.getByRole('button', { name: 'Got it' }).click();
      await pageA.waitForTimeout(1500);
      await snap(pageA, '09-A-after-gotit');
      console.log('A after Got it:', await pageA.evaluate(() => document.body.innerText.slice(1100, 1700)).then(t=>t.replace(/\n+/g,' | ').slice(0,300)));
    }
  }
  await done();
})().catch(e => { console.error(e); process.exit(1); });
