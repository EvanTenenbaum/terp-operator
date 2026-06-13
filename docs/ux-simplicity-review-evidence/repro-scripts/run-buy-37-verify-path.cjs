const { launch, snap, nukeOverlay, readToasts, ROOT } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 300);
  const steps = [];
  const step = s => { steps.push(s); console.log('STEP', steps.length, s); };

  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  const queue = page.getByRole('region', { name: 'Intake queue' });
  const poRow = queue.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'PO-ACTIVE-008' }).first();
  await poRow.locator('.ag-group-contracted').click(); step('expand 008 batch');
  await page.waitForTimeout(1500);
  const fw = page.locator('.ag-full-width-container');

  // edit actual qty (intakeQty) to 150
  const qtyCell = fw.locator('.ag-cell[col-id="intakeQty"]').first();
  await qtyCell.click(); step('click actual qty cell');
  await page.keyboard.press('Enter'); step('Enter (open editor)');
  await page.waitForTimeout(250);
  const ed = await page.evaluate(() => { const a = document.activeElement; return a.tagName + ' val=' + (a.value ?? ''); });
  console.log('editor:', ed);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('150'); step('type 150');
  await page.keyboard.press('Enter'); step('Enter commit');
  await page.waitForTimeout(1200);
  // tint check
  const tint = await page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    return [...fw2.querySelectorAll('.ag-cell')].map(c => ({ col: c.getAttribute('col-id'), txt: c.innerText.trim().slice(0, 30), cls: c.className.replace(/ag-cell[a-z-]*/g, '').trim().slice(0, 80), bg: getComputedStyle(c).backgroundColor }));
  });
  console.log('cells after qty edit:', JSON.stringify(tint, null, 1));
  await fw.first().screenshot({ path: ROOT + '/shots/buy-37-tint-after-qty.png' }).catch(() => {});
  await snap(page, '37-after-qty-edit');

  // set discrepancy reason
  await page.evaluate(() => { const vp = document.querySelector('.ag-full-width-container .ag-center-cols-viewport'); if (vp) vp.scrollLeft = vp.scrollWidth; });
  await page.waitForTimeout(350);
  const reasonCell = fw.locator('.ag-cell[col-id="discrepancyReason"]').first();
  if (await reasonCell.isVisible().catch(() => false)) {
    await reasonCell.click(); step('click discrepancy reason cell');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const ed2 = await page.evaluate(() => { const a = document.activeElement; return a.tagName + '/' + (a.type || '') + ' val=' + (a.value ?? '').slice(0, 50); });
    console.log('reason editor:', ed2);
    await page.keyboard.type('Damaged in transit (QA test)'); step('type reason');
    await page.keyboard.press('Enter'); step('Enter commit reason');
    await page.waitForTimeout(1000);
    console.log('reason cell now:', await fw.locator('.ag-cell[col-id="discrepancyReason"]').first().innerText().catch(() => '?'));
  } else console.log('reason cell not visible after scroll');
  const tint2 = await page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    return [...fw2.querySelectorAll('.ag-cell')].map(c => ({ col: c.getAttribute('col-id'), bg: getComputedStyle(c).backgroundColor })).filter(c => c.bg !== 'rgba(0, 0, 0, 0)');
  });
  console.log('tinted cells after reason:', JSON.stringify(tint2, null, 1));
  await snap(page, '37-after-reason');

  // select the INNER intake row (click batchCode cell?) and try hotkeys
  await page.evaluate(() => { const vp = document.querySelector('.ag-full-width-container .ag-center-cols-viewport'); if (vp) vp.scrollLeft = 0; });
  await page.waitForTimeout(300);
  await fw.locator('.ag-cell[col-id="name"]').first().click(); step('click inner row (select intake row)');
  await page.waitForTimeout(700);
  console.log('strip:', JSON.stringify(await page.locator('[role="status"]').first().innerText().catch(() => '?')));
  await page.keyboard.press('Meta+Alt+Shift+KeyR'); step('⌘⌥⇧R ready');
  await page.waitForTimeout(1500);
  console.log('toasts after ready:', JSON.stringify(await readToasts(page)));
  await snap(page, '37-after-ready');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  console.log('STEPS so far:', steps.length);
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
