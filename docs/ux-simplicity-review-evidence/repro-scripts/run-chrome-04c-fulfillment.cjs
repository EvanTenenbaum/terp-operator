// Chrome lane 04c — fulfillment re-render churn probe + ⌘↵ via coordinate clicks.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  let reqCount = 0;
  page.on('request', r => { if (r.url().includes('trpc')) reqCount++; });

  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(3000);

  // churn probe: is the same row element replaced over 5s?
  const churn = await page.evaluate(async () => {
    const pick = document.querySelectorAll('.ag-center-cols-container')[0];
    const el = pick?.querySelector('.ag-row[row-index="3"]');
    if (!el) return 'no row';
    let detachCount = 0;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const now = document.querySelectorAll('.ag-center-cols-container')[0]?.querySelector('.ag-row[row-index="3"]');
      if (now !== el && now) detachCount++;
    }
    return `row element replaced in ${detachCount}/10 half-second checks`;
  });
  const before = reqCount;
  await page.waitForTimeout(5000);
  obs('churn:', churn, '| trpc requests in 5s idle:', reqCount - before);

  // click via raw coordinates (no actionability wait)
  const box = await page.locator('.ag-center-cols-container').first().locator('.ag-row[row-index="3"]').boundingBox().catch(() => null);
  obs('row 3 box:', JSON.stringify(box));
  if (box) {
    await page.mouse.click(box.x + 150, box.y + box.height / 2);
    await page.waitForTimeout(1500);
    const primary = await page.locator('[data-status-action-primary]').first().innerText({ timeout: 2000 }).catch(() => null);
    const pills = await page.locator('.selection-summary .selection-pill').allInnerTexts().catch(() => []);
    obs('after pick select: primary=', JSON.stringify(primary), 'pills=', JSON.stringify(pills));
    await shot('04c-fulfillment-selected');
    await page.keyboard.press('Meta+Enter');
    await page.waitForTimeout(2500);
    obs('after ⌘↵:'); await toasts();
    await shot('04c-fulfillment-after-commit');
    if (await page.locator('[role="dialog"]').first().isVisible().catch(() => false)) {
      obs('dialog opened by primary:', (await page.locator('[role="dialog"]').first().innerText()).replace(/\n+/g, ' | ').slice(0, 200));
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    }
    // mixed: select rows 0+1 via Meta-click coordinates
    const b0 = await page.locator('.ag-center-cols-container').first().locator('.ag-row[row-index="0"]').boundingBox().catch(() => null);
    const b1 = await page.locator('.ag-center-cols-container').first().locator('.ag-row[row-index="1"]').boundingBox().catch(() => null);
    if (b0 && b1) {
      await page.mouse.click(b0.x + 150, b0.y + b0.height / 2);
      await page.waitForTimeout(400);
      await page.keyboard.down('Meta');
      await page.mouse.click(b1.x + 150, b1.y + b1.height / 2);
      await page.keyboard.up('Meta');
      await page.waitForTimeout(800);
      const reason = await page.locator('[data-status-action-reason]').first().innerText({ timeout: 1500 }).catch(() => null);
      const pills2 = await page.locator('.selection-summary .selection-pill').allInnerTexts().catch(() => []);
      obs('mixed picks: reason=', JSON.stringify(reason), 'pills=', JSON.stringify(pills2));
      await page.keyboard.press('Meta+Enter');
      await page.waitForTimeout(1200);
      obs('mixed ⌘↵:'); await toasts();
      await shot('04c-fulfillment-mixed');
    }
  } else {
    note({ type: 'finding', text: 'fulfillment: could not get bounding box for pick row 3' });
  }

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
