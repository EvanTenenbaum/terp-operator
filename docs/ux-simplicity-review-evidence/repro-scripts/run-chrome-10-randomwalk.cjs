// Chrome lane 10 — random-walk: rapid view switching w/ drawer open, palette during
// text edit (guard), hotkeys while dialog open, browser Back through drilldowns.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);
  const drawer = () => page.locator('aside[aria-label="Context drawer"]');

  // ── 1. rapid view switching while drawer open ──
  await page.goto('http://localhost:5173/orders');
  await page.waitForTimeout(3000);
  await page.locator('.ag-center-cols-container').first().locator('.ag-row[row-index="2"]').click({ position: { x: 200, y: 10 } });
  await page.waitForTimeout(600);
  if (!(await drawer().isVisible().catch(() => false))) { await page.keyboard.press(']'); await page.waitForTimeout(400); }
  obs('drawer open on orders:', await drawer().isVisible().catch(() => false), 'url:', page.url());
  for (let lap = 0; lap < 2; lap++) {
    for (const v of ['payments', 'inventory', 'orders']) {
      await page.locator(`[data-testid="sidenav-item-${v}"]`).click();
      await page.waitForTimeout(250); // rapid
    }
  }
  await page.waitForTimeout(1500);
  obs('after rapid switching: path=', new URL(page.url()).pathname, 'drawer=', await drawer().isVisible().catch(() => false));
  await shot('10-01-rapid-switch');
  await toasts();

  // ── 2. ⌘K while typing in a text input (guard) ──
  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(3000);
  const qf = page.locator('input[aria-label="Filter Inventory Batches grid"]');
  await qf.click();
  await page.keyboard.type('NF');
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(700);
  const paletteWhileTyping = await page.locator('[role="dialog"][aria-label="Command palette"]').isVisible().catch(() => false);
  const crashed = await page.locator('text=Something went wrong').isVisible().catch(() => false);
  obs('⌘K while focused in quick filter: palette=', paletteWhileTyping, 'crashed=', crashed, '(expected: stays closed)');
  if (paletteWhileTyping || crashed) note({ type: 'finding', text: '⌘K not guarded while typing in grid quick filter' });
  await heal();
  await qf.fill('');
  // also '/' and '?' inside input should type, not trigger
  await qf.click();
  await page.keyboard.type('a?b/');
  await page.waitForTimeout(500);
  const overlayLeak = await page.locator('[role="dialog"][aria-labelledby="shortcuts-overlay-title"]').isVisible().catch(() => false);
  obs("typed 'a?b/' in input: value=", await qf.inputValue(), 'overlay leaked=', overlayLeak);
  await qf.fill('');
  await page.keyboard.press('Escape');

  // ── 3. hotkeys while a modal dialog is open ──
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(3000);
  // find an approved PO to open Receive dialog
  const poGrid = page.locator('.ag-center-cols-container').first();
  let apIdx = -1;
  for (let i = 0; i < 15; i++) {
    const t = await poGrid.locator(`.ag-row[row-index="${i}"]`).innerText().catch(() => '');
    if (/APPROVED/i.test(t)) { apIdx = i; break; }
  }
  obs('approved PO row:', apIdx);
  if (apIdx >= 0) {
    await poGrid.locator(`.ag-row[row-index="${apIdx}"]`).click({ position: { x: 200, y: 10 } });
    await page.waitForTimeout(600);
    await page.keyboard.press('Meta+Enter'); // opens Receive PO dialog
    await page.waitForTimeout(1500);
    const dlg = page.locator('[role="dialog"]').first();
    const dlgOpen = await dlg.isVisible().catch(() => false);
    obs('dialog open:', dlgOpen, dlgOpen ? (await dlg.innerText()).split('\n')[0] : '');
    if (dlgOpen) {
      await shot('10-02-dialog-open');
      // ⌘D should be inert (dialog guard)
      await page.keyboard.press('Meta+d');
      await page.waitForTimeout(600);
      obs('⌘D with dialog open →'); await toasts();
      // ']' drawer toggle — guarded?
      const drawerBefore = await drawer().isVisible().catch(() => false);
      await page.keyboard.press(']');
      await page.waitForTimeout(500);
      const drawerAfter = await drawer().isVisible().catch(() => false);
      obs(`']' with dialog open: drawer ${drawerBefore} → ${drawerAfter} ${drawerBefore !== drawerAfter ? '(NOT inert!)' : '(inert)'}`);
      if (drawerBefore !== drawerAfter) note({ type: 'finding', text: "']' drawer toggle fires behind an open modal dialog (not inert)" });
      // '?' overlay — also background hotkey
      await page.keyboard.press('?');
      await page.waitForTimeout(500);
      const ovl = await page.locator('[role="dialog"][aria-labelledby="shortcuts-overlay-title"]').isVisible().catch(() => false);
      obs("'?' with dialog open: overlay=", ovl);
      if (ovl) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
      // nav hotkey ⌘3 — "intentionally allowed"; what actually happens?
      await page.keyboard.press('Meta+3');
      await page.waitForTimeout(800);
      obs('⌘3 with dialog open: path=', new URL(page.url()).pathname, 'dialog still open=', await dlg.isVisible().catch(() => false));
      await shot('10-03-hotkeys-during-dialog');
      // close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      obs('after Esc: dialog=', await page.locator('[role="dialog"]').first().isVisible().catch(() => false));
    }
  }

  // ── 4. browser Back through drilldowns ──
  await page.goto('http://localhost:5173/orders');
  await page.waitForTimeout(2500);
  await page.locator('.ag-center-cols-container').first().locator('.ag-row[row-index="2"]').click({ position: { x: 200, y: 10 } });
  await page.waitForTimeout(800);
  const urlWithDrawer = page.url();
  obs('after drilldown url:', urlWithDrawer);
  await page.locator('[data-testid="sidenav-item-inventory"]').click();
  await page.waitForTimeout(1500);
  obs('now on:', page.url());
  await page.goBack();
  await page.waitForTimeout(1500);
  obs('after Back: url=', page.url(), 'drawer=', await drawer().isVisible().catch(() => false),
    'ribbon=', (await page.locator('section[aria-label="Active context"]').innerText().catch(() => 'NONE')).replace(/\n+/g, ' | ').slice(0, 120));
  await shot('10-04-browser-back');
  await page.goBack();
  await page.waitForTimeout(1500);
  obs('after Back x2: url=', page.url());
  await page.goForward();
  await page.waitForTimeout(1200);
  obs('after Forward: url=', page.url());
  await toasts();

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
