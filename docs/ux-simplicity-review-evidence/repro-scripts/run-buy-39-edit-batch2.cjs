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

  // identify rows: batch codes + statuses
  const rows = await page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    const out = [];
    fw2.querySelectorAll('.ag-pinned-left-cols-container .ag-row').forEach(r => {
      const idx = r.getAttribute('row-index');
      const code = r.innerText.trim();
      const center = fw2.querySelector(`.ag-center-cols-container .ag-row[row-index="${idx}"]`);
      const cells = {};
      center?.querySelectorAll('.ag-cell').forEach(c => cells[c.getAttribute('col-id')] = c.innerText.trim());
      out.push({ idx, code, qty: cells.intakeQty });
    });
    return out;
  });
  console.log('inner rows:', JSON.stringify(rows));
  const draftIdx = rows.find(r => r.qty?.startsWith('166'))?.idx;
  console.log('draft row idx:', draftIdx);

  // single click + type immediately
  const qtyCell = fw.locator(`.ag-center-cols-container .ag-row[row-index="${draftIdx}"] .ag-cell[col-id="intakeQty"]`).first();
  await qtyCell.click();
  await page.waitForTimeout(300);
  const focusInfo = await page.evaluate(() => {
    const a = document.activeElement;
    const f = document.querySelector('.ag-full-width-container .ag-cell-focus');
    return { active: a.tagName + '.' + (a.className || '').toString().slice(0, 40), focusCell: f ? f.getAttribute('col-id') : null };
  });
  console.log('focus after click:', JSON.stringify(focusInfo));
  await page.keyboard.type('150');
  await page.waitForTimeout(300);
  const ed = await page.evaluate(() => { const a = document.activeElement; return a.tagName + ' val=' + (a.value ?? ''); });
  console.log('editor after typing:', ed);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const after = await page.evaluate((idx) => {
    const fw2 = document.querySelector('.ag-full-width-container');
    const c = fw2?.querySelector(`.ag-center-cols-container .ag-row[row-index="${idx}"] .ag-cell[col-id="intakeQty"]`);
    return c ? { txt: c.innerText.trim(), bg: c.style.backgroundColor } : null;
  }, draftIdx);
  console.log('qty cell after edit:', JSON.stringify(after));
  await snap(page, '39-after-qty-edit');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
