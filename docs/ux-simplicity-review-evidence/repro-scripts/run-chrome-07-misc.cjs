// Chrome lane 07 — column persistence redo, quick-filter counts, cell editor probe,
// Issue tab + support packet (/orders), toast actions (success + failure), IdentityRibbon walk.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  // ───────────────────────── inventory redos ─────────────────────────
  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(3500);
  const root = page.locator('.ag-root-wrapper').first();
  const headers = async () => root.locator('.ag-header-row-column .ag-header-cell-text, .ag-header-cell-text').allInnerTexts();

  // quick filter via panel subtitle
  const subtitleText = async () => page.locator('text=/^[0-9,]+ row\\(s\\)/').first().innerText().catch(() => 'n/a');
  obs('subtitle before filter:', await subtitleText());
  const qf = page.locator('input[aria-label="Filter Inventory Batches grid"]');
  await qf.fill('Live Rosin');
  await page.waitForTimeout(1000);
  obs('subtitle after "Live Rosin":', await subtitleText());
  await qf.fill('status:posted');
  await page.waitForTimeout(1000);
  obs('subtitle after "status:posted":', await subtitleText(), '| chips:', JSON.stringify(await page.locator('[data-testid="grid-filter-chips"]').innerText().catch(() => 'none')));
  await shot('07-01-quickfilter-counts');
  await qf.fill('');
  await page.waitForTimeout(800);

  // column hide via checkbox inside columns popover
  await page.locator('button[title="Columns"]').first().click();
  await page.waitForTimeout(500);
  // the popover contains the density radiogroup; use its container
  const pop = page.locator('div').filter({ has: page.locator('[role="radiogroup"][aria-label="Row density"]') }).last();
  const markerRow = pop.locator('label').filter({ hasText: /Marker/i }).first();
  const markerInput = markerRow.locator('input[type="checkbox"]');
  obs('marker checkbox found:', await markerInput.isVisible().catch(() => false), 'checked:', await markerInput.isChecked().catch(() => null));
  if (await markerInput.isVisible().catch(() => false)) {
    await markerInput.click();
    await page.waitForTimeout(800);
    const h1 = await headers();
    obs('Marker visible after uncheck?', h1.includes('Marker'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.reload(); await page.waitForTimeout(3500);
    const h2 = await page.locator('.ag-root-wrapper').first().locator('.ag-header-cell-text').allInnerTexts();
    obs('Marker after reload?', h2.includes('Marker'), '(hidden persisted =', !h2.includes('Marker'), ')');
    await shot('07-02-column-persistence');
    // restore
    await page.locator('button[title="Columns"]').first().click(); await page.waitForTimeout(400);
    const pop2 = page.locator('div').filter({ has: page.locator('[role="radiogroup"][aria-label="Row density"]') }).last();
    const mi2 = pop2.locator('label').filter({ hasText: /Marker/i }).first().locator('input[type="checkbox"]');
    if (await mi2.isVisible().catch(() => false) && !(await mi2.isChecked().catch(() => true))) { await mi2.click(); await page.waitForTimeout(400); }
    await page.keyboard.press('Escape');
  } else { obs('marker checkbox NOT found; dumping popover:', (await pop.innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 300)); await page.keyboard.press('Escape'); }
  await page.waitForTimeout(400);

  // cell editor probe: does dblclick open an editor on availableQty?
  const cell0 = page.locator('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell[col-id="availableQty"]').first();
  await cell0.dblclick();
  await page.waitForTimeout(500);
  const editorOpen = await page.locator('.ag-cell-inline-editing, .ag-popup-editor, .ag-cell-editor input, .ag-text-field-input').first().isVisible().catch(() => false);
  obs('editor open after dblclick on availableQty:', editorOpen);
  await shot('07-03-cell-editor');
  if (editorOpen) {
    const before = (await cell0.innerText().catch(() => '')).trim();
    await page.keyboard.press('Meta+a').catch(() => {});
    await page.keyboard.type('123.5');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    obs(`edit committed: ${before} → ${(await cell0.innerText().catch(() => '')).trim()}`);
    await toasts();
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(800);
    obs('after undo:', (await cell0.innerText().catch(() => '')).trim());
    await toasts();
  } else {
    note({ type: 'finding', text: 'inventory availableQty: double-click does not open a cell editor (editable:true in code)' });
    await page.keyboard.press('Escape');
  }

  // ───────────────────────── orders: Issue tab + support packet + toast actions ─────────────────────────
  await page.goto('http://localhost:5173/orders');
  await page.waitForTimeout(3000);
  const ordGrid = page.locator('.ag-center-cols-container').first();
  // find a draft row for Confirm success toast: scan first 12 rows for DRAFT
  let draftIdx = -1;
  for (let i = 0; i < 12; i++) {
    const t = await ordGrid.locator(`.ag-row[row-index="${i}"]`).innerText().catch(() => '');
    if (/DRAFT/i.test(t)) { draftIdx = i; break; }
  }
  obs('draft order row index:', draftIdx);
  const target = draftIdx >= 0 ? draftIdx : 0;
  await ordGrid.locator(`.ag-row[row-index="${target}"]`).click({ position: { x: 200, y: 10 } });
  await page.waitForTimeout(700);

  // RowInspector Issue tab + Export support packet
  const issueBtn = page.locator('.selection-summary button', { hasText: 'Issue' }).first();
  if (await issueBtn.isVisible().catch(() => false)) {
    await issueBtn.click();
    await page.waitForTimeout(1200);
    const dlg = page.locator('[role="dialog"]').filter({ hasText: 'Row Inspector' }).first();
    obs('Issue tab:', (await dlg.innerText().catch(() => 'NO DLG')).replace(/\n+/g, ' | ').slice(0, 400));
    await shot('07-04-issue-tab');
    const exp = dlg.locator('button', { hasText: /Export support packet/i }).first();
    if (await exp.isVisible().catch(() => false)) {
      const dl = page.waitForEvent('download', { timeout: 7000 }).catch(() => null);
      await exp.click();
      const download = await dl;
      await page.waitForTimeout(1000);
      obs('support packet download:', download ? download.suggestedFilename() : 'NO DOWNLOAD');
      obs('issue tab after export click:', (await dlg.innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 300));
      await shot('07-05-support-packet');
    } else obs('Export support packet button missing on orders Issue tab');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else obs('Issue button missing on orders selection summary');

  // success toast with action: ⌘↵ on draft (Confirm) → "View order" action
  if (draftIdx >= 0) {
    await page.keyboard.press('Meta+Enter');
    await page.waitForTimeout(2500);
    const tl = await toasts();
    await shot('07-06-success-toast');
    const viewOrder = page.locator('div.fixed.bottom-4.right-4 button', { hasText: 'View order' }).first();
    if (await viewOrder.isVisible().catch(() => false)) {
      await viewOrder.click();
      await page.waitForTimeout(1200);
      obs('after View order action: url=', page.url(),
        'filter=', await page.locator('[data-grid-quick-filter]').first().inputValue().catch(() => 'n/a'),
        'drawer=', await page.locator('aside[aria-label="Context drawer"]').isVisible().catch(() => false));
      await shot('07-07-view-order-action');
    } else obs('success toast had NO View order action; toasts were:', JSON.stringify(tl));
  }

  // failure toast with actions: run postPurchaseReceipt from palette with empty payload
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(600); await heal(); await page.waitForTimeout(300);
  await page.getByLabel('Command palette search').fill('Process intake');
  await page.waitForTimeout(900);
  const cmdBtn = page.locator('button', { hasText: 'postPurchaseReceipt' }).first();
  if (await cmdBtn.isVisible().catch(() => false)) {
    await cmdBtn.click();
    await page.waitForTimeout(2000);
    await heal();
    const tl = await toasts();
    obs('failure toast(s):', JSON.stringify(tl));
    await shot('07-08-failure-toast');
    const copyBtn = page.locator('div.fixed.bottom-4.right-4 button', { hasText: 'Copy details' }).first();
    if (await copyBtn.isVisible().catch(() => false)) {
      await copyBtn.click();
      await page.waitForTimeout(500);
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(e => 'clipboard read failed: ' + e);
      obs('Copy details clipboard:', JSON.stringify(String(clip).slice(0, 200)));
    } else obs('Copy details button NOT on failure toast');
    // trigger failure again for Open in Recovery
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(600); await heal(); await page.waitForTimeout(300);
    await page.getByLabel('Command palette search').fill('Process intake');
    await page.waitForTimeout(900);
    await page.locator('button', { hasText: 'postPurchaseReceipt' }).first().click();
    await page.waitForTimeout(2000);
    await heal();
    const recBtn = page.locator('div.fixed.bottom-4.right-4 button', { hasText: 'Open in Recovery' }).first();
    if (await recBtn.isVisible().catch(() => false)) {
      await recBtn.click();
      await page.waitForTimeout(1500);
      obs('after Open in Recovery: path=', new URL(page.url()).pathname,
        '| recovery grid filter=', await page.locator('[data-grid-quick-filter]').first().inputValue().catch(() => 'n/a'),
        '| sidenav recovery current=', await page.locator('[data-testid="sidenav-item-recovery"]').getAttribute('aria-current').catch(() => null));
      await shot('07-09-open-in-recovery');
    } else obs('Open in Recovery button NOT on failure toast');
  } else obs('postPurchaseReceipt command not found in palette');

  // ───────────────────────── IdentityRibbon walk ─────────────────────────
  await page.goto('http://localhost:5173/orders');
  await page.waitForTimeout(2500);
  await page.locator('.ag-center-cols-container').first().locator('.ag-row[row-index="2"]').click({ position: { x: 200, y: 10 } });
  await page.waitForTimeout(700);
  const ribbon = page.locator('section[aria-label="Active context"]');
  const ribbonText = async () => (await ribbon.innerText().catch(() => 'NO RIBBON')).replace(/\n+/g, ' | ');
  obs('ribbon after order select:', await ribbonText());
  await shot('07-10-ribbon-order');
  for (const dest of ['sales', 'reports', 'matchmaking', 'orders']) {
    await page.locator(`[data-testid="sidenav-item-${dest}"]`).click().catch(async () => {
      obs(`sidenav item ${dest} not directly visible (in More?)`);
      await page.goto(`http://localhost:5173/${dest}`);
    });
    await page.waitForTimeout(1500);
    obs(`ribbon on /${dest}:`, await ribbonText());
  }
  await shot('07-11-ribbon-back-on-orders');

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
