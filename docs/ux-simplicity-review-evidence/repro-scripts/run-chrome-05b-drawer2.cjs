// Chrome lane 05b — drawer tab CONTENT dumps (Timeline quality) + state persistence,
// coachmark, focus trap, Esc, reopen affordance.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);
  const drawer = () => page.locator('aside[aria-label="Context drawer"]');

  async function selectRow(i) {
    const row = page.locator('.ag-center-cols-container').first().locator(`.ag-row[row-index="${i}"]`).first();
    await row.click({ position: { x: 200, y: 10 }, timeout: 8000 }).catch(e => obs('row click fail', String(e).slice(0, 80)));
    await page.waitForTimeout(700);
  }
  async function dumpAllTabs(view) {
    const tabs = drawer().locator('[role="tablist"] [role="tab"]');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const name = (await tabs.nth(i).innerText()).replace(/\n/g, ' ');
      await tabs.nth(i).click();
      await page.waitForTimeout(1100);
      const body = await drawer().locator('.drawer-body, [role="tabpanel"]').first().innerText().catch(async () => (await drawer().innerText()));
      obs(`[${view}] tab ${name}:`, body.replace(/\n+/g, ' | ').slice(0, 380));
    }
  }

  // content dive: customer, order, lot — focus on Timeline quality
  for (const view of ['clients', 'orders', 'inventory']) {
    obs(`──── ${view} tab contents ────`);
    await page.goto(`http://localhost:5173/${view}`);
    await page.waitForTimeout(3000);
    await selectRow(3);
    if (!(await drawer().isVisible().catch(() => false))) { await page.keyboard.press(']'); await page.waitForTimeout(600); }
    await dumpAllTabs(view);
    await shot(`05b-${view}-tabs-done`);
  }

  // vendors + payments tab contents (bill/vendor lens)
  for (const view of ['vendors', 'payments']) {
    obs(`──── ${view} tab contents ────`);
    await page.goto(`http://localhost:5173/${view}`);
    await page.waitForTimeout(3000);
    await selectRow(2);
    if (!(await drawer().isVisible().catch(() => false))) { await page.keyboard.press(']'); await page.waitForTimeout(600); }
    await dumpAllTabs(view);
    await shot(`05b-${view}-tabs-done`);
  }

  // ── persistence / coachmark / focus trap on clients ──
  obs('──── clients persistence & chrome ────');
  await page.goto('http://localhost:5173/clients');
  await page.waitForTimeout(3000);
  await selectRow(2);
  if (!(await drawer().isVisible().catch(() => false))) { await page.keyboard.press(']'); await page.waitForTimeout(600); }
  const coach = page.locator('[data-testid="drawer-coachmark"]');
  obs('coachmark visible:', await coach.isVisible().catch(() => false));
  if (await coach.isVisible().catch(() => false)) {
    obs('coachmark text:', (await coach.innerText()).replace(/\n/g, ' '));
    await shot('05b-coachmark');
    await page.getByLabel('Dismiss drawer tip').click().catch(() => {});
    await page.waitForTimeout(400);
    obs('coachmark after dismiss:', await coach.isVisible().catch(() => false));
  }
  const cycleBtn = page.locator('[data-testid="drawer-cycle-btn"]');
  for (let i = 0; i < 4; i++) {
    obs('cycle state:', await cycleBtn.getAttribute('aria-label').catch(() => null), '| width:', Math.round(await drawer().evaluate(el => el.getBoundingClientRect().width).catch(() => -1)));
    await cycleBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  // to focus state via keys
  for (let i = 0; i < 4; i++) {
    const label = (await cycleBtn.getAttribute('aria-label').catch(() => '')) || '';
    if (/Focus/i.test(label)) break;
    await page.keyboard.press('Shift+]');
    await page.waitForTimeout(450);
  }
  obs('state now:', await cycleBtn.getAttribute('aria-label').catch(() => null), '| width:', Math.round(await drawer().evaluate(el => el.getBoundingClientRect().width).catch(() => -1)));
  await shot('05b-focus-state');
  // focus trap test in focus state
  await drawer().locator('[role="tab"]').first().click().catch(() => {});
  let inside = 0, outside = 0;
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    (await page.evaluate(() => !!document.activeElement?.closest('aside[aria-label="Context drawer"]'))) ? inside++ : outside++;
  }
  obs(`focus-state Tab trap: ${inside} inside / ${outside} escaped`);
  // pick a distinctive tab, set wide, leave, return
  await page.keyboard.press('Shift+]'); // focus → standard (cycle)
  await page.waitForTimeout(400);
  await page.keyboard.press('Shift+]'); // standard → wide
  await page.waitForTimeout(400);
  const tabs = drawer().locator('[role="tablist"] [role="tab"]');
  await tabs.nth(3).click().catch(() => {});
  await page.waitForTimeout(500);
  const stateBefore = await cycleBtn.getAttribute('aria-label').catch(() => null);
  const tabBefore = await drawer().locator('[role="tab"][aria-selected="true"]').innerText().catch(() => 'n/a');
  obs('before leave: state=', stateBefore, 'tab=', tabBefore.replace(/\n/g, ' '));
  await page.locator('[data-testid="sidenav-item-inventory"]').click();
  await page.waitForTimeout(2000);
  obs('on inventory: drawer visible=', await drawer().isVisible().catch(() => false));
  await page.locator('[data-testid="sidenav-item-clients"]').click();
  await page.waitForTimeout(2000);
  obs('back on clients: drawer=', await drawer().isVisible().catch(() => false),
    'state=', await cycleBtn.getAttribute('aria-label').catch(() => null),
    'tab=', (await drawer().locator('[role="tab"][aria-selected="true"]').innerText().catch(() => 'n/a')).replace(/\n/g, ' '));
  await shot('05b-persistence');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  obs('Esc closed drawer:', !(await drawer().isVisible().catch(() => false)));
  obs('reopen affordance:', await page.locator('aside[aria-label="Context drawer reopen"]').isVisible().catch(() => false));
  await shot('05b-after-esc');

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
