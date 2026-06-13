// Chrome lane 04b — redo: orders mixed-selection catch-all tray (scoped), fulfillment pick grid ⌘↵.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  async function barState() {
    const primary = page.locator('[data-status-action-primary]').first();
    const pVis = await primary.isVisible().catch(() => false);
    return {
      primary: pVis ? await primary.innerText() : null,
      reason: await page.locator('[data-status-action-reason]').first().innerText({ timeout: 1500 }).catch(() => null),
      pills: await page.locator('.selection-summary .selection-pill').allInnerTexts().catch(() => []),
    };
  }

  // ── orders mixed-selection catch-all tray ──
  await page.goto('http://localhost:5173/orders');
  await page.waitForTimeout(3000);
  const grid0 = page.locator('.ag-center-cols-container').first();
  await grid0.locator('.ag-row[row-index="5"]').click({ position: { x: 200, y: 10 } });
  await page.waitForTimeout(400);
  for (const j of [6, 7, 8]) {
    await grid0.locator(`.ag-row[row-index="${j}"]`).click({ modifiers: ['Meta'], position: { x: 200, y: 10 } });
    await page.waitForTimeout(300);
  }
  obs('orders mixed bar:', JSON.stringify(await barState()));
  const tray = page.locator('.selection-summary button[aria-haspopup="menu"]', { hasText: 'More' }).first();
  if (await tray.isVisible().catch(() => false)) {
    await tray.click(); await page.waitForTimeout(400);
    const menu = await page.locator('.selection-summary [role="menu"]').innerText().catch(() => 'NO MENU');
    obs('orders mixed catch-all tray items:', menu.replace(/\n+/g, ' | '));
    await shot('04b-orders-mixed-tray');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  } else {
    obs('orders mixed: NO tray button in selection summary');
    await shot('04b-orders-mixed-notray');
    note({ type: 'finding', text: 'orders mixed-status selection: catch-all More tray not visible in selection strip' });
  }

  // ── fulfillment: pick grid (first grid) ──
  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(3000);
  const pickGrid = page.locator('.ag-center-cols-container').first();
  const pickRows = await pickGrid.locator('.ag-row').count();
  obs('fulfillment pick rows:', pickRows);
  await pickGrid.locator('.ag-row[row-index="3"]').click({ position: { x: 150, y: 10 } });
  await page.waitForTimeout(1200);
  obs('fulfillment bar after pick select:', JSON.stringify(await barState()));
  await shot('04b-fulfillment-pick-selected');
  await page.keyboard.press('Meta+Enter');
  await page.waitForTimeout(2000);
  obs('fulfillment after ⌘↵:'); await toasts();
  await shot('04b-fulfillment-after-commit');
  if (await page.locator('[role="dialog"]').first().isVisible().catch(() => false)) {
    obs('fulfillment primary opened a dialog');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  }
  // mixed picks
  await pickGrid.locator('.ag-row[row-index="0"]').click({ position: { x: 150, y: 10 } });
  await page.waitForTimeout(300);
  for (const j of [1, 2, 3]) { await pickGrid.locator(`.ag-row[row-index="${j}"]`).click({ modifiers: ['Meta'], position: { x: 150, y: 10 } }); await page.waitForTimeout(250); }
  obs('fulfillment mixed bar:', JSON.stringify(await barState()));
  await page.keyboard.press('Meta+Enter');
  await page.waitForTimeout(1200);
  obs('fulfillment mixed ⌘↵:'); await toasts();
  await shot('04b-fulfillment-mixed');

  // ── payments: hunt a row with a primary (draft/unapplied) ──
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);
  const payGrid = page.locator('.ag-center-cols-container').first();
  const n = Math.min(await payGrid.locator('.ag-row').count(), 15);
  let found = false;
  for (let i = 0; i < n; i++) {
    await payGrid.locator(`.ag-row[row-index="${i}"]`).click({ position: { x: 150, y: 10 } }).catch(() => {});
    await page.waitForTimeout(350);
    const st = await barState();
    if (st.primary) { obs(`payments row ${i} has primary:`, JSON.stringify(st)); found = true;
      await shot('04b-payments-primary');
      await page.keyboard.press('Meta+Enter');
      await page.waitForTimeout(2000);
      obs('payments after ⌘↵:'); await toasts();
      await shot('04b-payments-after-commit');
      if (await page.locator('[role="dialog"]').first().isVisible().catch(() => false)) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      break; }
  }
  if (!found) obs('payments: no row 0-14 produced a StatusActionBar primary (all terminal?)');

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
