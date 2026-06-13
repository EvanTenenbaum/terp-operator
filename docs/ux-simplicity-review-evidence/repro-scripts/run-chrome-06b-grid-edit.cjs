// Chrome lane 06b — OperatorGrid editing features on /inventory (batches grid scoped
// by its Marker column): quick filter counts, column persistence, TSV paste, fill
// handle, ⌘D fill-down, undo/redo, SelectionSummary, RowInspector + support packet.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(3500);

  // find the batches grid root (has legacyMarker column header)
  const gridIdx = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll('.ag-root-wrapper'));
    return roots.findIndex(r => r.querySelector('[col-id="legacyMarker"]'));
  });
  obs('batches grid root index:', gridIdx);
  const root = page.locator('.ag-root-wrapper').nth(gridIdx);
  const rows = root.locator('.ag-center-cols-container .ag-row');
  const headerTexts = async () => root.locator('.ag-header-cell-text').allInnerTexts();
  obs('headers:', JSON.stringify(await headerTexts()));
  obs('rendered rows:', await rows.count());

  // ── quick filter with counts ──
  const qf = page.locator('input[aria-label="Filter Inventory Batches grid"]');
  const subtitle = root.locator('..').locator('text=/row\\(s\\)/').first();
  const rowsBefore = await rows.count();
  await qf.fill('NF-0');
  await page.waitForTimeout(900);
  const rowsAfter = await rows.count();
  const chips = await page.locator('[data-testid="grid-filter-chips"]').innerText().catch(() => 'no chips');
  obs(`quick filter "NF-0": rendered ${rowsBefore} → ${rowsAfter}; chips=`, JSON.stringify(chips.replace(/\n/g, ' | ')));
  await shot('06b-01-quickfilter');
  await qf.fill('');
  await page.waitForTimeout(700);

  // ── column hide persistence (Marker) ──
  const colsBtn = page.locator('button[title="Columns"]').nth(0);
  const hdr0 = await headerTexts();
  await colsBtn.click(); await page.waitForTimeout(500);
  await shot('06b-02-columns-menu');
  const markerToggle = page.locator('label,button').filter({ hasText: /^Marker$/ }).last();
  if (await markerToggle.isVisible().catch(() => false)) {
    await markerToggle.click(); await page.waitForTimeout(700);
    const hdr1 = await headerTexts();
    obs('Marker before?', hdr0.includes('Marker'), '→ after toggle?', hdr1.includes('Marker'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.reload(); await page.waitForTimeout(3500);
    const gridIdx2 = await page.evaluate(() => Array.from(document.querySelectorAll('.ag-root-wrapper')).findIndex(r => r.querySelector('[col-id="batchCode"]')));
    const hdr2 = await page.locator('.ag-root-wrapper').nth(Math.max(gridIdx2, 0)).locator('.ag-header-cell-text').allInnerTexts();
    obs('after reload headers:', JSON.stringify(hdr2), '| Marker restored?', hdr2.includes('Marker'));
    if (hdr2.includes('Marker')) note({ type: 'finding', text: 'inventory column prefs (hide Marker) did NOT persist across reload' });
  } else { obs('Marker toggle not found'); await page.keyboard.press('Escape'); }
  await page.waitForTimeout(500);

  // re-resolve root after reload
  const gridIdx3 = await page.evaluate(() => Array.from(document.querySelectorAll('.ag-root-wrapper')).findIndex(r => r.querySelector('[col-id="legacyMarker"], [col-id="batchCode"]')));
  const root2 = page.locator('.ag-root-wrapper').nth(Math.max(gridIdx3, 0));

  // ── cell edit + undo/redo on availableQty ──
  const cell = (r) => root2.locator(`.ag-center-cols-container .ag-row[row-index="${r}"] .ag-cell[col-id="availableQty"]`);
  const cellVal = async (r) => (await cell(r).innerText().catch(() => 'n/a')).trim();
  const v0 = await cellVal(0);
  obs('availableQty row0 before edit:', v0);
  await cell(0).dblclick();
  await page.waitForTimeout(400);
  await page.keyboard.type('4242');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  obs('after edit:', await cellVal(0));
  await toasts();
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(700);
  obs('after ⌘Z (undo):', await cellVal(0));
  await page.keyboard.press('Meta+Shift+z');
  await page.waitForTimeout(700);
  obs('after ⌘⇧Z (redo):', await cellVal(0));
  await page.keyboard.press('Meta+z'); // leave as original
  await page.waitForTimeout(500);
  await shot('06b-03-undo-redo');

  // ── ⌘D fill-down: click cell row1, shift-click row3 same col, Meta+D ──
  await cell(1).click();
  await page.waitForTimeout(300);
  await cell(3).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(400);
  const pillsRange = await page.locator('.selection-summary .selection-pill').allInnerTexts().catch(() => []);
  obs('cell-range pills:', JSON.stringify(pillsRange));
  const before13 = [await cellVal(1), await cellVal(2), await cellVal(3)];
  await page.keyboard.press('Meta+d');
  await page.waitForTimeout(900);
  const after13 = [await cellVal(1), await cellVal(2), await cellVal(3)];
  obs('⌘D fill-down:', JSON.stringify(before13), '→', JSON.stringify(after13));
  await toasts();
  await shot('06b-04-filldown');
  // undo fill-down
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(400);
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(400);

  // ── TSV paste: focus availableQty row5, paste two-row TSV ──
  await cell(5).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => navigator.clipboard.writeText('111\n222'));
  const b5 = [await cellVal(5), await cellVal(6)];
  await page.keyboard.press('Meta+v');
  await page.waitForTimeout(1000);
  const a5 = [await cellVal(5), await cellVal(6)];
  obs('TSV paste rows 5-6:', JSON.stringify(b5), '→', JSON.stringify(a5));
  await toasts();
  await shot('06b-05-paste');
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(300);
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(300);

  // ── fill handle drag ──
  await cell(8).click();
  await page.waitForTimeout(400);
  const handle = root2.locator('.ag-fill-handle').first();
  const hVis = await handle.isVisible().catch(() => false);
  obs('fill handle visible after cell click:', hVis);
  if (hVis) {
    const hb = await handle.boundingBox();
    const target = await cell(10).boundingBox();
    if (hb && target) {
      const b8 = [await cellVal(8), await cellVal(9), await cellVal(10)];
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(900);
      const a8 = [await cellVal(8), await cellVal(9), await cellVal(10)];
      obs('fill handle drag rows 8-10:', JSON.stringify(b8), '→', JSON.stringify(a8));
      await toasts();
      await shot('06b-06-fillhandle');
      await page.keyboard.press('Meta+z'); await page.waitForTimeout(300);
      await page.keyboard.press('Meta+z'); await page.waitForTimeout(300);
    }
  } else note({ type: 'finding', text: 'inventory grid: fill handle not visible after selecting a cell' });

  // ── SelectionSummary + RowInspector + support packet ──
  await root2.locator('.ag-center-cols-container .ag-row[row-index="2"]').click({ position: { x: 100, y: 10 } });
  await page.waitForTimeout(700);
  obs('row-select pills:', JSON.stringify(await page.locator('.selection-summary .selection-pill').allInnerTexts().catch(() => [])));
  for (const tabBtn of ['History', 'Relationship', 'Issue']) {
    const btn = page.locator('.selection-summary button', { hasText: tabBtn }).first();
    if (!(await btn.isVisible().catch(() => false))) { obs(`selection-summary ${tabBtn} button missing`); continue; }
    await btn.click();
    await page.waitForTimeout(1200);
    const dlg = page.locator('[role="dialog"]').filter({ hasText: 'Row Inspector' }).first();
    const txt = await dlg.innerText().catch(() => 'NO INSPECTOR');
    obs(`RowInspector ${tabBtn}:`, txt.replace(/\n+/g, ' | ').slice(0, 350));
    if (tabBtn === 'Issue') {
      await shot('06b-07-inspector-issue');
      const exp = dlg.locator('button', { hasText: /Export support packet/i }).first();
      if (await exp.isVisible().catch(() => false)) {
        const dl = page.waitForEvent('download', { timeout: 6000 }).catch(() => null);
        await exp.click();
        await page.waitForTimeout(1500);
        const download = await dl;
        obs('support packet download:', download ? download.suggestedFilename() : 'none (may render inline)');
        obs('issue tab after export:', (await dlg.innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 300));
        await shot('06b-08-support-packet');
      } else obs('Export support packet button NOT found on Issue tab');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
