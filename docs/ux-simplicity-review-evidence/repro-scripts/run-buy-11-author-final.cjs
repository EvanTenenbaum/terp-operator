const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
const fs = require('fs');
(async () => {
  const { page, done } = await launch();
  const steps = [];
  const step = (s) => { steps.push(s); console.log('STEP', steps.length, s); };
  const toastLog = new Set();
  const pollToasts = setInterval(async () => {
    try { (await readToasts(page)).forEach(t => toastLog.add(t)); } catch {}
  }, 400);

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await nukeOverlay(page);
  await page.getByRole('button', { name: 'New PO' }).click(); step('click New PO');
  await page.waitForTimeout(1000);
  await nukeOverlay(page);
  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' }); step('select Vendor');
  await page.waitForTimeout(400);
  await page.getByRole('textbox', { name: 'Expected' }).fill('2026-06-18'); step('fill Expected 2026-06-18');
  await page.getByRole('textbox', { name: 'Vendor receipt notes' }).first().fill('Dock QA buy-lane PO'); step('fill notes');
  await page.getByLabel('Payment terms').selectOption({ label: 'Prepayment Required' }); step('terms=Prepayment Required');
  await page.getByLabel('Prepayment amount').fill('500'); step('prepayment 500');

  const grid = page.getByRole('region', { name: 'New PO lines' });
  async function ensureCol(colId) {
    await page.evaluate((cid) => {
      const reg = document.querySelector('[aria-label="New PO lines"]');
      const vp = reg?.querySelector('.ag-center-cols-viewport');
      if (!vp) return;
      // crude: scroll left for early cols, right for late cols
      const lateCols = ['externalNotes', 'internalNotes', 'tags', 'lineTotal'];
      vp.scrollLeft = lateCols.includes(cid) ? vp.scrollWidth : 0;
    }, colId);
    await page.waitForTimeout(300);
  }
  async function setCell(rowIdx, colId, value, label) {
    await ensureCol(colId);
    await nukeOverlay(page);
    const cell = grid.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(150);
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const txt = await cell.innerText().catch(() => '?');
    console.log(`  cell[${rowIdx}.${colId}] -> "${txt}"`);
    step(label);
  }
  await setCell(0, 'productName', 'QA Alpha OG', 'r1 product');
  await setCell(0, 'unitCost', '400', 'r1 cost');
  await setCell(0, 'qty', '10', 'r1 qty');
  await setCell(1, 'productName', 'QA Beta Kush', 'r2 product');
  await setCell(1, 'unitCost', '350', 'r2 cost');
  await setCell(1, 'qty', '8', 'r2 qty');
  await setCell(2, 'productName', 'QA Gamma Haze', 'r3 product');
  await setCell(2, 'unitCost', '275', 'r3 cost');
  await setCell(2, 'qty', '12', 'r3 qty');

  // dblclick-to-edit check (spreadsheet convention)
  const dc = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="externalNotes"]').first();
  await dc.scrollIntoViewIfNeeded();
  await dc.dblclick(); step('dblclick notes cell (edit test)');
  await page.waitForTimeout(400);
  const dcEd = await page.evaluate(() => !!document.querySelector('.ag-cell-inline-editing, .ag-popup-editor'));
  console.log('dblclick opened editor?', dcEd);
  if (dcEd) { await page.keyboard.type('note-A'); await page.keyboard.press('Enter'); }
  else { await dc.click(); await page.keyboard.type('note-A'); await page.keyboard.press('Enter'); step('fallback type note-A'); }
  await page.waitForTimeout(200);

  // Cmd+D fill-down on externalNotes rows 0-2
  const n0 = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="externalNotes"]').first();
  const n2 = grid.locator('.ag-row[row-index="2"] .ag-cell[col-id="externalNotes"]').first();
  await n0.click(); step('click notes r1');
  await n2.click({ modifiers: ['Shift'] }); step('shift-click notes r3 (range)');
  await page.waitForTimeout(300);
  await page.keyboard.press('Meta+d'); step('Cmd+D fill-down');
  await page.waitForTimeout(500);
  for (const i of [0, 1, 2]) console.log(`notes[${i}]:`, await grid.locator(`.ag-row[row-index="${i}"] .ag-cell[col-id="externalNotes"]`).first().innerText());
  await snap(page, '11-after-cmdD');

  // Fill handle: select r1 costRangeLow? use qty col on row 3 instead -> no, test fill handle on unitCost r1->r2 then restore
  await ensureCol('unitCost');
  const c0 = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="unitCost"]').first();
  await c0.click(); step('click r1 unitCost');
  await page.waitForTimeout(250);
  const fh = grid.locator('.ag-fill-handle').first();
  if (await fh.isVisible().catch(() => false)) {
    const fhBox = await fh.boundingBox();
    const tBox = await grid.locator('.ag-row[row-index="1"] .ag-cell[col-id="unitCost"]').first().boundingBox();
    await page.mouse.move(fhBox.x + fhBox.width / 2, fhBox.y + fhBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2, { steps: 6 });
    await page.mouse.up(); step('drag fill handle r1->r2 unitCost');
    await page.waitForTimeout(500);
    console.log('unitCost r2 after fill:', await grid.locator('.ag-row[row-index="1"] .ag-cell[col-id="unitCost"]').first().innerText());
    await snap(page, '11-after-fillhandle');
    // restore r2 cost
    await setCell(1, 'unitCost', '350', 'restore r2 cost');
  } else console.log('fill handle not visible');

  // TSV paste (known deferred C02 — record only)
  await ensureCol('productName');
  const p3 = grid.locator('.ag-row[row-index="3"] .ag-cell[col-id="productName"]').first();
  await p3.scrollIntoViewIfNeeded();
  await p3.click(); step('click r4 product');
  await page.evaluate(() => navigator.clipboard.writeText('QA Delta Diesel\t300\t5')).catch(e => console.log('clip err', e.message));
  await page.keyboard.press('Meta+v'); step('Cmd+V TSV');
  await page.waitForTimeout(600);
  console.log('r4 product after paste:', await p3.innerText());

  // header strip date check
  console.log('header strip:', (await page.locator('.po-header-strip').innerText()).replace(/\n/g, ' | '));
  console.log('PO total strip:', await page.locator('.po-total-strip').innerText());

  await nukeOverlay(page);
  await grid.getByRole('button', { name: 'Save draft' }).click(); step('click Save draft');
  await page.waitForTimeout(3500);
  console.log('URL after save:', page.url());
  await snap(page, '11-after-save');

  // find my PO in the list
  const listRegion = page.getByRole('region', { name: 'Recent purchase orders' });
  if (await listRegion.isVisible().catch(() => false)) {
    await listRegion.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('Vista');
    await page.waitForTimeout(800);
    console.log('Vista rows:', JSON.stringify(await listRegion.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
    console.log('Vista pinned:', JSON.stringify(await listRegion.locator('.ag-pinned-left-cols-container .ag-row').allInnerTexts()));
  } else {
    console.log('list region not visible; main text head:', (await page.locator('main').innerText()).slice(0, 600));
  }
  await snap(page, '11-after-save-list');
  clearInterval(pollToasts);
  console.log('ALL TOASTS SEEN:', JSON.stringify([...toastLog], null, 1));
  fs.writeFileSync('/Users/evan/work/terp-agro-operator-console/.ux-review-scratch/buy-notes-steps.json', JSON.stringify({ authoring_steps: steps }, null, 2));
  console.log('TOTAL STEPS:', steps.length);
  await done();
})().catch(e => { console.error(e); process.exit(1); });
