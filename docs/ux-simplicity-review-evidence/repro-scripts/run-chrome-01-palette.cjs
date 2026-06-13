// Chrome lane 01 — ⌘K command palette: quick-starts + workbook aliases.
// Uses heal() to step over the F-chrome-01 open/close crash.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  async function openPalette() {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(600);
    const healed = await heal();
    if (healed) obs('(healed crash on palette open)');
    await page.waitForTimeout(300);
    return page.locator('[role="dialog"][aria-label="Command palette"]').isVisible().catch(() => false);
  }
  async function clickAndHeal(locator) {
    await locator.click();
    await page.waitForTimeout(900);
    const healed = await heal();
    if (healed) obs('(healed crash on palette close)');
    await page.waitForTimeout(400);
  }
  async function escAndHeal() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    if (await heal()) obs('(healed crash on Esc close)');
  }
  async function paletteText() {
    return page.locator('[role="dialog"][aria-label="Command palette"]').innerText().catch(() => 'NOT OPEN');
  }
  async function typeQuery(q) {
    const input = page.getByLabel('Command palette search');
    await input.fill(q);
    await page.waitForTimeout(900);
    const text = await paletteText();
    obs(`query "${q}" →`, text.replace(/\n+/g, ' | ').slice(0, 600));
    return text;
  }

  obs('start url', page.url());

  // 1. ⌘K → "Files" → New sale
  obs('palette opened:', await openPalette());
  await shot('01-01-palette-open');
  await typeQuery('Files');
  await shot('01-02-query-files');
  const newSale = page.locator('button.entity-result', { hasText: 'New sale' }).first();
  if (await newSale.isVisible().catch(() => false)) {
    await clickAndHeal(newSale);
    obs('after "Files"→New sale: url=', page.url());
    await shot('01-03-after-files-newsale');
  } else note({ type: 'finding', text: '"Files" alias did not surface New sale quick-start' });

  // 2. "OFC" → Receive against PO
  await openPalette();
  await typeQuery('OFC');
  await shot('01-04-query-ofc');
  const recv = page.locator('button.entity-result', { hasText: 'Receive against PO' }).first();
  if (await recv.isVisible().catch(() => false)) {
    await clickAndHeal(recv);
    obs('after OFC→Receive against PO: url=', page.url());
    await shot('01-05-after-ofc-receive');
  } else note({ type: 'finding', text: '"OFC" alias did not surface Receive against PO quick-start' });

  // 3. "Inv Posted"
  await openPalette();
  const invText = await typeQuery('Inv Posted');
  await shot('01-06-query-invposted');
  obs('Inv Posted → Process intake command listed?', /process intake|postPurchaseReceipt/i.test(invText));
  await escAndHeal();

  // 4. "ticket"
  await openPalette();
  const tText = await typeQuery('ticket');
  await shot('01-07-query-ticket');
  obs('ticket → New sale?', tText.includes('New sale'), '| confirmSalesOrder?', tText.includes('confirmSalesOrder'));
  await escAndHeal();

  // 5. "iv" → Money in
  await openPalette();
  const ivText = await typeQuery('iv');
  await shot('01-08-query-iv');
  obs('iv → Money in?', ivText.includes('Money in'), '| Money out?', ivText.includes('Money out'));
  const moneyIn = page.locator('button.entity-result', { hasText: 'Money in' }).first();
  if (await moneyIn.isVisible().catch(() => false)) {
    await clickAndHeal(moneyIn);
    obs('after iv→Money in: url=', page.url());
    await shot('01-09-after-iv-moneyin');
  } else note({ type: 'finding', text: '"iv" alias did not surface Money in quick-start' });

  // 6. Money out + Add customer need (5+ runs)
  await openPalette();
  await typeQuery('money out');
  const moneyOut = page.locator('button.entity-result', { hasText: 'Money out' }).first();
  if (await moneyOut.isVisible().catch(() => false)) {
    await clickAndHeal(moneyOut);
    obs('after Money out: url=', page.url());
    await shot('01-10-after-moneyout');
  }
  await openPalette();
  await typeQuery('need');
  const need = page.locator('button.entity-result', { hasText: 'Add customer need' }).first();
  if (await need.isVisible().catch(() => false)) {
    await clickAndHeal(need);
    obs('after Add customer need: url=', page.url());
    await shot('01-11-after-customerneed');
  }

  // 7. Keyboard shortcuts tool from palette
  await openPalette();
  await typeQuery('keyboard');
  const kbd = page.locator('button.entity-result', { hasText: 'Keyboard shortcuts' }).first();
  if (await kbd.isVisible().catch(() => false)) {
    await clickAndHeal(kbd);
    const overlayVisible = await page.locator('[role="dialog"]').filter({ hasText: 'Keyboard shortcuts' }).first().isVisible().catch(() => false);
    obs('shortcuts overlay visible after palette tool:', overlayVisible);
    await shot('01-12-shortcuts-from-palette');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400); await heal();
  } else note({ type: 'finding', text: 'Keyboard shortcuts tool not found in palette' });

  // 8. top-bar search chip — does clicking it crash too?
  const chip = page.locator('button.keel-chip[title="Find rows and commands"]');
  if (await chip.isVisible().catch(() => false)) {
    await chip.click();
    await page.waitForTimeout(700);
    const crashed = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    obs('top-bar search chip click → crashed:', crashed);
    await shot('01-13-topbar-chip');
    await heal();
    await escAndHeal();
  } else obs('top-bar search chip not found');

  await toasts();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
