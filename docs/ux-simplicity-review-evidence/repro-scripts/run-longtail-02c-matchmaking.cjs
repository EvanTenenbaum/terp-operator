// Matchmaking full flow: need + stock entry, accept/dismiss, outreach, settings knob.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(2500);

  const toastWatch = async (label) => {
    const t = await page.locator('[role="status"], [role="alert"], .toast, [class*="toast"]').allInnerTexts().catch(() => []);
    console.log(`TOASTS after ${label}:`, JSON.stringify(t.filter(x => x.trim())));
  };

  // --- Need entry ---
  const sel = (i) => page.locator('select').nth(i);
  await sel(2).selectOption({ label: 'reaper-test-01f2a3f5' });
  await sel(3).selectOption({ label: 'Flower' });
  await page.getByPlaceholder('e.g. Indica flower').fill('Longtail QA indoor flower need');
  // Qty + Target $ inputs (visible text inputs labelled Qty / Target $)
  await page.getByLabel('Qty').first().fill('10');   // Qty (need)
  await page.getByLabel('Target $').fill('500');
  const addNeed = page.getByRole('button', { name: 'Add Need' });
  console.log('Add Need disabled?', await addNeed.isDisabled());
  await d.shot('02c-mm-01-need-filled');
  await addNeed.click({ timeout: 8000 }).catch(e => console.log('AddNeed click fail', String(e).slice(0, 120)));
  await page.waitForTimeout(2000);
  await toastWatch('Add Need');
  await d.shot('02c-mm-02-need-added');

  // --- Stock entry ---
  await sel(4).selectOption({ label: 'Boulder Creek' });
  await sel(5).selectOption({ label: 'Flower' });
  await page.getByPlaceholder('e.g. Blue Dream 28g').fill('Longtail QA outdoor flower stock');
  await page.getByLabel('Qty').nth(1).fill('25');   // Qty (stock)
  await page.getByLabel('Ask $').fill('450');
  const addStock = page.getByRole('button', { name: 'Add Stock' });
  console.log('Add Stock disabled?', await addStock.isDisabled());
  await addStock.click({ timeout: 8000 }).catch(e => console.log('AddStock click fail', String(e).slice(0, 120)));
  await page.waitForTimeout(2000);
  await toastWatch('Add Stock');
  await d.shot('02c-mm-03-stock-added');

  // --- Grid: select an OPEN row via ag-grid checkbox ---
  const openRow = page.locator('.ag-center-cols-container .ag-row').filter({ hasText: 'OPEN' }).first();
  console.log('open rows:', await page.locator('.ag-center-cols-container .ag-row').filter({ hasText: 'OPEN' }).count());
  // row expiry styling probe: classes of rows
  const rowClasses = await page.evaluate(() => Array.from(document.querySelectorAll('.ag-center-cols-container .ag-row')).slice(0, 25).map(r => r.className.replace(/ag-row[\w-]*/g, '').trim()).filter(Boolean));
  console.log('non-default row classes:', JSON.stringify(rowClasses.slice(0, 10)));
  const cb = openRow.locator('input[type="checkbox"], .ag-selection-checkbox');
  if (await cb.count()) {
    await cb.first().click({ force: true }).catch(e => console.log('cb click fail', String(e).slice(0, 100)));
  } else {
    console.log('no row checkbox; clicking row');
    await openRow.click().catch(() => {});
  }
  await page.waitForTimeout(800);
  await d.shot('02c-mm-04-row-selected');
  const accept = page.getByRole('button', { name: 'Accept' }).first();
  console.log('Accept disabled?', await accept.isDisabled().catch(() => 'n/a'));
  await accept.click({ timeout: 8000 }).catch(e => console.log('Accept click fail', String(e).slice(0, 120)));
  await page.waitForTimeout(2000);
  await toastWatch('Accept');
  await d.shot('02c-mm-05-after-accept');
  await d.dump('after accept');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
