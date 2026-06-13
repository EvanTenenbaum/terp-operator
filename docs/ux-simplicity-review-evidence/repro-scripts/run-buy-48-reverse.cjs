const { launch, snap, nukeOverlay, aria, readToasts } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  const toastLog = [];
  setInterval(async () => { try { (await readToasts(page)).forEach(t => { if (!toastLog.includes(t)) toastLog.push(t); }); } catch {} }, 300);
  await page.goto('http://localhost:5173/recovery');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  // search for my receipt
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('MQBNJOGV');
  await page.waitForTimeout(1500);
  await snap(page, '48-search');
  const log = page.getByRole('region', { name: 'Action Log' });
  const pinned = await log.locator('.ag-pinned-left-cols-container .ag-row').allInnerTexts();
  const center = await log.locator('.ag-center-cols-container .ag-row').allInnerTexts();
  pinned.forEach((p, i) => console.log('ROW', i, p.replace(/\n/g, ' '), '||', (center[i] || '').replace(/\n/g, ' ')));
  // select the Process intake row
  const target = log.locator('.ag-pinned-left-cols-container .ag-row').filter({ hasText: 'Process intake' }).first();
  if (!(await target.count())) { console.log('no Process intake row found via search'); }
  else {
    await target.click();
    await page.waitForTimeout(900);
    // selection bar buttons
    console.log('selection bar:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.selection-summary button')].map(b => ({ t: b.innerText.trim(), dis: b.disabled, title: b.title || null })))));
    await snap(page, '48-row-selected');
  }
  console.log('TOASTS:', JSON.stringify(toastLog, null, 1));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
