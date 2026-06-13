// Chrome lane 03b — redo '?' overlay (proper key), toast-verified ⌥M/⌘⌥H/⌘⌥V,
// nav hotkey store-vs-route split proof, focus mode feedback, Esc ordering.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(2500);

  // ── '?' overlay via real '?' key ──
  await page.keyboard.press('?');
  await page.waitForTimeout(700);
  const overlay = page.locator('[role="dialog"][aria-labelledby="shortcuts-overlay-title"]');
  const vis = await overlay.isVisible().catch(() => false);
  obs("'?' overlay visible:", vis);
  if (vis) {
    obs('OVERLAY:', (await overlay.innerText()).replace(/\n/g, ' | '));
    await shot('03b-01-shortcuts-overlay');
  } else note({ type: 'finding', text: "'?' key did not open shortcuts overlay (real ? keypress)" });

  // Esc ordering: with overlay open, also open drawer beneath? Overlay is open; press ']' — overlay traps focus though.
  // First: Esc closes overlay only.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  obs('Esc closed overlay:', !(await overlay.isVisible().catch(() => false)));

  // open drawer, then overlay, then Esc twice: overlay first, drawer second
  await page.keyboard.press(']');
  await page.waitForTimeout(600);
  const drawer = page.locator('aside[aria-label="Context drawer"]');
  obs('drawer open:', await drawer.isVisible().catch(() => false));
  await page.keyboard.press('?');
  await page.waitForTimeout(500);
  obs('overlay over drawer:', await overlay.isVisible().catch(() => false));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  obs('after Esc#1: overlay=', await overlay.isVisible().catch(() => false), 'drawer=', await drawer.isVisible().catch(() => false));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  obs('after Esc#2: drawer=', await drawer.isVisible().catch(() => false));

  // ── nav hotkey split proof: Meta+2 from /inventory ──
  await page.keyboard.press('Meta+2');
  await page.waitForTimeout(900);
  const intakeCurrent = await page.locator('[data-testid="sidenav-item-intake"]').getAttribute('aria-current').catch(() => null);
  const invCurrent = await page.locator('[data-testid="sidenav-item-inventory"]').getAttribute('aria-current').catch(() => null);
  const heading = await page.locator('main h1, main h2, [class*="panel-title"]').first().innerText().catch(() => 'n/a');
  obs(`after Meta+2: path=${new URL(page.url()).pathname} sidenav intake aria-current=${intakeCurrent} inventory aria-current=${invCurrent} firstHeading="${heading}"`);
  await shot('03b-02-meta2-split-state');

  // ── ⌥M on /sales with real toast probe ──
  await page.goto('http://localhost:5173/sales');
  await page.waitForTimeout(2500);
  await page.keyboard.press('Alt+m');
  await page.waitForTimeout(600);
  obs('⌥M toasts:'); await toasts();
  await shot('03b-03-altm-sales');
  await page.keyboard.press('Alt+m');
  await page.waitForTimeout(600);
  obs('⌥M again toasts:'); await toasts();

  // ── ⌘⌥H health check ──
  await page.keyboard.press('Meta+Alt+h');
  await page.waitForTimeout(1800);
  obs('⌘⌥H toasts:'); await toasts();
  await shot('03b-04-health');

  // ── ⌘⌥V validate all on /sales ──
  await page.keyboard.press('Meta+Alt+v');
  await page.waitForTimeout(2500);
  obs('⌘⌥V toasts:'); await toasts();
  await shot('03b-05-validate');

  // ── F focus mode on /sales ──
  const ann = async () => page.evaluate(() => document.querySelector('div[aria-live="polite"].sr-only')?.textContent ?? '');
  await page.keyboard.press('f');
  await page.waitForTimeout(600);
  obs('after F: announcement=', JSON.stringify(await ann()));
  await shot('03b-06-focusmode-sales');
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  obs('after F again: announcement=', JSON.stringify(await ann()));

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
