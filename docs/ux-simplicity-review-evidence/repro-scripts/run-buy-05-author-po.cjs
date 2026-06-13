const { launch, snap, readToasts } = require('./buy-lib.cjs');
const fs = require('fs');
(async () => {
  const { page, done } = await launch();
  const steps = [];
  const step = (s) => { steps.push(s); console.log('STEP', steps.length, s); };

  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'New PO' }).click(); step('click New PO');
  await page.waitForTimeout(800);

  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' }); step('select Vendor=Vista Verde (2 ui actions: open+pick)');
  await page.waitForTimeout(500);

  // Expected date
  const exp = page.getByRole('textbox', { name: 'Expected' });
  console.log('expected input type:', await exp.evaluate(e => e.type + ' placeholder=' + (e.placeholder || '')));
  await exp.click(); step('click Expected');
  await exp.fill('2026-06-18'); step('type Expected date');
  // Notes
  await page.getByRole('textbox', { name: 'Vendor receipt notes' }).first().fill('Dock QA buy-lane PO — handle with care'); step('type vendor receipt notes');
  // Terms -> Prepayment Required
  await page.getByLabel('Payment terms').selectOption({ label: 'Prepayment Required' }); step('select terms=Prepayment Required');
  await page.waitForTimeout(300);
  const prepayField = page.getByLabel('Prepayment amount');
  console.log('prepay after terms=Prepayment Required: visible=', await prepayField.isVisible(), 'value=', await prepayField.inputValue());
  await prepayField.fill('500'); step('type prepayment amount 500');

  // ---- Lines grid ----
  const grid = page.getByRole('region', { name: 'New PO lines' });
  async function setCell(rowIdx, colId, value) {
    const cell = grid.locator(`.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`).first();
    await cell.dblclick();
    await page.waitForTimeout(250);
    await page.keyboard.press('Meta+a').catch(() => {});
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
  }
  // Row 0
  await setCell(0, 'productName', 'QA Alpha OG'); step('row1 product (dblclick+type+Enter)');
  await setCell(0, 'unitCost', '400'); step('row1 unit cost');
  await setCell(0, 'qty', '10'); step('row1 qty');
  // Row 1
  await setCell(1, 'productName', 'QA Beta Kush'); step('row2 product');
  await setCell(1, 'unitCost', '350'); step('row2 unit cost');
  await setCell(1, 'qty', '8'); step('row2 qty');
  // Row 2 via Cmd+D duplicate of row 1? Select a cell in row1 then Cmd+D
  const r1cell = grid.locator('.ag-row[row-index="1"] .ag-cell[col-id="productName"]').first();
  await r1cell.click(); step('click row2 product cell (select)');
  await page.keyboard.press('Meta+d'); step('press Cmd+D (duplicate?)');
  await page.waitForTimeout(600);
  const row2txt = await grid.locator('.ag-row[row-index="2"]').allInnerTexts();
  console.log('row index 2 after Cmd+D:', JSON.stringify(row2txt));
  console.log('TOASTS after Cmd+D:', await readToasts(page));
  await snap(page, '05-after-cmdD');

  // If Cmd+D did nothing, fill row 2 manually
  const row2prod = await grid.locator('.ag-row[row-index="2"] .ag-cell[col-id="productName"]').first().innerText();
  if (!row2prod.trim()) {
    await setCell(2, 'productName', 'QA Gamma Haze'); step('row3 product (manual, Cmd+D no-op)');
    await setCell(2, 'unitCost', '275'); step('row3 unit cost');
    await setCell(2, 'qty', '12'); step('row3 qty');
  } else {
    // duplicated; edit name
    await setCell(2, 'productName', 'QA Gamma Haze'); step('row3 product (edited duplicate)');
  }

  // TSV paste attempt into row 3 (known deferred C02 — just record behavior)
  const r3prod = grid.locator('.ag-row[row-index="3"] .ag-cell[col-id="productName"]').first();
  await r3prod.click(); step('click row4 product cell');
  await page.evaluate(() => navigator.clipboard.writeText('QA Delta Diesel\tFlower\t\t300\t\t\t5\tlb\t\tnote-d')).catch(e => console.log('clipboard write err', e.message));
  await page.keyboard.press('Meta+v'); step('press Cmd+V TSV paste');
  await page.waitForTimeout(700);
  console.log('row3 after paste:', JSON.stringify(await grid.locator('.ag-row[row-index="3"]').allInnerTexts()));
  console.log('TOASTS after paste:', await readToasts(page));
  await snap(page, '05-after-paste');

  // Fill handle test: select row1 unitCost and try dragging fill handle
  const fh = grid.locator('.ag-fill-handle');
  console.log('fill handle count after selecting cell:', await fh.count());
  const c0 = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="unitCost"]').first();
  await c0.click(); step('click row1 unitCost (check fill handle)');
  await page.waitForTimeout(300);
  console.log('fill handle visible:', await fh.count(), await fh.first().isVisible().catch(() => false));
  if (await fh.count() && await fh.first().isVisible().catch(() => false)) {
    const fhBox = await fh.first().boundingBox();
    const target = await grid.locator('.ag-row[row-index="2"] .ag-cell[col-id="unitCost"]').first().boundingBox();
    if (fhBox && target) {
      await page.mouse.move(fhBox.x + fhBox.width / 2, fhBox.y + fhBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
      await page.mouse.up();
      step('drag fill handle unitCost row1->row3');
      await page.waitForTimeout(500);
      console.log('unitCost col after fill:', JSON.stringify(await grid.locator('.ag-cell[col-id="unitCost"]').allInnerTexts()));
      await snap(page, '05-after-fillhandle');
      // undo fill so rows keep distinct costs
      await page.keyboard.press('Meta+z'); step('Cmd+Z undo fill');
      await page.waitForTimeout(400);
      console.log('unitCost col after undo:', JSON.stringify(await grid.locator('.ag-cell[col-id="unitCost"]').allInnerTexts()));
    }
  }

  // PO total check
  const totalTxt = await page.getByText('PO total').last().evaluate(e => e.parentElement?.innerText || e.innerText).catch(() => '?');
  console.log('PO total area:', totalTxt);

  // Save draft
  const saveBtn = grid.getByRole('button', { name: 'Save draft' });
  console.log('Save draft disabled?', await saveBtn.isDisabled());
  await saveBtn.click(); step('click Save draft');
  await page.waitForTimeout(2500);
  console.log('TOASTS after save:', await readToasts(page));
  console.log('URL after save:', page.url());
  await snap(page, '05-after-save-draft');

  fs.writeFileSync('/Users/evan/work/terp-agro-operator-console/.ux-review-scratch/buy-notes-steps.json', JSON.stringify({ authoring_steps: steps }, null, 2));
  console.log('TOTAL AUTHORING STEPS:', steps.length);
  await done();
})().catch(e => { console.error(e); process.exit(1); });
