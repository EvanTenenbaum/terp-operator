// Chrome lane 04d — fulfillment ⌘↵ via in-page event dispatch (rows re-render constantly).
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, shot, toasts, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(3500);

  async function clickPickRow(i, meta = false) {
    return page.evaluate(({ i, meta }) => {
      const grid = document.querySelectorAll('.ag-center-cols-container')[0];
      const cell = grid?.querySelector(`.ag-row[row-index="${i}"] .ag-cell`);
      if (!cell) return 'no cell';
      const rect = cell.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, clientX: rect.x + 10, clientY: rect.y + 5, metaKey: meta, button: 0 };
      cell.dispatchEvent(new MouseEvent('mousedown', opts));
      cell.dispatchEvent(new MouseEvent('mouseup', opts));
      cell.dispatchEvent(new MouseEvent('click', opts));
      return cell.textContent?.slice(0, 60) ?? 'clicked';
    }, { i, meta });
  }

  obs('click row 3:', await clickPickRow(3));
  await page.waitForTimeout(1500);
  const primary = await page.locator('[data-status-action-primary]').first().innerText({ timeout: 2500 }).catch(() => null);
  const pills = await page.locator('.selection-summary .selection-pill').allInnerTexts().catch(() => []);
  obs('after pick select: primary=', JSON.stringify(primary), 'pills=', JSON.stringify(pills));
  await shot('04d-fulfillment-selected');
  await page.keyboard.press('Meta+Enter');
  await page.waitForTimeout(2500);
  obs('after ⌘↵:'); await toasts();
  await shot('04d-fulfillment-after-commit');
  const dlg = page.locator('[role="dialog"]').first();
  if (await dlg.isVisible().catch(() => false)) {
    obs('dialog from primary:', (await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 250));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  }

  // mixed selection
  obs('click row 0:', await clickPickRow(0));
  await page.waitForTimeout(400);
  obs('meta-click row 1:', await clickPickRow(1, true));
  await page.waitForTimeout(900);
  const reason = await page.locator('[data-status-action-reason]').first().innerText({ timeout: 1500 }).catch(() => null);
  const pills2 = await page.locator('.selection-summary .selection-pill').allInnerTexts().catch(() => []);
  obs('mixed picks: reason=', JSON.stringify(reason), 'pills=', JSON.stringify(pills2));
  await page.keyboard.press('Meta+Enter');
  await page.waitForTimeout(1200);
  obs('mixed ⌘↵:'); await toasts();
  await shot('04d-fulfillment-mixed');

  await heal();
  await finish();
})().catch(e => { console.error(e); process.exit(1); });
