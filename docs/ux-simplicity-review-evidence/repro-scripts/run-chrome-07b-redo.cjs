// Chrome lane 07b — final redos: cell edit retry, columns checkbox menu, NF quick filter,
// thrown-error toast actions, success toast View order action.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(3500);

  // quick filter with selective term
  const subtitleText = async () => page.locator('text=/^[0-9,]+ row\\(s\\)/').first().innerText().catch(() => 'n/a');
  const qf = page.locator('input[aria-label="Filter Inventory Batches grid"]');
  obs('rows before:', await subtitleText());
  await qf.fill('NF-002');
  await page.waitForTimeout(1000);
  obs('rows after "NF-002":', await subtitleText());
  await qf.fill('');
  await page.waitForTimeout(700);

  // columns menu: dump all checkbox labels, toggle Marker
  await page.locator('button[title="Columns"]').first().click();
  await page.waitForTimeout(600);
  const checkLabels = page.locator('label:has(input[type="checkbox"])');
  const nLabels = await checkLabels.count();
  const labelTexts = [];
  for (let i = 0; i < Math.min(nLabels, 40); i++) labelTexts.push((await checkLabels.nth(i).innerText()).trim());
  obs('columns menu checkboxes:', JSON.stringify(labelTexts));
  const marker = checkLabels.filter({ hasText: /^Marker$/ }).first();
  if (await marker.isVisible().catch(() => false)) {
    await marker.click();
    await page.waitForTimeout(800);
    const h1 = await page.locator('.ag-root-wrapper').first().locator('.ag-header-cell-text').allInnerTexts();
    obs('Marker in headers after uncheck?', h1.includes('Marker'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.reload(); await page.waitForTimeout(3500);
    const h2 = await page.locator('.ag-root-wrapper').first().locator('.ag-header-cell-text').allInnerTexts();
    obs('Marker after reload?', h2.includes('Marker'), '→ persistence:', !h2.includes('Marker') ? 'PERSISTED' : 'NOT PERSISTED');
    await shot('07b-01-colpref-reload');
    // restore
    await page.locator('button[title="Columns"]').first().click(); await page.waitForTimeout(500);
    const marker2 = page.locator('label:has(input[type="checkbox"])').filter({ hasText: /^Marker$/ }).first();
    const checked = await marker2.locator('input').isChecked().catch(() => null);
    if (checked === false) { await marker2.click(); await page.waitForTimeout(400); }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  } else obs('Marker checkbox still not found');

  // cell edit retry: click once to select, then Enter key to start editing (AG default)
  const cell0 = page.locator('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell[col-id="availableQty"]').first();
  await cell0.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  let editing = await page.evaluate(() => !!document.querySelector('.ag-cell-inline-editing'));
  obs('editing after Enter on selected cell:', editing);
  if (!editing) {
    await cell0.dblclick();
    await page.waitForTimeout(600);
    editing = await page.evaluate(() => !!document.querySelector('.ag-cell-inline-editing'));
    obs('editing after dblclick retry:', editing);
  }
  if (editing) {
    const before = (await cell0.innerText().catch(() => '')).trim();
    await page.keyboard.type('555.5');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    obs(`edit commit: ${before} → ${(await page.locator('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell[col-id="availableQty"]').innerText().catch(() => 'n/a')).trim()}`);
    await toasts();
    await shot('07b-02-edit-commit');
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(900);
    obs('after ⌘Z:', (await page.locator('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell[col-id="availableQty"]').innerText().catch(() => 'n/a')).trim());
    await toasts();
  } else {
    await shot('07b-02-no-editor');
  }

  // thrown-error toast: run Log payment from palette with empty payload
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(600); await heal(); await page.waitForTimeout(300);
  await page.getByLabel('Command palette search').fill('Log payment');
  await page.waitForTimeout(900);
  const cmd = page.locator('button', { hasText: 'logPayment' }).first();
  if (await cmd.isVisible().catch(() => false)) {
    await cmd.click();
    await page.waitForTimeout(2500);
    await heal();
    const tl = await toasts();
    obs('logPayment empty-payload toasts:', JSON.stringify(tl));
    await shot('07b-03-thrown-error-toast');
    const copyBtn = page.locator('div.fixed.bottom-4.right-4 button', { hasText: 'Copy details' }).first();
    const recBtn = page.locator('div.fixed.bottom-4.right-4 button', { hasText: 'Open in Recovery' }).first();
    obs('Copy details present:', await copyBtn.isVisible().catch(() => false), '| Open in Recovery present:', await recBtn.isVisible().catch(() => false));
    if (await copyBtn.isVisible().catch(() => false)) {
      await copyBtn.click(); await page.waitForTimeout(500);
      obs('clipboard:', JSON.stringify(String(await page.evaluate(() => navigator.clipboard.readText()).catch(() => 'read failed')).slice(0, 220)));
    }
    if (await recBtn.isVisible().catch(() => false)) {
      await recBtn.click(); await page.waitForTimeout(1500);
      obs('after Open in Recovery: path=', new URL(page.url()).pathname,
        '| sidenav recovery aria-current=', await page.locator('[data-testid="sidenav-item-recovery"]').getAttribute('aria-current').catch(() => null));
      await shot('07b-04-open-in-recovery');
    } else if (await page.locator('div.fixed.bottom-4.right-4 button', { hasText: 'Open in Recovery' }).first().isVisible().catch(() => false)) { /* noop */ }
  } else obs('logPayment not found in palette');

  // success toast with action: fresh draft order on /orders
  await page.goto('http://localhost:5173/orders');
  await page.waitForTimeout(3000);
  const ordGrid = page.locator('.ag-center-cols-container').first();
  let draftIdx = -1;
  for (let i = 0; i < 15; i++) {
    const t = await ordGrid.locator(`.ag-row[row-index="${i}"]`).innerText().catch(() => '');
    if (/DRAFT/i.test(t)) { draftIdx = i; break; }
  }
  obs('draft row:', draftIdx);
  if (draftIdx >= 0) {
    await ordGrid.locator(`.ag-row[row-index="${draftIdx}"]`).click({ position: { x: 200, y: 10 } });
    await page.waitForTimeout(700);
    const primary = await page.locator('[data-status-action-primary]').first().innerText({ timeout: 2000 }).catch(() => null);
    obs('primary for draft:', JSON.stringify(primary));
    await page.keyboard.press('Meta+Enter');
    await page.waitForTimeout(4000);
    const tl2 = await toasts();
    obs('toasts after confirm:', JSON.stringify(tl2));
    await shot('07b-05-confirm-toast');
    const viewOrder = page.locator('div.fixed.bottom-4.right-4 button', { hasText: 'View order' }).first();
    if (await viewOrder.isVisible().catch(() => false)) {
      await viewOrder.click();
      await page.waitForTimeout(1500);
      obs('after View order: path=', new URL(page.url()).pathname,
        '| filter=', await page.locator('[data-grid-quick-filter]').first().inputValue().catch(() => 'n/a'),
        '| drawer=', await page.locator('aside[aria-label="Context drawer"]').isVisible().catch(() => false));
      await shot('07b-06-view-order');
    } else obs('no View order action on success toast');
  }

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
