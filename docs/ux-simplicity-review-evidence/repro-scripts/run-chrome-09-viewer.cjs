// Chrome lane 09 — viewer role sweep: 6 views, write-control census, palette mutation attempt,
// advanced palette gating.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('viewer@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  const views = ['dashboard', 'sales', 'inventory', 'orders', 'payments', 'purchaseOrders'];
  for (const v of views) {
    await page.goto(`http://localhost:5173/${v}`);
    await page.waitForTimeout(3000);
    const census = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
      const writeish = btns.filter(b => /post|confirm|create|new |add |receive|approve|pay|allocate|adjust|mark |save|delete|cancel order|duplicate|process/i.test(b.textContent || ''));
      return {
        totalVisibleButtons: btns.length,
        writeishEnabled: writeish.filter(b => !b.disabled).map(b => (b.textContent || '').trim().slice(0, 40)),
        writeishDisabled: writeish.filter(b => b.disabled).map(b => ({ t: (b.textContent || '').trim().slice(0, 40), title: b.title })),
        editableCells: document.querySelectorAll('.editable-cell').length,
      };
    });
    obs(`[viewer ${v}]`, JSON.stringify(census));
    await shot(`09-viewer-${v}`);
    // select a row and check StatusActionBar
    const row = page.locator('.ag-center-cols-container').first().locator('.ag-row[row-index="1"]');
    if (await row.isVisible().catch(() => false)) {
      await row.click({ position: { x: 150, y: 10 } }).catch(() => {});
      await page.waitForTimeout(600);
      const primary = await page.locator('[data-status-action-primary]').first().isVisible().catch(() => false);
      const pills = await page.locator('.selection-summary .selection-pill').allInnerTexts().catch(() => []);
      obs(`[viewer ${v}] after row select: primary visible=${primary} pills=${JSON.stringify(pills)}`);
      await page.keyboard.press('Meta+Enter');
      await page.waitForTimeout(800);
      obs(`[viewer ${v}] ⌘↵:`); await toasts();
    }
  }

  // palette mutation attempt
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(700); await heal(); await page.waitForTimeout(300);
  const paletteOpen = await page.locator('[role="dialog"][aria-label="Command palette"]').isVisible().catch(() => false);
  obs('viewer palette opens:', paletteOpen);
  if (paletteOpen) {
    await page.getByLabel('Command palette search').fill('Process intake');
    await page.waitForTimeout(900);
    const txt = await page.locator('[role="dialog"][aria-label="Command palette"]').innerText();
    obs('viewer palette "Process intake" results:', txt.replace(/\n+/g, ' | ').slice(0, 400));
    const cmd = page.locator('button', { hasText: 'postPurchaseReceipt' }).first();
    if (await cmd.isVisible().catch(() => false)) {
      await cmd.click();
      await page.waitForTimeout(2000);
      await heal();
      obs('viewer ran postPurchaseReceipt →'); await toasts();
      await shot('09-viewer-palette-mutation');
      note({ type: 'finding', text: 'viewer: raw commands still listed and clickable in palette (check refusal path)' });
    } else obs('viewer: postPurchaseReceipt not listed (hidden by role)');
    // quick-start launches visible?
    await page.getByLabel('Command palette search').fill('');
    await page.waitForTimeout(600);
    const launches = await page.locator('[role="dialog"][aria-label="Command palette"]').innerText();
    obs('viewer empty-query palette:', launches.replace(/\n+/g, ' | ').slice(0, 350));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500); await heal();
  }

  // advanced palette gating
  await page.keyboard.press('Meta+Alt+k');
  await page.waitForTimeout(700); await heal(); await page.waitForTimeout(300);
  const advPanel = await page.locator('#payload-json').isVisible().catch(() => false);
  const bracesBtn = await page.locator('button[aria-label="Advanced payload"]').isVisible().catch(() => false);
  obs('viewer ⌘⌥K: advanced panel=', advPanel, 'braces toggle=', bracesBtn);
  await shot('09-viewer-advanced-gate');
  if (advPanel || bracesBtn) note({ type: 'finding', text: 'viewer: advanced palette surface not fully gated' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400); await heal();

  // viewer hotkey mutation attempt: intake ⌘D
  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(3000);
  const irow = page.locator('.ag-center-cols-container').first().locator('.ag-row[row-index="0"]');
  if (await irow.isVisible().catch(() => false)) {
    await irow.click({ position: { x: 150, y: 10 } }).catch(() => {});
    await page.waitForTimeout(500);
    await page.keyboard.press('Meta+d');
    await page.waitForTimeout(1500);
    obs('viewer intake ⌘D →'); await toasts();
    await shot('09-viewer-intake-cmdd');
  } else obs('viewer: no intake rows visible');

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
