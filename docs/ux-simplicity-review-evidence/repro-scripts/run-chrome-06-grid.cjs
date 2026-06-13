// Chrome lane 06 — OperatorGrid features on /inventory.
const { start } = require('./lib-chrome.cjs');
const fs = require('fs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(3500);

  // identify the Inventory Batches grid quick filter
  const qf = page.locator('input[aria-label="Filter Inventory Batches grid"]');
  obs('inventory quick filter present:', await qf.isVisible().catch(() => false));
  // scope: the panel containing the batches grid — use the ag-root that follows the qf
  const panel = page.locator('div,section').filter({ has: qf }).last();
  const grid = panel.locator('.ag-center-cols-container').first();

  const rowCount = async () => grid.locator('.ag-row').count();
  obs('initial rows rendered:', await rowCount());

  // ── 1. quick filter ──
  const sampleCode = await grid.locator('.ag-row[row-index="0"] .ag-cell').first().innerText().catch(() => '');
  // batchCode is pinned-left; grab from pinned container instead if empty
  const pinned = panel.locator('.ag-pinned-left-cols-container .ag-row[row-index="0"]');
  const code = (await pinned.innerText().catch(() => '')) || sampleCode;
  obs('row0 code:', JSON.stringify(code.slice(0, 30)));
  await qf.fill(code.trim().split(/\s/)[0] || 'NF');
  await page.waitForTimeout(900);
  obs('rows after quick filter:', await rowCount());
  const chips = await page.locator('[data-testid="grid-filter-chips"]').innerText().catch(() => 'no chips');
  obs('filter chips:', JSON.stringify(chips));
  await shot('06-01-quickfilter');
  await qf.fill('');
  await page.waitForTimeout(700);

  // ── 2. advanced filter builder ──
  const advBtn = panel.locator('button[title="Advanced filters"]').first();
  obs('advanced filters button:', await advBtn.isVisible().catch(() => false));
  await advBtn.click();
  await page.waitForTimeout(600);
  const builder = page.locator('[data-testid="advanced-filter-builder"]');
  obs('builder visible:', await builder.isVisible().catch(() => false));
  await shot('06-02-builder-open');
  // add a condition
  const addCond = builder.locator('button', { hasText: /add condition/i }).first();
  if (await addCond.isVisible().catch(() => false)) {
    await addCond.click();
    await page.waitForTimeout(500);
    obs('builder after add condition:', (await builder.innerText()).replace(/\n+/g, ' | ').slice(0, 400));
    // pick field/operator/value via first selects
    const selects = builder.locator('select');
    const nSel = await selects.count();
    obs('builder selects:', nSel);
    if (nSel >= 1) {
      const opts = await selects.nth(0).locator('option').allInnerTexts();
      obs('field options:', JSON.stringify(opts.slice(0, 15)));
      await selects.nth(0).selectOption({ index: Math.min(1, opts.length - 1) });
      await page.waitForTimeout(300);
    }
    const valInput = builder.locator('input[type="text"], input:not([type])').first();
    if (await valInput.isVisible().catch(() => false)) {
      await valInput.fill('open');
      await page.waitForTimeout(900);
    }
    obs('rows after advanced condition:', await rowCount());
    const advChips = await page.locator('[data-testid="grid-advanced-filter-chips"]').innerText().catch(() => 'no adv chips');
    obs('advanced chips:', JSON.stringify(advChips.replace(/\n+/g, ' | ')));
    await shot('06-03-builder-condition');
    // clear
    const clear = page.locator('button[aria-label="Clear all advanced filters"]');
    if (await clear.isVisible().catch(() => false)) { await clear.click(); await page.waitForTimeout(500); }
    else await builder.locator('button', { hasText: /close builder/i }).click().catch(() => {});
  } else {
    note({ type: 'finding', text: 'inventory advanced filter builder: no Add condition control found' });
    await shot('06-03-builder-nocond');
  }
  await page.waitForTimeout(500);

  // ── 3. column prefs: hide a column, reload, verify persisted ──
  const colsBtn = panel.locator('button[title="Columns"]').first();
  await colsBtn.click();
  await page.waitForTimeout(500);
  await shot('06-04-columns-menu');
  const menuText = await page.locator('[role="menu"], .columns-menu, [class*="columns"]').last().innerText().catch(() => '');
  obs('columns menu:', menuText.replace(/\n+/g, ' | ').slice(0, 400));
  // toggle "Marker" column off (it is visible by default)
  const markerToggle = page.locator('label,button').filter({ hasText: /^Marker$/ }).first();
  const headerSel = '.ag-header-cell-text';
  const headersBefore = await panel.locator(headerSel).allInnerTexts();
  obs('headers before:', JSON.stringify(headersBefore));
  if (await markerToggle.isVisible().catch(() => false)) {
    await markerToggle.click();
    await page.waitForTimeout(700);
    const headersAfter = await panel.locator(headerSel).allInnerTexts();
    obs('Marker hidden?', !headersAfter.includes('Marker'), JSON.stringify(headersAfter));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    // reload
    await page.reload();
    await page.waitForTimeout(3500);
    const headersReload = await page.locator('.ag-header-cell-text').allInnerTexts();
    obs('after reload, Marker still hidden?', !headersReload.includes('Marker'), JSON.stringify(headersReload.slice(0, 15)));
    await shot('06-05-columns-persisted');
    // restore via reset
    const colsBtn2 = page.locator('button[title="Columns"]').first();
    await colsBtn2.click(); await page.waitForTimeout(400);
    const reset = page.locator('button[title="Reset column layout"]');
    if (await reset.isVisible().catch(() => false)) { await reset.click(); await page.waitForTimeout(600); obs('reset clicked'); }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  } else obs('Marker toggle not found in columns menu');

  // ── 4. density toggle ──
  const density = page.locator('[role="radiogroup"][aria-label="Row density"]');
  const dVis = await density.isVisible().catch(() => false);
  obs('density radiogroup visible:', dVis);
  if (dVis) {
    const rowH = async () => page.locator('.ag-center-cols-container .ag-row').first().evaluate(el => el.getBoundingClientRect().height).catch(() => -1);
    const before = await rowH();
    const btns = density.locator('button');
    obs('density options:', JSON.stringify(await btns.allInnerTexts()));
    await btns.first().click(); await page.waitForTimeout(600);
    const afterA = await rowH();
    await btns.last().click(); await page.waitForTimeout(600);
    const afterB = await rowH();
    obs(`row heights: initial=${before} afterFirst=${afterA} afterLast=${afterB}`);
    await shot('06-06-density');
  } else {
    // density may live inside Columns menu
    await page.locator('button[title="Columns"]').first().click(); await page.waitForTimeout(400);
    const dg = page.locator('[role="radiogroup"][aria-label="Row density"]');
    obs('density inside columns menu:', await dg.isVisible().catch(() => false));
    if (await dg.isVisible().catch(() => false)) {
      const rowH = async () => page.locator('.ag-center-cols-container .ag-row').first().evaluate(el => el.getBoundingClientRect().height).catch(() => -1);
      const before = await rowH();
      obs('density options:', JSON.stringify(await dg.locator('button').allInnerTexts()));
      await dg.locator('button').first().click(); await page.waitForTimeout(600);
      const after = await rowH();
      obs(`row height ${before} → ${after}`);
      await shot('06-06-density');
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }

  // ── 5. CSV export ──
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.locator('button[title="Export visible grid CSV"]').first().click();
  const download = await dl;
  if (download) {
    const p = '/Users/evan/work/terp-agro-operator-console/.ux-review-scratch/chrome-export-inventory.csv';
    await download.saveAs(p);
    const head = fs.readFileSync(p, 'utf8').split('\n').slice(0, 3).join(' ⏎ ');
    obs('CSV export landed:', download.suggestedFilename(), '| first lines:', head.slice(0, 300));
  } else {
    note({ type: 'finding', text: 'inventory CSV export: no download event within 8s of clicking export' });
    await toasts();
  }
  await shot('06-07-csv');

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
