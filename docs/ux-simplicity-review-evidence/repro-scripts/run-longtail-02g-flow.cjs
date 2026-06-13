// Matchmaking flow v3: raw mouse clicks to beat constant grid re-render.
const { start } = require('./lib-longtail.cjs');

async function mouseClick(page, locator) {
  const box = await locator.boundingBox({ timeout: 5000 }).catch(() => null);
  if (!box) { console.log('no bbox'); return false; }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(3000);
  const dm = () => page.locator('.ag-root-wrapper').first();
  const rows = () => dm().locator('.ag-center-cols-container .ag-row');
  const accept = page.getByRole('button', { name: 'Accept' }).first();

  // measure re-render churn
  const churn = await page.evaluate(async () => {
    const el = document.querySelector('.ag-center-cols-container');
    if (!el) return -1;
    let count = 0;
    const mo = new MutationObserver(m => { count += m.length; });
    mo.observe(el, { childList: true, subtree: true });
    await new Promise(r => setTimeout(r, 3000));
    mo.disconnect();
    return count;
  });
  console.log('grid DOM mutations in 3s:', churn);

  // --- Accept first OPEN row ---
  const openRow = rows().filter({ hasText: 'OPEN' }).first();
  console.log('target row:', (await openRow.innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 140));
  await mouseClick(page, openRow);
  await page.waitForTimeout(800);
  let en = !(await accept.isDisabled());
  console.log('Accept enabled after mouse row click?', en);
  if (!en) { // try clicking again on a specific cell
    await mouseClick(page, openRow.locator('.ag-cell').nth(1));
    await page.waitForTimeout(800);
    en = !(await accept.isDisabled());
    console.log('Accept enabled after 2nd try?', en);
  }
  if (en) {
    await d.shot('02g-mm-00-selected');
    await accept.click();
    await page.waitForTimeout(2500);
    const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    console.log('toasts after accept:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
    await d.shot('02g-mm-01-after-accept');
  }

  // --- expand ACCEPTED row via chevron (2nd visible column overall) ---
  const accRow = rows().filter({ hasText: 'ACCEPTED' }).first();
  console.log('accepted row present?', await accRow.count());
  // chevron may be in pinned-left container at same row-index
  const ri = await accRow.getAttribute('row-index').catch(() => null);
  console.log('row-index:', ri);
  const pinnedRow = dm().locator(`.ag-pinned-left-cols-container .ag-row[row-index="${ri}"]`);
  console.log('pinned row count:', await pinnedRow.count());
  const chevCell = pinnedRow.locator('[col-id="expansion-chevron"]');
  console.log('chev cell count:', await chevCell.count());
  if (await chevCell.count()) {
    await mouseClick(page, chevCell);
    await page.waitForTimeout(1500);
    await d.shot('02g-mm-02-expanded');
    const detailTxt = await page.locator('.ag-full-width-container').innerText().catch(() => '');
    console.log('detail:', detailTxt.replace(/\n/g, ' | ').slice(0, 400));
    const createPO = page.getByRole('button', { name: 'Create PO' }).first();
    if (await createPO.count()) {
      await mouseClick(page, createPO);
      await page.waitForTimeout(2500);
      console.log('Create PO landed at:', page.url());
      await d.shot('02g-mm-03-create-po-landing');
      const body = await page.locator('body').innerText();
      console.log('mentions North Coast Gardens?', body.includes('North Coast Gardens'));
      const qi = body.indexOf('New Purchase Order');
      console.log('quick-launch area:', body.slice(qi, qi + 400).replace(/\n/g, ' | '));
    } else console.log('NO Create PO in detail');
  }

  // --- back, expand again, Create Sale ---
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(3000);
  const accRow2 = rows().filter({ hasText: 'ACCEPTED' }).first();
  const ri2 = await accRow2.getAttribute('row-index').catch(() => null);
  const chevCell2 = dm().locator(`.ag-pinned-left-cols-container .ag-row[row-index="${ri2}"] [col-id="expansion-chevron"]`);
  if (await chevCell2.count()) {
    await mouseClick(page, chevCell2);
    await page.waitForTimeout(1500);
    const createSale = page.getByRole('button', { name: 'Create Sale' }).first();
    if (await createSale.count()) {
      await mouseClick(page, createSale);
      await page.waitForTimeout(2500);
      console.log('Create Sale landed at:', page.url());
      await d.shot('02g-mm-04-create-sale-landing');
      const body2 = await page.locator('body').innerText();
      const qi2 = body2.indexOf('New Sale');
      console.log('sale quick-launch area:', body2.slice(qi2, qi2 + 400).replace(/\n/g, ' | '));
    } else console.log('NO Create Sale in detail');
  }

  // --- dismiss one OPEN row ---
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(3000);
  const openRow3 = rows().filter({ hasText: 'OPEN' }).first();
  console.log('dismiss target:', (await openRow3.innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 120));
  await mouseClick(page, openRow3);
  await page.waitForTimeout(800);
  const dismissBtn = page.getByRole('button', { name: 'Dismiss' }).first();
  if (!(await dismissBtn.isDisabled())) {
    await dismissBtn.click();
    await page.waitForTimeout(2500);
    const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    console.log('toasts after dismiss:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
    await d.shot('02g-mm-05-after-dismiss');
  } else console.log('Dismiss still disabled');

  // --- outreach note: Gaps to Fill grid ---
  const gaps = page.locator('.ag-root-wrapper').nth(2);
  await gaps.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  const noteBtns = gaps.getByRole('button', { name: 'Note contact' });
  console.log('Note contact count in gaps grid:', await noteBtns.count());
  if (await noteBtns.count()) {
    const gr = gaps.locator('.ag-center-cols-container .ag-row').first();
    console.log('gap row before:', (await gr.innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 140));
    await mouseClick(page, noteBtns.first());
    await page.waitForTimeout(2500);
    const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    console.log('toasts after note:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
    console.log('gap row after:', (await gaps.locator('.ag-center-cols-container .ag-row').first().innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 140));
    await d.shot('02g-mm-06-after-note');
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
