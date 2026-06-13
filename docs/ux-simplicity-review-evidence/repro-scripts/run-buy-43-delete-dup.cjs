const { launch, snap, nukeOverlay, readToasts } = require('./buy-lib.cjs');
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
  // the dup row 877: find its row-index, then the Delete button within the SAME inner grid row (right pinned)
  const idx = await page.evaluate(() => {
    const fw2 = document.querySelector('.ag-full-width-container');
    const r = [...fw2.querySelectorAll('.ag-pinned-left-cols-container .ag-row')].find(x => x.innerText.includes('MQBNRJIH-877'));
    return r?.getAttribute('row-index');
  });
  console.log('dup idx:', idx);
  const actionsRow = fw.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${idx}"]`);
  console.log('actions row text:', JSON.stringify(await actionsRow.allInnerTexts()));
  const delBtn = actionsRow.getByRole('button', { name: 'Delete' });
  console.log('delete btn count:', await delBtn.count(), 'disabled:', await delBtn.isDisabled().catch(() => '?'), 'title:', await delBtn.getAttribute('title').catch(() => null));
  await delBtn.click();
  await page.waitForTimeout(1500);
  console.log('toasts after delete:', JSON.stringify(await readToasts(page)));
  // any confirm?
  const conf = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasNotText: 'Context drawer' }).first();
  if (await conf.isVisible().catch(() => false)) {
    console.log('confirm:', (await conf.innerText()).slice(0, 300).replace(/\n/g, ' | '));
    await snap(page, '43-del-confirm');
    await conf.getByRole('button', { name: /delete|remove|confirm|yes/i }).last().click();
    await page.waitForTimeout(1500);
  }
  const codes = await page.evaluate(() => [...document.querySelectorAll('.ag-full-width-container .ag-pinned-left-cols-container .ag-row')].map(r => r.innerText.trim()));
  console.log('rows now:', JSON.stringify(codes));
  if (codes.some(c => c.includes('877'))) {
    console.log('delete failed; trying Reject');
    const rej = actionsRow.getByRole('button', { name: 'Reject' });
    await rej.click();
    await page.waitForTimeout(1500);
    const conf2 = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasNotText: 'Context drawer' }).first();
    if (await conf2.isVisible().catch(() => false)) {
      console.log('reject dialog:', (await conf2.innerText()).slice(0, 300).replace(/\n/g, ' | '));
      await snap(page, '43-reject-dialog');
      // fill reason if needed
      const ta = conf2.locator('textarea, input[type="text"]').first();
      if (await ta.isVisible().catch(() => false)) await ta.fill('QA duplicate row cleanup');
      await conf2.getByRole('button', { name: /reject|confirm|yes/i }).last().click();
      await page.waitForTimeout(1500);
    }
    console.log('toasts after reject:', JSON.stringify(await readToasts(page)));
    console.log('rows now:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.ag-full-width-container .ag-pinned-left-cols-container .ag-row')].map(r => r.innerText.trim()))));
  }
  await snap(page, '43-end');
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
