// Realtime test v3: pageA /pick on line; pageB tries sales UI recall, falls back to API recall
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
  const firstLineName = await lineBtns.first().locator('p').first().textContent();
  console.log('A first line:', firstLineName);
  await lineBtns.first().click();
  await pageA.waitForTimeout(1200);
  await snap(pageA, '11-A-on-line');

  // PAGE B: try sales UI path quickly
  await pageB.goto('http://localhost:5173/sales');
  await pageB.waitForTimeout(3000);
  const fbox = pageB.getByLabel('Filter Sales Orders grid');
  if (await fbox.isVisible().catch(() => false)) {
    await fbox.fill('orderNo:SO-REAL-00013');
    await fbox.press('Enter');
    await pageB.waitForTimeout(1500);
    const rect = await pageB.evaluate(() => {
      const r = document.querySelector('.ag-center-cols-container .ag-row');
      if (!r) return null;
      const b = r.getBoundingClientRect();
      return { x: b.x + 100, y: b.y + b.height / 2 };
    });
    if (rect) await pageB.mouse.click(rect.x, rect.y);
    await pageB.waitForTimeout(3500);
    console.log('B panels after order select:', await pageB.evaluate(() => [...document.querySelectorAll('section[aria-label]')].map(p => p.getAttribute('aria-label')).slice(0, 14)));
    console.log('B Recall from pick count:', await pageB.getByRole('button', { name: 'Recall from pick' }).count());
    await snap(pageB, '11-B-order-selected');
  }

  // Fallback: recall via commands.run API from pageB browser context (real session)
  const pickData = await pageB.evaluate(async () => {
    const q = await fetch('/trpc/queries.pickQueue?batch=1&input=' + encodeURIComponent(JSON.stringify({ 0: { json: null, meta: { values: ['undefined'] } } })), { credentials: 'include' });
    const j = await q.json();
    const items = j[0]?.result?.data?.json ?? [];
    return items.find((i) => i.pickNo === 'PICK-REAL-00013') ?? null;
  });
  console.log('pick item:', JSON.stringify(pickData).slice(0, 300));
  if (!pickData) { await done(); return; }
  const lines = await pageB.evaluate(async (pickListId) => {
    const q = await fetch('/trpc/queries.pickListWithLines?batch=1&input=' + encodeURIComponent(JSON.stringify({ 0: { json: { pickListId } } })), { credentials: 'include' });
    const j = await q.json();
    return j[0]?.result?.data?.json ?? null;
  }, pickData.id);
  console.log('lines:', JSON.stringify(lines?.lines?.map(l => ({ id: l.id, orderLineId: l.orderLineId, item: l.itemName, status: l.status, pickStatus: l.pickStatus, actualQty: l.actualQty }))).slice(0, 500));
  const target = lines.lines.find(l => (l.displayName ?? l.itemName) === firstLineName) ?? lines.lines[0];
  console.log('recalling orderLineId:', target.orderLineId, 'item:', target.itemName);
  const t0 = Date.now();
  const res = await pageB.evaluate(async (orderLineId) => {
    const r = await fetch('/trpc/commands.run?batch=1', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 0: { json: { name: 'recallLineFromPicking', idempotencyKey: 'wh-lane-' + Date.now(), reason: 'Warehouse lane realtime QA: recall while picker on line', payload: { lineId: orderLineId } } } })
    });
    return { status: r.status, body: (await r.text()).slice(0, 400) };
  }, target.orderLineId);
  console.log('recall API result:', JSON.stringify(res).slice(0, 500));

  // PAGE A: poll for overlay
  let seen = null;
  for (let i = 0; i < 40; i++) {
    if (await pageA.locator('[role="alertdialog"]').isVisible().catch(() => false)) { seen = Date.now() - t0; break; }
    await pageA.waitForTimeout(400);
  }
  console.log('A overlay after ms:', seen);
  await snap(pageA, '11-A-recall-overlay');
  console.log('A overlay text:', (await pageA.locator('[role="alertdialog"]').innerText().catch(() => '(none)')).replace(/\n+/g, ' | '));
  if (seen != null) {
    await pageA.getByRole('button', { name: 'Got it' }).click();
    await pageA.waitForTimeout(1500);
    await snap(pageA, '11-A-after-gotit');
    console.log('A after Got it:', (await pageA.evaluate(() => document.body.innerText.slice(1100, 1800))).replace(/\n+/g, ' | ').slice(0, 400));
  }
  await done();
})().catch(e => { console.error(e); process.exit(1); });
