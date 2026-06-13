// Live unacked alert vs desktop fulfillment Alerts column; then fulfill-toast deep-link test on PICK-REAL-00019
const { launch, snap, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  const trpcGet = (path, input) => page.evaluate(async ({ path, input }) => {
    const q = await fetch(`/trpc/${path}?batch=1&input=` + encodeURIComponent(JSON.stringify({ 0: { json: input } })), { credentials: 'include' });
    const j = await q.json();
    return j[0]?.result?.data?.json ?? null;
  }, { path, input });
  const runCmd = (name, payload, reason) => page.evaluate(async ({ name, payload, reason }) => {
    const r = await fetch('/trpc/commands.run?batch=1', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 0: { json: { name, idempotencyKey: 'wh-' + Math.random().toString(36).slice(2), reason, payload } } })
    });
    return (await r.text()).slice(0, 250);
  }, { name, payload, reason });

  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(2000);

  // pack + recall Indoor Flower on PICK-REAL-00016 via API to create a live alert
  const queue = await trpcGet('queries.pickQueue', null);
  const pick = queue.find(i => i.pickNo === 'PICK-REAL-00016');
  if (pick) {
    const pl = await trpcGet('queries.pickListWithLines', { pickListId: pick.id });
    const open = pl.lines.find(l => Number(l.actualQty) === 0 && l.pickStatus === 'released');
    if (open) {
      console.log('packing line:', open.itemName, open.id);
      console.log(await runCmd('recordWeighAndPack', { fulfillmentLineId: open.id, actualQty: Number(open.expectedQty), actualWeight: 8.8, bagCode: 'WH-QA-BAG-1' }, 'Warehouse lane QA: pack before recall'));
      console.log(await runCmd('recallLineFromPicking', { lineId: open.orderLineId }, 'Warehouse lane QA: create live alert for desktop check'));
    }
  }
  // Desktop fulfillment check with live alert
  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(2500);
  const fb = page.getByLabel('Filter Fulfillment grid');
  await fb.fill('pickNo:PICK-REAL-00016');
  await fb.press('Enter');
  await page.waitForTimeout(1500);
  console.log('pinned row (live alert):', await page.evaluate(() => document.querySelector('.ag-pinned-left-cols-container .ag-row')?.innerText.replace(/\s+/g, ' ')));
  const rect = await page.evaluate(() => { const r = document.querySelector('.ag-center-cols-container .ag-row'); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x + 80, y: b.y + b.height / 2 }; });
  if (rect) await page.mouse.click(rect.x, rect.y);
  await page.waitForTimeout(2000);
  console.log('View alerts button:', await page.locator('button', { hasText: 'alerts for' }).count());
  await snap(page, '13-desktop-live-alert');

  // Fulfill-toast deep-link test on PICK-REAL-00019: pack all lines via API then Mark fulfilled via UI
  const q2 = await trpcGet('queries.pickQueue', null);
  const p19 = q2.find(i => i.pickNo === 'PICK-REAL-00019');
  if (p19) {
    const pl19 = await trpcGet('queries.pickListWithLines', { pickListId: p19.id });
    for (const l of pl19.lines) {
      if (Number(l.actualQty) === 0) console.log('pack:', l.itemName, await runCmd('recordWeighAndPack', { fulfillmentLineId: l.id, actualQty: Number(l.expectedQty), actualWeight: 5.5, bagCode: 'WH-QA-BAG-2' }, 'Warehouse lane QA: pack for fulfill toast test'));
    }
    await page.goto('http://localhost:5173/fulfillment');
    await page.waitForTimeout(2500);
    const fb2 = page.getByLabel('Filter Fulfillment grid');
    await fb2.fill('pickNo:PICK-REAL-00019');
    await fb2.press('Enter');
    await page.waitForTimeout(1500);
    const r2 = await page.evaluate(() => { const r = document.querySelector('.ag-center-cols-container .ag-row'); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x + 80, y: b.y + b.height / 2 }; });
    if (r2) await page.mouse.click(r2.x, r2.y);
    await page.waitForTimeout(2000);
    const mf = page.getByRole('button', { name: /Mark fulfilled/ });
    console.log('MF disabled:', await mf.first().isDisabled().catch(()=>'?'));
    await mf.first().click();
    // catch toast FAST
    for (let i = 0; i < 12; i++) {
      const t = await readToasts(page);
      const vo = await page.getByRole('button', { name: 'View order' }).count();
      if (t.some(x => x.includes('fulfilled')) || vo) { console.log('toast snapshot at', i * 250, 'ms:', t, '| View order btns:', vo); break; }
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(500);
    console.log('toasts now:', await readToasts(page), '| View order btns:', await page.getByRole('button', { name: 'View order' }).count());
    await snap(page, '13-fulfill-toast');
    const vo = page.getByRole('button', { name: 'View order' });
    if (await vo.count()) {
      await vo.first().click();
      await page.waitForTimeout(2500);
      console.log('after View order URL:', page.url());
      await snap(page, '13-after-view-order');
    }
  } else console.log('PICK-REAL-00019 not in queue');
  await done();
})().catch(e => { console.error(e); process.exit(1); });
