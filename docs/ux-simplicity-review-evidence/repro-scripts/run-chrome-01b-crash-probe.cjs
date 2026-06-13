// Chrome lane 01b — probe ⌘K crash + Try again recovery; is palette usable after?
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, shot, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  obs('url', page.url());
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(800);
  const crashed = await page.locator('text=Something went wrong').isVisible().catch(() => false);
  obs('crashed after Meta+K:', crashed);
  if (crashed) {
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForTimeout(1000);
    const crashedAgain = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    const paletteOpen = await page.locator('[role="dialog"][aria-label="Command palette"]').isVisible().catch(() => false);
    obs('after Try again: crashedAgain=', crashedAgain, 'paletteOpen=', paletteOpen);
    await shot('01b-01-after-tryagain');
    if (paletteOpen) {
      // is it functional? type a query
      await page.getByLabel('Command palette search').fill('Files');
      await page.waitForTimeout(900);
      const text = await page.locator('[role="dialog"][aria-label="Command palette"]').innerText();
      obs('palette content after query:', text.replace(/\n+/g, ' | ').slice(0, 500));
      await shot('01b-02-palette-functional');
      // close and reopen — does Meta+K crash again now that component stays mounted?
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.keyboard.press('Meta+k');
      await page.waitForTimeout(800);
      const crash2 = await page.locator('text=Something went wrong').isVisible().catch(() => false);
      const open2 = await page.locator('[role="dialog"][aria-label="Command palette"]').isVisible().catch(() => false);
      obs('reopen after close: crash=', crash2, 'open=', open2);
      await shot('01b-03-reopen');
      // Esc again, then try Meta+Shift+F entities tab
      if (open2) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
      await page.keyboard.press('Meta+Shift+f');
      await page.waitForTimeout(800);
      const crash3 = await page.locator('text=Something went wrong').isVisible().catch(() => false);
      const entTab = await page.getByLabel('Entity search').isVisible().catch(() => false);
      obs('Meta+Shift+F: crash=', crash3, 'entitySearchVisible=', entTab);
      await shot('01b-04-entities-tab');
    }
  }
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
