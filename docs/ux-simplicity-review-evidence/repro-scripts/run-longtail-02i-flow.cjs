// Matchmaking flow v4: synthetic DOM clicks (grid re-renders ~3x/sec, normal clicks fail).
const { start } = require('./lib-longtail.cjs');

const synthClick = (page, args) => page.evaluate(({ gridIdx, rowText, partSel, btnText }) => {
  const grids = document.querySelectorAll('.ag-root-wrapper');
  const grid = grids[gridIdx];
  if (!grid) return 'no grid';
  const fire = (el) => {
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  };
  if (btnText) {
    const btn = Array.from(grid.querySelectorAll('button')).find(b => (b.textContent || '').trim() === btnText);
    if (!btn) return 'no button ' + btnText;
    fire(btn);
    return 'clicked button ' + btnText;
  }
  const rows = Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row'));
  const row = rowText ? rows.find(r => ((r.innerText || r.textContent) || '').includes(rowText)) : rows[0];
  if (!row) return 'no row matching ' + rowText;
  const ri = row.getAttribute('row-index');
  let target = row.querySelector('.ag-cell');
  if (partSel) {
    // look in pinned container same row-index
    const pinned = grid.querySelector(`.ag-pinned-left-cols-container .ag-row[row-index="${ri}"]`);
    target = (pinned && pinned.querySelector(partSel)) || row.querySelector(partSel) || target;
    const btn = target && target.querySelector('button');
    if (btn) target = btn;
  }
  if (!target) return 'no target';
  fire(target);
  return 'clicked row ' + ri + ' (' + (row.textContent || '').slice(0, 60) + ')';
}, args);

(async () => {
  const d = await start();
  const { page } = d;
  const goMm = async () => { await page.goto('http://localhost:5173/matchmaking'); await page.waitForTimeout(3000); };
  await goMm();

  // --- Accept first OPEN row ---
  console.log(await synthClick(page, { gridIdx: 0, rowText: 'OPEN' }));
  await page.waitForTimeout(800);
  const accept = page.getByRole('button', { name: 'Accept' }).first();
  console.log('Accept enabled?', !(await accept.isDisabled()));
  await accept.click().catch(e => console.log('accept fail', String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  let toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
  console.log('toasts after accept:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
  await d.shot('02i-mm-01-after-accept');

  // --- expand ACCEPTED row chevron ---
  console.log(await synthClick(page, { gridIdx: 0, rowText: 'ACCEPTED', partSel: '[col-id="expansion-chevron"]' }));
  await page.waitForTimeout(1500);
  await d.shot('02i-mm-02-expanded');
  const detailTxt = await page.locator('.ag-full-width-container').innerText().catch(() => '');
  console.log('detail:', detailTxt.replace(/\n/g, ' | ').slice(0, 300));
  const fullBody = await page.locator('body').innerText();
  console.log('has Next:?', fullBody.includes('Next:'));

  // Create PO
  const createPO = page.getByRole('button', { name: 'Create PO' }).first();
  console.log('Create PO present?', await createPO.count());
  if (await createPO.count()) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Create PO');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2500);
    console.log('Create PO landed at:', page.url());
    await d.shot('02i-mm-03-create-po-landing');
    const body = await page.locator('body').innerText();
    const qi = body.indexOf('urchase');
    console.log('landing snippet:', body.slice(Math.max(0, qi - 50), qi + 500).replace(/\n/g, ' | '));
  }

  // --- Create Sale from accepted row ---
  await goMm();
  console.log(await synthClick(page, { gridIdx: 0, rowText: 'ACCEPTED', partSel: '[col-id="expansion-chevron"]' }));
  await page.waitForTimeout(1500);
  if (await page.getByRole('button', { name: 'Create Sale' }).count()) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Create Sale');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2500);
    console.log('Create Sale landed at:', page.url());
    await d.shot('02i-mm-04-create-sale-landing');
    const body2 = await page.locator('body').innerText();
    const qi2 = body2.indexOf('New Sale');
    console.log('sale landing snippet:', body2.slice(Math.max(0, qi2 - 50), qi2 + 400).replace(/\n/g, ' | '));
  } else console.log('NO Create Sale btn');

  // --- Dismiss one OPEN row ---
  await goMm();
  console.log(await synthClick(page, { gridIdx: 0, rowText: 'OPEN' }));
  await page.waitForTimeout(800);
  const dismissBtn = page.getByRole('button', { name: 'Dismiss' }).first();
  console.log('Dismiss enabled?', !(await dismissBtn.isDisabled()));
  await dismissBtn.click().catch(e => console.log('dismiss fail', String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
  console.log('toasts after dismiss:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
  await d.shot('02i-mm-05-after-dismiss');

  // --- Note contact in Gaps to Fill (grid idx 2) ---
  const gaps = page.locator('.ag-root-wrapper').nth(1);
  await gaps.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);
  const gapRowTxt = await gaps.locator('.ag-center-cols-container .ag-row').first().innerText().catch(() => '');
  console.log('gap row before:', gapRowTxt.replace(/\n/g, ' | ').slice(0, 150));
  console.log(await synthClick(page, { gridIdx: 1, btnText: 'Note contact' }));
  await page.waitForTimeout(2500);
  toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
  console.log('toasts after note:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 4)));
  const gapRowTxt2 = await gaps.locator('.ag-center-cols-container .ag-row').first().innerText().catch(() => '');
  console.log('gap row after:', gapRowTxt2.replace(/\n/g, ' | ').slice(0, 150));
  await d.shot('02i-mm-06-after-note');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
