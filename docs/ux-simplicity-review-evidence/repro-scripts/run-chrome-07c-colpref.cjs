// Chrome lane 07c — settle column-pref persistence using col-id probes.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, shot, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);
  const markerHeader = () => page.evaluate(() => document.querySelectorAll('.ag-header-cell[col-id="legacyMarker"]').length);
  const lsKeys = () => page.evaluate(() => Object.keys(localStorage).filter(k => /col|grid|pref/i.test(k)));

  await page.goto('http://localhost:5173/inventory');
  await page.waitForTimeout(3500);
  obs('marker header count initially:', await markerHeader());
  await page.locator('button[title="Columns"]').first().click();
  await page.waitForTimeout(500);
  const marker = page.locator('label:has(input[type="checkbox"])').filter({ hasText: /^Marker$/ }).first();
  await marker.click();
  await page.waitForTimeout(900);
  obs('marker header after uncheck:', await markerHeader());
  await shot('07c-after-uncheck');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  obs('localStorage pref keys:', JSON.stringify(await lsKeys()));
  await page.reload();
  await page.waitForTimeout(3500);
  obs('marker header after reload:', await markerHeader());
  obs('localStorage pref keys after reload:', JSON.stringify(await lsKeys()));
  await shot('07c-after-reload');
  // restore if needed
  if ((await markerHeader()) === 0) {
    await page.locator('button[title="Columns"]').first().click();
    await page.waitForTimeout(500);
    await page.locator('label:has(input[type="checkbox"])').filter({ hasText: /^Marker$/ }).first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  }
  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
