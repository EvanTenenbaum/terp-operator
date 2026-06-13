// Referees full flow: create own referee, detail panel tabs, pay-accrued reason, add+deactivate relationship.
const { start } = require('./lib-longtail.cjs');
const rowClick = (page, txt) => page.evaluate((t) => {
  const grid = document.querySelector('.ag-root-wrapper');
  const rows = Array.from(grid.querySelectorAll('.ag-center-cols-container .ag-row'));
  const row = t ? rows.find(r => (r.innerText || '').includes(t)) : rows[0];
  if (!row) return 'no row ' + t;
  const cell = row.querySelector('.ag-cell');
  const o = { bubbles: true, cancelable: true, view: window };
  cell.dispatchEvent(new MouseEvent('mousedown', o));
  cell.dispatchEvent(new MouseEvent('mouseup', o));
  cell.dispatchEvent(new MouseEvent('click', o));
  return 'clicked ' + (row.innerText || '').replace(/\n/g, ' ').slice(0, 60);
}, txt);

(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/referees');
  await page.waitForTimeout(2500);

  // --- create own referee (native prompt() flow!) ---
  const promptAnswers = ['Longtail QA Referee', 'longtail-qa@test.local', '555-0142'];
  let pi = 0;
  page.on('dialog', async (dlg) => {
    console.log('NATIVE DIALOG:', dlg.type(), JSON.stringify(dlg.message()));
    if (dlg.type() === 'prompt') await dlg.accept(promptAnswers[Math.min(pi++, 2)]);
    else await dlg.accept();
  });
  await page.getByRole('button', { name: 'New Referee' }).click();
  await page.waitForTimeout(2500);
  const toasts1 = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
  console.log('toasts after create referee:', JSON.stringify(toasts1.filter(t => t.trim()).slice(0, 3)));
  await d.shot('03b-ref-02-created');

  // --- select our referee row ---
  console.log(await rowClick(page, 'Longtail QA Referee'));
  await page.waitForTimeout(800);
  const openDetails = page.getByRole('button', { name: 'Open Details' });
  console.log('Open Details disabled?', await openDetails.isDisabled().catch(() => 'missing'));
  await openDetails.click().catch(e => console.log('open details fail', String(e).slice(0, 100)));
  await page.waitForTimeout(1500);
  await d.shot('03b-ref-03-detail-panel');
  // totals strip + tabs
  const panel = page.locator('[role="tablist"]').last();
  const panelText = await page.evaluate(() => {
    const tl = document.querySelectorAll('[role="tablist"]');
    const p = tl[tl.length - 1]?.closest('div[class*="fixed"], aside, section, div');
    return p ? p.parentElement.innerText.slice(0, 1200) : '(no panel)';
  });
  console.log('detail panel text:', panelText.replace(/\n/g, ' | ').slice(0, 800));
  // Pay accrued reason
  const pay = page.getByRole('button', { name: /Pay accrued/i }).first();
  if (await pay.count()) {
    console.log('Pay accrued disabled?', await pay.isDisabled(), 'title:', await pay.getAttribute('title'));
  } else console.log('Pay accrued not visible on relationships tab');
  // Credits tab
  await page.getByRole('tab', { name: /Credits/i }).click().catch(e => console.log('credits tab fail', String(e).slice(0, 80)));
  await page.waitForTimeout(1200);
  await d.shot('03b-ref-04-credits-tab');
  const pay2 = page.getByRole('button', { name: /Pay accrued/i }).first();
  if (await pay2.count()) console.log('credits tab: Pay accrued disabled?', await pay2.isDisabled(), 'title:', await pay2.getAttribute('title'));
  const creditsTxt = await page.evaluate(() => {
    const tl = document.querySelectorAll('[role="tablist"]');
    const p = tl[tl.length - 1]?.parentElement;
    return p ? p.innerText.slice(0, 800) : '';
  });
  console.log('credits content:', creditsTxt.replace(/\n/g, ' | ').slice(0, 500));
  // close panel
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // --- add relationship ---
  console.log(await rowClick(page, 'Longtail QA Referee'));
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Add Relationship' }).click().catch(e => console.log('add rel fail', String(e).slice(0, 80)));
  await page.waitForTimeout(1000);
  await d.shot('03b-ref-05-rel-dialog');
  await d.aria('rel dialog', '[role="dialog"]');
  // select customer
  await page.locator('#rrd-entity').selectOption({ label: 'reaper-test-0762991f' }).catch(async e => {
    console.log('entity select by label fail; options:', String(e).slice(0, 80));
    const opts = await page.locator('#rrd-entity option').allInnerTexts();
    console.log('options sample:', JSON.stringify(opts.slice(0, 8)));
  });
  await page.waitForTimeout(400);
  const submitBtn = page.locator('[role="dialog"] button[type="submit"]');
  console.log('submit disabled?', await submitBtn.isDisabled().catch(() => 'n/a'));
  await submitBtn.click();
  await page.waitForTimeout(2000);
  const toasts2 = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
  console.log('toasts after create relationship:', JSON.stringify(toasts2.filter(t => t.trim()).slice(0, 3)));
  await d.shot('03b-ref-06-rel-created');

  // --- open details, verify relationship, deactivate it ---
  console.log(await rowClick(page, 'Longtail QA Referee'));
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Open Details' }).click();
  await page.waitForTimeout(1500);
  await d.shot('03b-ref-07-detail-with-rel');
  const relTxt = await page.evaluate(() => {
    const tl = document.querySelectorAll('[role="tablist"]');
    const p = tl[tl.length - 1]?.parentElement;
    return p ? p.innerText.slice(0, 1200) : '';
  });
  console.log('relationships content:', relTxt.replace(/\n/g, ' | ').slice(0, 700));
  // deactivate
  const deact = page.getByRole('button', { name: /Deactivate/i }).first();
  console.log('Deactivate button count:', await page.getByRole('button', { name: /Deactivate/i }).count());
  if (await deact.count()) {
    await deact.click();
    await page.waitForTimeout(1000);
    await d.shot('03b-ref-08-deactivate-dialog');
    // submit without reason to test validation
    await page.locator('[role="dialog"] button[type="submit"]').click().catch(() => {});
    await page.waitForTimeout(800);
    const errTxt = await page.locator('[role="dialog"]').innerText().catch(() => '');
    console.log('deactivate dialog after empty submit:', errTxt.replace(/\n/g, ' | ').slice(0, 300));
    await page.locator('[role="dialog"] textarea, [role="dialog"] input[type="text"]').last().fill('Longtail QA test deactivation');
    await page.locator('[role="dialog"] button[type="submit"]').click();
    await page.waitForTimeout(2000);
    await d.shot('03b-ref-09-deactivated');
    const relTxt2 = await page.evaluate(() => {
      const tl = document.querySelectorAll('[role="tablist"]');
      const p = tl[tl.length - 1]?.parentElement;
      return p ? p.innerText.slice(0, 1200) : '';
    });
    console.log('after deactivate:', relTxt2.replace(/\n/g, ' | ').slice(0, 700));
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
