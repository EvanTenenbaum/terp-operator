// Matchmaking: select rows properly, Accept one, Dismiss one, probe outreach + next links, settings floor knob.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(2500);

  // Deterministic Matches grid = first ag-grid root after the heading
  const dmGrid = page.locator('.ag-root-wrapper').first();
  const rows = dmGrid.locator('.ag-center-cols-container .ag-row');
  console.log('dm rows:', await rows.count());

  // pinned-left checkbox column may live in .ag-pinned-left-cols-container
  const leftRows = dmGrid.locator('.ag-pinned-left-cols-container .ag-row');
  console.log('left pinned rows:', await leftRows.count());
  const firstOpenIdx = await (async () => {
    const n = await rows.count();
    for (let i = 0; i < Math.min(n, 30); i++) {
      const t = await rows.nth(i).innerText();
      if (t.includes('OPEN')) return i;
    }
    return -1;
  })();
  console.log('first OPEN row idx:', firstOpenIdx);
  if (firstOpenIdx >= 0) {
    const rowId = await rows.nth(firstOpenIdx).getAttribute('row-id');
    console.log('row-id:', rowId);
    const cbox = dmGrid.locator(`.ag-row[row-id="${rowId}"] input[type="checkbox"]`).first();
    console.log('checkbox count for row:', await cbox.count());
    await cbox.check({ force: true }).catch(async e => {
      console.log('check fail', String(e).slice(0, 100));
      await dmGrid.locator(`.ag-row[row-id="${rowId}"] .ag-selection-checkbox`).first().click({ force: true }).catch(e2 => console.log('sel cb fail', String(e2).slice(0, 100)));
    });
    await page.waitForTimeout(700);
    const accept = page.getByRole('button', { name: 'Accept' }).first();
    console.log('Accept disabled after checkbox?', await accept.isDisabled());
    if (!(await accept.isDisabled())) {
      await accept.click();
      await page.waitForTimeout(2000);
      await d.shot('02d-mm-01-after-accept');
      const body = await page.locator('body').innerText();
      const tidx = body.search(/create PO|Create PO|create Sale|Create Sale|Next:/);
      console.log('next-links present?', tidx >= 0 ? body.slice(tidx - 200, tidx + 300).replace(/\n/g, ' | ') : 'NO');
      // toasts
      const t = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
      console.log('toasts:', JSON.stringify(t));
    } else {
      // maybe selection via row click
      await rows.nth(firstOpenIdx).click();
      await page.waitForTimeout(700);
      console.log('Accept disabled after row click?', await accept.isDisabled());
      await d.shot('02d-mm-01b-rowclick');
      await d.dump('after row click');
    }
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
