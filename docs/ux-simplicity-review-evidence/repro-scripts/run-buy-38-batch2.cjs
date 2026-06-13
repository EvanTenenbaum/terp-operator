const { launch, snap, nukeOverlay, readToasts, ROOT } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 300);

  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  const queue = page.getByRole('region', { name: 'Intake queue' });
  const poRow = queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first();
  await poRow.locator('.ag-group-contracted').click();
  await page.waitForTimeout(1800);
  const fw = page.locator('.ag-full-width-container');

  // a. tint baseline
  const bgDump = () => page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    if (!fw2) return null;
    return [...fw2.querySelectorAll('.ag-cell')].map(c => ({ col: c.getAttribute('col-id'), txt: c.innerText.trim().slice(0, 30), bg: c.style.backgroundColor || null }));
  });
  console.log('baseline cells:', JSON.stringify((await bgDump()).filter(c => ['intakeQty', 'discrepancyReason', '0', 'status'].includes(c.col)), null, 1));
  await fw.first().screenshot({ path: ROOT + '/shots/buy-38-tint-baseline.png' }).catch(() => {});

  // b. edit actual qty -> 150 ; probe focus behavior
  const qtyCell = fw.locator('.ag-cell[col-id="intakeQty"]').first();
  await qtyCell.dblclick();
  await page.waitForTimeout(400);
  let ed = await page.evaluate(() => { const a = document.activeElement; return a.tagName + ' val=' + (a.value ?? ''); });
  console.log('after dblclick qty:', ed);
  if (!ed.startsWith('INPUT')) {
    await qtyCell.click();
    await page.waitForTimeout(200);
    await page.keyboard.type('1');
    await page.waitForTimeout(250);
    ed = await page.evaluate(() => { const a = document.activeElement; return a.tagName + ' val=' + (a.value ?? ''); });
    console.log('after click+type qty:', ed);
    if (ed.startsWith('INPUT')) { await page.keyboard.type('50'); await page.keyboard.press('Enter'); }
  } else { await page.keyboard.press('Meta+a'); await page.keyboard.type('150'); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(1200);
  console.log('qty cell now:', JSON.stringify((await bgDump())?.filter(c => c.col === 'intakeQty')));

  // c. reason: scroll right, edit
  await page.evaluate(() => { const vp = document.querySelector('.ag-full-width-container .ag-center-cols-viewport'); if (vp) vp.scrollLeft = vp.scrollWidth; });
  await page.waitForTimeout(400);
  console.log('reason baseline:', JSON.stringify((await bgDump())?.filter(c => c.col === 'discrepancyReason')));
  await fw.first().screenshot({ path: ROOT + '/shots/buy-38-tint-red-reason.png' }).catch(() => {});
  const rCell = fw.locator('.ag-cell[col-id="discrepancyReason"]').first();
  await rCell.click();
  await page.waitForTimeout(200);
  await page.keyboard.type('D');
  await page.waitForTimeout(300);
  let ed2 = await page.evaluate(() => { const a = document.activeElement; return a.tagName + ' val=' + (a.value ?? a.innerText ?? '').slice(0, 30); });
  console.log('reason editor probe:', ed2);
  if (ed2.startsWith('TEXTAREA') || ed2.startsWith('INPUT')) {
    await page.keyboard.type('amaged in transit (QA)');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1200);
  console.log('reason cell now:', JSON.stringify((await bgDump())?.filter(c => c.col === 'discrepancyReason')));
  await fw.first().screenshot({ path: ROOT + '/shots/buy-38-after-reason.png' }).catch(() => {});
  await snap(page, '38-after-edits');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
