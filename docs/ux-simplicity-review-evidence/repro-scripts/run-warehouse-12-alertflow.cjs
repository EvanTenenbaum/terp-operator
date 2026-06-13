// Scenario C: pack line 1 on PICK-REAL-00016, recall it (packed) -> alert; verify list banner, queue badge, ack loop, desktop blindspot
const { launch, snap, readToasts, wireIssues } = require('./wh-lib.cjs');
(async () => {
  const { context, page: pageA, issues, done } = await launch();
  const pageB = await context.newPage();
  wireIssues(pageB, issues);

  // helper for trpc on pageB
  const trpcGet = (path, input) => pageB.evaluate(async ({ path, input }) => {
    const q = await fetch(`/trpc/${path}?batch=1&input=` + encodeURIComponent(JSON.stringify({ 0: { json: input } })), { credentials: 'include' });
    const j = await q.json();
    return j[0]?.result?.data?.json ?? null;
  }, { path, input });

  await pageA.goto('http://localhost:5173/pick');
  await pageA.waitForTimeout(2500);
  await pageA.locator('button', { hasText: 'PICK-REAL-00016' }).first().click();
  await pageA.waitForTimeout(2000);
  const lineBtns = pageA.locator('ul.divide-y li button:not([disabled])');
  const firstLineName = await lineBtns.first().locator('p').first().textContent();
  console.log('line1:', firstLineName);
  await lineBtns.first().click();
  await pageA.waitForTimeout(1200);
  // pack line 1
  await pageA.locator('#pick-actual-weight').fill('10');
  await pageA.locator('#pick-actual-weight').press('Enter');
  await pageA.waitForTimeout(2500);
  console.log('A now on (auto-advanced):', await pageA.locator('.text-2xl.font-bold').first().textContent().catch(()=>'?'));

  // pageB: find pick + line ids
  await pageB.goto('http://localhost:5173/dashboard');
  await pageB.waitForTimeout(2000);
  const queue = await trpcGet('queries.pickQueue', null);
  const pick = queue.find(i => i.pickNo === 'PICK-REAL-00016');
  const pl = await trpcGet('queries.pickListWithLines', { pickListId: pick.id });
  const packed = pl.lines.find(l => Number(l.actualQty) > 0);
  console.log('packed line:', JSON.stringify({ id: packed.id, orderLineId: packed.orderLineId, status: packed.status, pickStatus: packed.pickStatus, actualQty: packed.actualQty }));
  // recall the packed line
  const res = await pageB.evaluate(async (orderLineId) => {
    const r = await fetch('/trpc/commands.run?batch=1', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 0: { json: { name: 'recallLineFromPicking', idempotencyKey: 'wh-lane2-' + Date.now(), reason: 'Warehouse lane QA: recall packed line (scenario C)', payload: { lineId: orderLineId } } } })
    });
    return (await r.text()).slice(0, 300);
  }, packed.orderLineId);
  console.log('recall result:', res);

  // pageA is on line 2 — wait, check whether interrupt incorrectly appears
  await pageA.waitForTimeout(3000);
  console.log('A interrupt on wrong line?', await pageA.locator('[role="alertdialog"]').isVisible().catch(()=>false));
  // back to list
  await pageA.getByLabel('Back to pick list').click();
  await pageA.waitForTimeout(1500);
  await snap(pageA, '12-A-list-banner');
  const listTxt = (await pageA.evaluate(() => document.body.innerText.slice(1100, 2100))).replace(/\n+/g, ' | ');
  console.log('A list:', listTxt.slice(0, 500));

  // queue badge check on pageB
  await pageB.goto('http://localhost:5173/pick');
  await pageB.waitForTimeout(2500);
  const qtxt = await pageB.locator('button', { hasText: 'PICK-REAL-00016' }).first().innerText().catch(()=>'(not in queue)');
  console.log('B queue entry for 00016:', qtxt.replace(/\n+/g, ' | '));
  await snap(pageB, '12-B-queue-badge');

  // pageA: tap recalled line -> interrupt -> acknowledge
  const recalledBtn = pageA.locator('ul.divide-y li button', { hasText: firstLineName }).first();
  console.log('recalled line disabled?', await recalledBtn.isDisabled().catch(()=>'?'));
  await recalledBtn.click().catch(e => console.log('click failed:', e.message.slice(0,100)));
  await pageA.waitForTimeout(1500);
  const intVisible = await pageA.locator('[role="alertdialog"]').isVisible().catch(()=>false);
  console.log('interrupt visible:', intVisible);
  await snap(pageA, '12-A-interrupt');
  if (intVisible) {
    console.log('interrupt text:', (await pageA.locator('[role="alertdialog"]').innerText()).replace(/\n+/g, ' | '));
    await pageA.getByRole('button', { name: /Acknowledge/ }).click();
    await pageA.waitForTimeout(2500);
    await snap(pageA, '12-A-after-ack');
    console.log('A after ack:', (await pageA.evaluate(() => document.body.innerText.slice(1100, 1900))).replace(/\n+/g, ' | ').slice(0, 400));
    console.log('A toasts:', await readToasts(pageA));
  }

  // desktop blindspot: /fulfillment Alerts col for 00016
  await pageB.goto('http://localhost:5173/fulfillment');
  await pageB.waitForTimeout(2500);
  const fb = pageB.getByLabel('Filter Fulfillment grid');
  await fb.fill('pickNo:PICK-REAL-00016');
  await fb.press('Enter');
  await pageB.waitForTimeout(1500);
  const alertsCell = await pageB.evaluate(() => {
    const r = document.querySelector('.ag-pinned-left-cols-container .ag-row');
    return r ? r.innerText.replace(/\s+/g, ' ') : '(no row)';
  });
  console.log('desktop pinned row (alerts col):', alertsCell);
  // select row, look for View alerts button
  const rect = await pageB.evaluate(() => {
    const r = document.querySelector('.ag-center-cols-container .ag-row');
    if (!r) return null; const b = r.getBoundingClientRect();
    return { x: b.x + 80, y: b.y + b.height / 2 };
  });
  if (rect) await pageB.mouse.click(rect.x, rect.y);
  await pageB.waitForTimeout(2000);
  console.log('View alerts button count:', await pageB.locator('button', { hasText: 'alerts for' }).count());
  await snap(pageB, '12-B-desktop-no-alerts');
  await done();
})().catch(e => { console.error(e); process.exit(1); });
