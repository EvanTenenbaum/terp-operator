const { launch, snap, nukeOverlay, aria, readToasts } = require('./buy-lib.cjs');
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
  await poRow.locator('.ag-group-value').click(); step('select queue row PO-ACTIVE-008');
  await page.waitForTimeout(1000);
  // selection totals strip
  const strip = await page.locator('[role="status"]').first().innerText().catch(() => '?');
  console.log('totals strip:', strip.replace(/\n/g, ' | '));
  await snap(page, '32-strip');

  // verified count in actions col
  const idx = await poRow.getAttribute('row-index');
  console.log('actions col:', JSON.stringify(await queue.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${idx}"]`).allInnerTexts()));

  // READY hotkey
  await page.keyboard.press('Meta+Alt+Shift+KeyR'); step('press ⌘⌥⇧R (ready)');
  await page.waitForTimeout(1500);
  console.log('toasts after ready:', JSON.stringify(await readToasts(page)));
  await snap(page, '32-after-ready');

  // PROCESS hotkey
  await page.keyboard.press('Meta+Alt+KeyI'); step('press ⌘⌥I (process)');
  await page.waitForTimeout(2000);
  console.log('toasts after process:', JSON.stringify(await readToasts(page)));
  await snap(page, '32-after-process');

  // Preview receipt
  const pv = page.getByRole('button', { name: 'Preview receipt' }).first();
  if (await pv.isVisible().catch(() => false)) {
    await pv.click(); step('click Preview receipt');
    await page.waitForTimeout(1500);
    await snap(page, '32-preview-drawer');
    const dlg = page.locator('[role="dialog"]').last();
    console.log('PREVIEW:', (await dlg.ariaSnapshot().catch(() => '?')).slice(0, 4000));
    // post
    const post = dlg.getByRole('button', { name: /post/i }).first();
    if (await post.isVisible().catch(() => false)) {
      console.log('post btn:', await post.innerText(), 'disabled:', await post.isDisabled());
      await post.click(); step('click Post receipt');
      await page.waitForTimeout(3000);
      await snap(page, '32-after-post');
      console.log('toasts after post:', JSON.stringify(await readToasts(page)));
    } else {
      console.log('no post button in drawer; buttons:', JSON.stringify(await dlg.locator('button').allInnerTexts()));
    }
  } else console.log('Preview receipt button not visible');
  console.log('URL:', page.url());
  console.log('ALL TOASTS:', JSON.stringify(toastLog, null, 1));
  console.log('STEPS:', steps.length);
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
