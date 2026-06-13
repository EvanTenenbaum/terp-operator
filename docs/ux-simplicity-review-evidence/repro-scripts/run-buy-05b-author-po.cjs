const { launch, snap, readToasts, nukeOverlay } = require('./buy-lib.cjs');
const fs = require('fs');
(async () => {
  const { page, done } = await launch();
  const steps = [];
  const step = (s) => { steps.push(s); console.log('STEP', steps.length, s); };

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await nukeOverlay(page);
  await page.getByRole('button', { name: 'New PO' }).click(); step('click New PO');
  await page.waitForTimeout(800);
  await nukeOverlay(page);

  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' }); step('select Vendor=Vista Verde');
  await page.waitForTimeout(500);
  const exp = page.getByRole('textbox', { name: 'Expected' });
  await exp.fill('2026-06-18'); step('fill Expected date');
  await page.getByRole('textbox', { name: 'Vendor receipt notes' }).first().fill('Dock QA buy-lane PO'); step('fill notes');
  await page.getByLabel('Payment terms').selectOption({ label: 'Prepayment Required' }); step('select terms=Prepayment Required');
  await page.getByLabel('Prepayment amount').fill('500'); step('fill prepayment 500');

  const grid = page.getByRole('region', { name: 'New PO lines' });
  async function setCell(rowIdx, colId, value) {
    await nukeOverlay(page);
    const cell = grid.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.dblclick();
    await page.waitForTimeout(200);
    await page.keyboard.press('Meta+a').catch(() => {});
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  }
  await setCell(0, 'productName', 'QA Alpha OG'); step('row1 product');
  await setCell(0, 'unitCost', '400'); step('row1 cost');
  await setCell(0, 'qty', '10'); step('row1 qty');
  await setCell(1, 'productName', 'QA Beta Kush'); step('row2 product');
  await setCell(1, 'unitCost', '350'); step('row2 cost');
  await setCell(1, 'qty', '8'); step('row2 qty');
  await setCell(2, 'productName', 'QA Gamma Haze'); step('row3 product');
  await setCell(2, 'unitCost', '275'); step('row3 cost');
  await setCell(2, 'qty', '12'); step('row3 qty');

  // TSV paste into row 4 (known deferred C02 — record behavior only)
  await nukeOverlay(page);
  const r3prod = grid.locator('.ag-row[row-index="3"] .ag-cell[col-id="productName"]').first();
  await r3prod.scrollIntoViewIfNeeded();
  await r3prod.click(); step('click row4 product');
  await page.evaluate(() => navigator.clipboard.writeText('QA Delta Diesel\t300\t5')).catch(e => console.log('clip err', e.message));
  await page.keyboard.press('Meta+v'); step('Cmd+V TSV paste');
  await page.waitForTimeout(700);
  console.log('row idx3 after paste:', JSON.stringify(await grid.locator('.ag-row[row-index="3"]').allInnerTexts()));
  console.log('TOASTS after paste:', await readToasts(page));
  await snap(page, '05b-after-paste');

  // Fill handle: select row0 unitCost, drag handle down to row2
  await nukeOverlay(page);
  const c0 = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="unitCost"]').first();
  await c0.scrollIntoViewIfNeeded();
  await c0.click(); step('click row1 unitCost');
  await page.waitForTimeout(300);
  const fh = grid.locator('.ag-fill-handle').first();
  const fhVisible = await fh.isVisible().catch(() => false);
  console.log('fill handle visible:', fhVisible);
  if (fhVisible) {
    const fhBox = await fh.boundingBox();
    const target = await grid.locator('.ag-row[row-index="2"] .ag-cell[col-id="unitCost"]').first().boundingBox();
    await page.mouse.move(fhBox.x + fhBox.width / 2, fhBox.y + fhBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
    step('drag fill handle r1->r3 unitCost');
    await page.waitForTimeout(500);
    const costs = await grid.locator('.ag-cell[col-id="unitCost"]').allInnerTexts();
    console.log('unitCost after fill:', JSON.stringify(costs));
    await snap(page, '05b-after-fillhandle');
    await page.keyboard.press('Meta+z'); step('Cmd+Z undo');
    await page.waitForTimeout(400);
    console.log('unitCost after undo:', JSON.stringify(await grid.locator('.ag-cell[col-id="unitCost"]').allInnerTexts()));
  }

  const headerStrip = await page.locator('.po-header-strip').innerText().catch(() => '?');
  console.log('header strip:', headerStrip.replace(/\n/g, ' | '));

  const saveBtn = grid.getByRole('button', { name: 'Save draft' });
  console.log('Save draft disabled?', await saveBtn.isDisabled());
  console.log('Approve PO disabled?', await grid.getByRole('button', { name: 'Approve PO' }).isDisabled());
  await saveBtn.click(); step('click Save draft');
  await page.waitForTimeout(2500);
  console.log('TOASTS after save:', await readToasts(page));
  console.log('URL after save:', page.url());
  await snap(page, '05b-after-save-draft');
  // dump main region heading to find PO number
  const mainTxt = await page.locator('main').innerText();
  const m = mainTxt.match(/PO[-A-Z0-9]+/g);
  console.log('PO ids on page:', JSON.stringify([...new Set(m || [])].slice(0, 10)));

  fs.writeFileSync('/Users/evan/work/terp-agro-operator-console/.ux-review-scratch/buy-notes-steps.json', JSON.stringify({ authoring_steps: steps }, null, 2));
  console.log('TOTAL AUTHORING STEPS:', steps.length);
  await done();
})().catch(e => { console.error(e); process.exit(1); });
