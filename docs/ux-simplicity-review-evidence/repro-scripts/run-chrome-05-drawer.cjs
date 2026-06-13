// Chrome lane 05 — ContextDrawer deep-dive: customer, vendor, order, PO, lot, bill/payment.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);
  const drawer = () => page.locator('aside[aria-label="Context drawer"]');

  async function selectRow(i) {
    const row = page.locator(`.ag-center-cols-container .ag-row[row-index="${i}"]`).first();
    await row.click({ position: { x: 200, y: 10 } }).catch(e => obs('row click fail', String(e).slice(0, 80)));
    await page.waitForTimeout(600);
  }
  async function drawerTabs() {
    return page.locator('aside[aria-label="Context drawer"] [role="tablist"] [role="tab"]').allInnerTexts().catch(() => []);
  }
  async function dumpTab(name) {
    const tab = page.locator('aside[aria-label="Context drawer"] [role="tab"]', { hasText: name }).first();
    if (!(await tab.isVisible().catch(() => false))) { obs(`tab "${name}" NOT VISIBLE`); return; }
    await tab.click();
    await page.waitForTimeout(900);
    const body = await drawer().innerText().catch(() => '');
    obs(`tab "${name}" content:`, body.replace(/\n+/g, ' | ').slice(0, 450));
  }

  const targets = [
    { view: 'clients', label: 'customer' },
    { view: 'vendors', label: 'vendor' },
    { view: 'orders', label: 'order' },
    { view: 'purchaseOrders', label: 'PO' },
    { view: 'inventory', label: 'lot/batch' },
    { view: 'payments', label: 'payment/bill' },
  ];

  for (const t of targets) {
    obs(`──── drawer on /${t.view} (${t.label}) ────`);
    await page.goto(`http://localhost:5173/${t.view}`);
    await page.waitForTimeout(3000);
    await selectRow(3);
    // drawer may auto-open on selection; if not, press ]
    if (!(await drawer().isVisible().catch(() => false))) {
      await page.keyboard.press(']');
      await page.waitForTimeout(600);
    }
    if (!(await drawer().isVisible().catch(() => false))) {
      note({ type: 'finding', text: `${t.view}: context drawer would not open after row select + ]` });
      continue;
    }
    const tabs = await drawerTabs();
    obs(`${t.view} drawer tabs:`, JSON.stringify(tabs));
    await shot(`05-${t.view}-drawer`);
    for (const tabName of tabs) await dumpTab(tabName);
    await shot(`05-${t.view}-last-tab`);
    // tab number keys: press 1..tabs.length, check aria-selected moves
    for (let n = 1; n <= Math.min(tabs.length, 5); n++) {
      await page.keyboard.press(String(n));
      await page.waitForTimeout(400);
      const sel = await page.locator('aside[aria-label="Context drawer"] [role="tab"][aria-selected="true"]').innerText().catch(() => 'n/a');
      obs(`digit ${n} → active tab: ${sel.replace(/\n/g, ' ')}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ── full state/persistence dive on customer (clients) ──
  obs('──── clients drawer state cycle + persistence ────');
  await page.goto('http://localhost:5173/clients');
  await page.waitForTimeout(3000);
  await selectRow(2);
  if (!(await drawer().isVisible().catch(() => false))) { await page.keyboard.press(']'); await page.waitForTimeout(500); }
  // coachmark?
  const coach = await page.locator('[data-testid="drawer-coachmark"]').isVisible().catch(() => false);
  obs('coachmark visible:', coach);
  if (coach) {
    obs('coachmark text:', await page.locator('[data-testid="drawer-coachmark"]').innerText().catch(() => ''));
    await shot('05-coachmark');
    await page.getByLabel('Dismiss drawer tip').click().catch(() => {});
    await page.waitForTimeout(300);
    obs('coachmark after dismiss:', await page.locator('[data-testid="drawer-coachmark"]').isVisible().catch(() => false));
  }
  // cycle via button
  const cycleBtn = page.locator('[data-testid="drawer-cycle-btn"]');
  for (let i = 0; i < 4; i++) {
    obs('cycle-btn state:', await cycleBtn.getAttribute('aria-label').catch(() => null), 'drawer width:', await drawer().evaluate(el => el.getBoundingClientRect().width).catch(() => -1));
    await cycleBtn.click().catch(() => {});
    await page.waitForTimeout(450);
  }
  await shot('05-clients-cycled');
  // focus state: focus trap check — Tab 15 times, does focus stay inside drawer?
  // first set state to focus via ⇧] until aria-label says Focus
  for (let i = 0; i < 4; i++) {
    const label = (await cycleBtn.getAttribute('aria-label').catch(() => '')) || '';
    if (/Focus/i.test(label)) break;
    await page.keyboard.press('Shift+]');
    await page.waitForTimeout(400);
  }
  obs('state now:', await cycleBtn.getAttribute('aria-label').catch(() => null));
  await shot('05-clients-focus-state');
  await drawer().click({ position: { x: 20, y: 60 } }).catch(() => {});
  let inside = 0, outside = 0;
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const inDrawer = await page.evaluate(() => !!document.activeElement?.closest('aside[aria-label="Context drawer"]'));
    inDrawer ? inside++ : outside++;
  }
  obs(`focus trap (focus state): ${inside} tabs inside / ${outside} escaped`);
  // pick a non-default tab + wide state, leave, come back → persisted?
  await page.keyboard.press('Shift+]'); // cycle away from focus
  await page.waitForTimeout(400);
  const tabBalance = page.locator('aside[aria-label="Context drawer"] [role="tab"]', { hasText: /Balance/i }).first();
  if (await tabBalance.isVisible().catch(() => false)) { await tabBalance.click(); await page.waitForTimeout(500); }
  const stateBefore = await cycleBtn.getAttribute('aria-label').catch(() => null);
  const tabBefore = await page.locator('aside[aria-label="Context drawer"] [role="tab"][aria-selected="true"]').innerText().catch(() => 'n/a');
  obs('before leaving clients: state=', stateBefore, 'tab=', tabBefore.replace(/\n/g, ' '));
  // navigate away via sidenav click and back
  await page.locator('[data-testid="sidenav-item-inventory"]').click();
  await page.waitForTimeout(1500);
  const drawerOnInventory = await drawer().isVisible().catch(() => false);
  obs('drawer visible on inventory after switch:', drawerOnInventory);
  await page.locator('[data-testid="sidenav-item-clients"]').click();
  await page.waitForTimeout(1500);
  const stateAfter = await cycleBtn.getAttribute('aria-label').catch(() => null);
  const tabAfter = await page.locator('aside[aria-label="Context drawer"] [role="tab"][aria-selected="true"]').innerText().catch(() => 'n/a');
  obs('back on clients: drawerVisible=', await drawer().isVisible().catch(() => false), 'state=', stateAfter, 'tab=', tabAfter.replace(/\n/g, ' '));
  await shot('05-clients-persistence');

  // Esc closes drawer
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  obs('Esc closed drawer:', !(await drawer().isVisible().catch(() => false)));
  // reopen pill?
  const reopen = await page.locator('aside[aria-label="Context drawer reopen"]').isVisible().catch(() => false);
  obs('reopen affordance visible:', reopen);

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
