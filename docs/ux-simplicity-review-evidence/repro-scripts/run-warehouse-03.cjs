// Precise chip filter test + row selection + detail panel actions
const { launch, snap, aria, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(2500);

  // Precise chip test: click "Needs picking" and inspect
  const chip = page.locator('.control-band button', { hasText: 'Needs picking' }).first();
  console.log('chip count:', await page.locator('.control-band button', { hasText: 'Needs picking' }).count());
  await chip.click();
  await page.waitForTimeout(1500);
  console.log('chip text after click:', JSON.stringify(await chip.textContent()));
  console.log('chip aria-pressed:', await chip.getAttribute('aria-pressed'));
  console.log('chip class:', await chip.getAttribute('class'));
  const rowCount = await page.evaluate(() => document.querySelectorAll('.ag-center-cols-container .ag-row').length);
  console.log('visible rows after needs_picking filter:', rowCount);
  const hdr = await page.getByRole('button', { name: /Fulfillment \d+ row/ }).textContent().catch(()=>'?');
  console.log('header:', hdr);
  await snap(page, '03-chip-needs-picking');
  // clear
  const clearAll = page.getByRole('button', { name: 'Clear all' });
  if (await clearAll.isVisible().catch(()=>false)) { await clearAll.click(); console.log('cleared via Clear all'); }
  else { await chip.click(); console.log('toggled chip off'); }
  await page.waitForTimeout(1000);

  // Now select PICK-ACTIVE-001 row. Use ag-grid row click in center cols on the matching row index.
  const rowIdx = await page.evaluate(() => {
    const pinned = [...document.querySelectorAll('.ag-pinned-left-cols-container .ag-row')];
    for (const r of pinned) if (r.innerText.includes('PICK-ACTIVE-001')) return r.getAttribute('row-index');
    return null;
  });
  console.log('PICK-ACTIVE-001 row-index:', rowIdx);
  await page.evaluate((idx) => {
    const r = document.querySelector(`.ag-center-cols-container .ag-row[row-index="${idx}"] .ag-cell`);
    if (r) { r.dispatchEvent(new MouseEvent('mousedown', {bubbles:true})); r.dispatchEvent(new MouseEvent('mouseup', {bubbles:true})); r.dispatchEvent(new MouseEvent('click', {bubbles:true})); }
  }, rowIdx);
  await page.waitForTimeout(2500);
  const pill = await page.locator('.selection-pill', { hasText: /Showing|Select a pick/ }).first().textContent().catch(()=>'?');
  console.log('selection pill:', pill);
  await snap(page, '03-row-selected');

  // Dump the Fulfillment Lines region + any selection action bar
  const linesAria = await aria(page, '[aria-label="Fulfillment Lines"], section:has(h2:has-text("Fulfillment Lines"))').catch(()=>null);
  console.log('=== LINES REGION ===');
  console.log(linesAria || await aria(page, 'main').then(a => a.slice(a.indexOf('Fulfillment Lines'))));
  console.log('TOASTS:', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
