// Matchmaking: select+accept, next links, dismiss, outreach note, settings floor knob.
const { start } = require('./lib-longtail.cjs');

async function clickRowRetry(page, locator, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { await locator.click({ timeout: 4000 }); return true; }
    catch (e) { console.log('row click retry', i, String(e).slice(0, 80)); }
  }
  return false;
}

(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(2500);
  const dmGrid = page.locator('.ag-root-wrapper').first();
  const rows = dmGrid.locator('.ag-center-cols-container .ag-row');
  const accept = page.getByRole('button', { name: 'Accept' }).first();
  const dismiss = page.getByRole('button', { name: 'Dismiss' }).first();

  // --- select first OPEN row + Accept ---
  let openRow = rows.filter({ hasText: 'OPEN' }).first();
  const acceptedRowText = await openRow.innerText().catch(() => '');
  console.log('accepting row:', acceptedRowText.replace(/\n/g, ' | ').slice(0, 160));
  await clickRowRetry(page, openRow.locator('.ag-cell').nth(2));
  await page.waitForTimeout(600);
  console.log('Accept enabled after row click?', !(await accept.isDisabled()));
  if (!(await accept.isDisabled())) {
    await accept.click();
    await page.waitForTimeout(2500);
    const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    console.log('toasts after accept:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
    await d.shot('02f-mm-01-after-accept');
  }

  // --- expand an ACCEPTED row, find Next links ---
  const accRow = rows.filter({ hasText: 'ACCEPTED' }).first();
  const accRowId = await accRow.getAttribute('row-id').catch(() => null);
  console.log('accepted row-id:', accRowId);
  // chevron is pinned-left col 2 — chevron cell in pinned container
  const chev = dmGrid.locator(`.ag-pinned-left-cols-container .ag-row[row-id="${accRowId}"] [col-id="expansion-chevron"] button, .ag-pinned-left-cols-container .ag-row[row-id="${accRowId}"] [col-id="expansion-chevron"]`).first();
  console.log('chevron found?', await chev.count());
  await chev.click({ force: true }).catch(e => console.log('chev fail', String(e).slice(0, 100)));
  await page.waitForTimeout(1200);
  await d.shot('02f-mm-02-expanded-accepted');
  const detail = await page.locator('.ag-details-row, .ag-full-width-container').allInnerTexts().catch(() => []);
  console.log('detail content:', JSON.stringify(detail).slice(0, 500));

  // Create PO link
  const createPO = page.getByRole('button', { name: 'Create PO' }).first();
  if (await createPO.count()) {
    await createPO.click();
    await page.waitForTimeout(2200);
    console.log('Create PO landed at:', page.url());
    await d.shot('02f-mm-03-create-po-landing');
    const body = await page.locator('body').innerText();
    console.log('PO quicklaunch mentions match vendor North Coast Gardens?', body.includes('North Coast Gardens') ? 'somewhere on page' : 'NO');
    const ql = await page.locator('[class*="quick"], form').first().innerText().catch(() => '');
    console.log('quick panel head:', ql.slice(0, 400).replace(/\n/g, ' | '));
  } else console.log('NO Create PO button');

  // back to matchmaking, expand accepted again, Create Sale
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(2500);
  const accRow2 = page.locator('.ag-root-wrapper').first().locator('.ag-center-cols-container .ag-row').filter({ hasText: 'ACCEPTED' }).first();
  const accRowId2 = await accRow2.getAttribute('row-id').catch(() => null);
  const chev2 = page.locator(`.ag-pinned-left-cols-container .ag-row[row-id="${accRowId2}"] [col-id="expansion-chevron"]`).first();
  await chev2.click({ force: true }).catch(e => console.log('chev2 fail', String(e).slice(0, 100)));
  await page.waitForTimeout(1200);
  const createSale = page.getByRole('button', { name: 'Create Sale' }).first();
  if (await createSale.count()) {
    await createSale.click();
    await page.waitForTimeout(2200);
    console.log('Create Sale landed at:', page.url());
    await d.shot('02f-mm-04-create-sale-landing');
    const body2 = await page.locator('body').innerText();
    const ci = body2.indexOf('Quick');
    console.log('sale landing quick area:', body2.slice(ci, ci + 300).replace(/\n/g, ' | '));
  } else console.log('NO Create Sale button');

  // --- dismiss one OPEN row ---
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(2500);
  const rows3 = page.locator('.ag-root-wrapper').first().locator('.ag-center-cols-container .ag-row');
  const openRow3 = rows3.filter({ hasText: 'OPEN' }).first();
  console.log('dismissing row:', (await openRow3.innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 140));
  await clickRowRetry(page, openRow3.locator('.ag-cell').nth(2));
  await page.waitForTimeout(600);
  const dismiss3 = page.getByRole('button', { name: 'Dismiss' }).first();
  console.log('Dismiss enabled?', !(await dismiss3.isDisabled()));
  if (!(await dismiss3.isDisabled())) {
    await dismiss3.click();
    await page.waitForTimeout(2500);
    const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    console.log('toasts after dismiss:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
    await d.shot('02f-mm-05-after-dismiss');
  }

  // --- outreach note in Gaps to Fill ---
  const gapsGridIdx = 2; // 0 dm, 1 inventory to move, 2 gaps
  const gapsGrid = page.locator('.ag-root-wrapper').nth(gapsGridIdx);
  await gapsGrid.scrollIntoViewIfNeeded().catch(() => {});
  const gapRow = gapsGrid.locator('.ag-center-cols-container .ag-row').first();
  const gapBefore = await gapRow.innerText().catch(() => '');
  console.log('gap row before:', gapBefore.replace(/\n/g, ' | ').slice(0, 160));
  const noteBtn = gapsGrid.getByRole('button', { name: 'Note contact' }).first();
  console.log('Note contact buttons:', await gapsGrid.getByRole('button', { name: 'Note contact' }).count());
  if (await noteBtn.count()) {
    await noteBtn.click({ force: true }).catch(e => console.log('note fail', String(e).slice(0, 100)));
    await page.waitForTimeout(2500);
    const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    console.log('toasts after note contact:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
    const gapAfter = await gapsGrid.locator('.ag-center-cols-container .ag-row').first().innerText().catch(() => '');
    console.log('gap row after:', gapAfter.replace(/\n/g, ' | ').slice(0, 160));
    await d.shot('02f-mm-06-after-note-contact');
  }

  // --- settings: change match quality floor ---
  const floor = page.getByLabel(/Show matches scoring at least/).first();
  const before = await floor.inputValue().catch(() => 'n/a');
  const dmCountBefore = await page.locator('.ag-root-wrapper').first().locator('.ag-center-cols-container .ag-row').count();
  console.log('floor before:', before, 'dm rows before:', dmCountBefore);
  await floor.fill('85');
  await floor.blur().catch(() => {});
  await page.waitForTimeout(2500);
  const dmCountAfter = await page.locator('.ag-root-wrapper').first().locator('.ag-center-cols-container .ag-row').count();
  // also count faded rows
  const faded = await page.evaluate(() => document.querySelectorAll('.ag-root-wrapper .ag-row.opacity-40').length);
  console.log('dm rows after floor=85:', dmCountAfter, 'faded rows:', faded);
  await d.shot('02f-mm-07-floor-85');
  // restore
  await floor.fill(String(before === 'n/a' ? 35 : before));
  await floor.blur().catch(() => {});
  await page.waitForTimeout(1500);
  console.log('floor restored');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
