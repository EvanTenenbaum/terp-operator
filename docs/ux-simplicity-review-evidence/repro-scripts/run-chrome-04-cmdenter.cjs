// Chrome lane 04 — ⌘Enter decision-table commit on /orders, /payments, /purchaseOrders, /fulfillment.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  async function rowInfo(i) {
    const row = page.locator(`.ag-center-cols-container .ag-row[row-index="${i}"]`);
    const text = await row.innerText().catch(() => '');
    return text.replace(/\n+/g, ' | ').slice(0, 160);
  }
  async function clickRow(i, modifiers = []) {
    const row = page.locator(`.ag-center-cols-container .ag-row[row-index="${i}"]`).first();
    await row.click({ modifiers, position: { x: 200, y: 10 } }).catch(e => obs('row click failed', i, String(e).slice(0, 100)));
    await page.waitForTimeout(500);
  }
  async function barState() {
    const primary = page.locator('[data-status-action-primary]').first();
    const pVis = await primary.isVisible().catch(() => false);
    const pLabel = pVis ? (await primary.innerText().catch(() => '')) : null;
    const pDisabled = pVis ? await primary.isDisabled().catch(() => false) : null;
    const pTitle = pVis ? await primary.getAttribute('title').catch(() => null) : null;
    const reason = await page.locator('[data-status-action-reason]').first().innerText().catch(() => null);
    const pill = await page.locator('.selection-pill').allInnerTexts().catch(() => []);
    return { pLabel, pDisabled, pTitle, reason, pills: pill };
  }

  for (const view of ['orders', 'payments', 'purchaseOrders', 'fulfillment']) {
    obs(`──── ${view} ────`);
    await page.goto(`http://localhost:5173/${view}`);
    await page.waitForTimeout(3000);
    const rowCount = await page.locator('.ag-center-cols-container .ag-row').count();
    obs(view, 'visible rows:', rowCount);
    if (!rowCount) { note({ type: 'finding', text: `${view}: no grid rows rendered` }); continue; }

    // ⌘Enter with NO selection
    await page.keyboard.press('Meta+Enter');
    await page.waitForTimeout(600);
    obs(view, 'no-selection ⌘↵ toasts:'); await toasts();

    // single row selection (use a deeper row to avoid other agents)
    const idx = Math.min(5, rowCount - 1);
    obs(view, `selecting row ${idx}:`, await rowInfo(idx));
    await clickRow(idx);
    obs(view, 'bar after single select:', JSON.stringify(await barState()));
    await shot(`04-${view}-single-select`);
    await page.keyboard.press('Meta+Enter');
    await page.waitForTimeout(2500);
    obs(view, 'after ⌘↵ toasts:'); await toasts();
    await shot(`04-${view}-after-commit`);
    // dismiss any dialog the primary may have opened
    if (await page.locator('[role="dialog"]').first().isVisible().catch(() => false)) {
      obs(view, 'primary opened a dialog — closing');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    await heal();

    // mixed-status selection: row idx + several others via Meta+click
    await clickRow(idx);
    for (const j of [idx + 1, idx + 2, idx + 3]) {
      if (j < rowCount) await clickRow(j, ['Meta']);
    }
    const mixed = await barState();
    obs(view, 'bar after multi select:', JSON.stringify(mixed));
    await shot(`04-${view}-multi-select`);
    await page.keyboard.press('Meta+Enter');
    await page.waitForTimeout(1500);
    obs(view, 'after mixed ⌘↵ toasts:'); await toasts();
    // open the More tray if present to inspect catch-all
    const more = page.locator('button', { hasText: /^More/ }).first();
    if (await more.isVisible().catch(() => false)) {
      await more.click(); await page.waitForTimeout(400);
      const menu = await page.locator('[role="menu"]').last().innerText().catch(() => '');
      obs(view, 'More tray:', menu.replace(/\n+/g, ' | ').slice(0, 250));
      await shot(`04-${view}-tray`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    } else obs(view, 'no More tray visible for this selection');
    await heal();
  }

  await finish();
})().catch(e => { console.error(e); process.exit(1); });
