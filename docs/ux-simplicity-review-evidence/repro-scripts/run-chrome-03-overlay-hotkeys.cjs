// Chrome lane 03 — '?' shortcuts overlay + spot-check listed bindings + ⌘⌥K advanced palette (owner).
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);
  const path = () => new URL(page.url()).pathname;
  const lastToast = async () => {
    const t = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[class*="toast"] ')).length
        ? Array.from(document.querySelectorAll('[class*="toast"]'))
        : Array.from(document.querySelectorAll('[role="status"], [aria-live]'));
      return els.map(e => e.textContent?.trim()).filter(Boolean);
    });
    return t;
  };

  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(2500);

  // ── 1. '?' overlay ──
  await page.keyboard.press('Shift+/');
  await page.waitForTimeout(700);
  const overlay = page.locator('[role="dialog"]').filter({ hasText: /shortcut/i }).first();
  const overlayVisible = await overlay.isVisible().catch(() => false);
  obs('? overlay visible:', overlayVisible);
  if (overlayVisible) {
    const txt = await overlay.innerText();
    obs('OVERLAY CONTENT:', txt.replace(/\n+/g, ' | '));
  } else {
    note({ type: 'finding', text: "'?' did not open the shortcuts overlay on /inventory" });
  }
  await shot('03-01-shortcuts-overlay');
  // Esc closes overlay only
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  obs('overlay closed by Esc:', !(await overlay.isVisible().catch(() => false)));

  // ── 2. ⌘1–⌘6 nav ──
  const navChecks = [['Meta+2', '/intake'], ['Meta+3', '/sales'], ['Meta+4', '/payments'], ['Meta+5', '/inventory'], ['Meta+6', '/clients'], ['Meta+1', '/dashboard']];
  for (const [combo, expected] of navChecks) {
    await page.keyboard.press(combo);
    await page.waitForTimeout(900);
    const p = path();
    obs(`${combo} → path=${p} expected=${expected} ${p === expected ? 'OK' : 'MISMATCH'}`);
    if (p !== expected) note({ type: 'finding', text: `${combo} nav landed on ${p}, expected ${expected}` });
  }
  await shot('03-02-after-nav-hotkeys');

  // ── 3. ⌥M margin toggle on /sales ──
  await page.keyboard.press('Meta+3');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Alt+m');
  await page.waitForTimeout(700);
  obs('after ⌥M toasts:', JSON.stringify(await lastToast()));
  await shot('03-03-alt-m-margin');
  await page.keyboard.press('Alt+m'); // toggle back
  await page.waitForTimeout(500);

  // ── 4. ⌘⌥H health check ──
  await page.keyboard.press('Meta+Alt+h');
  await page.waitForTimeout(1500);
  obs('after ⌘⌥H toasts:', JSON.stringify(await lastToast()));
  await shot('03-04-health-check');

  // ── 5. ⌘⌥V validate all (on /inventory) ──
  await page.keyboard.press('Meta+5');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Meta+Alt+v');
  await page.waitForTimeout(2000);
  obs('after ⌘⌥V toasts:', JSON.stringify(await lastToast()));
  await shot('03-05-validate-all');

  // ── 6. '/' focuses grid quick filter ──
  await page.keyboard.press('/');
  await page.waitForTimeout(400);
  const focusedIsFilter = await page.evaluate(() => document.activeElement?.hasAttribute('data-grid-quick-filter') ?? false);
  obs("'/' focused grid quick filter:", focusedIsFilter);
  if (!focusedIsFilter) note({ type: 'finding', text: "'/' did not focus the inventory grid quick filter" });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ── 7. F focus mode toggle ──
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  const beforeF = await page.evaluate(() => document.body.innerHTML.length);
  await page.keyboard.press('f');
  await page.waitForTimeout(700);
  const sideNavGone = !(await page.locator('[data-testid="sidenav-item-dashboard"]').isVisible().catch(() => false));
  const afterF = await page.evaluate(() => document.body.innerHTML.length);
  obs('after F: sideNavHidden=', sideNavGone, 'domDelta=', afterF - beforeF);
  await shot('03-06-focus-mode');
  await page.keyboard.press('f');
  await page.waitForTimeout(500);

  // ── 8. ⌘D outside intake ──
  await page.keyboard.press('Meta+d');
  await page.waitForTimeout(600);
  obs('after ⌘D on inventory toasts:', JSON.stringify(await lastToast()));
  await shot('03-07-cmd-d-inventory');

  // ── 9. ] drawer toggle + ⇧] cycle ──
  await page.keyboard.press(']');
  await page.waitForTimeout(700);
  const drawerVis = await page.locator('aside[aria-label="Context drawer"]').isVisible().catch(() => false);
  obs('] opened drawer:', drawerVis);
  await shot('03-08-drawer-toggled');
  if (drawerVis) {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+]');
      await page.waitForTimeout(500);
      const label = await page.locator('[data-testid="drawer-cycle-btn"]').getAttribute('aria-label').catch(() => null);
      obs(`⇧] cycle ${i + 1}:`, label);
    }
    await shot('03-09-drawer-cycled');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    obs('Esc closed drawer:', !(await page.locator('aside[aria-label="Context drawer"]').isVisible().catch(() => false)));
  }

  // ── 10. ⌘⌥K advanced palette (owner) ──
  await page.keyboard.press('Meta+Alt+k');
  await page.waitForTimeout(700);
  if (await heal()) obs('(healed on ⌘⌥K open)');
  await page.waitForTimeout(400);
  const adv = page.locator('#payload-json');
  const advVisible = await adv.isVisible().catch(() => false);
  const danger = await page.locator('text=Danger — raw JSON').isVisible().catch(() => false);
  const ctx = await page.locator('text=Current context').isVisible().catch(() => false);
  obs('⌘⌥K advanced panel visible:', advVisible, 'danger label:', danger, 'context pane:', ctx);
  await shot('03-10-advanced-palette-owner');
  if (!advVisible) note({ type: 'finding', text: '⌘⌥K did not show the advanced typed-payload panel for owner' });
  // do NOT execute any payload. Close.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await heal();

  await finish();
})().catch(e => { console.error(e); process.exit(1); });
