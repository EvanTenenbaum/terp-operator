// Referees: list, detail panel tabs, totals strip, pay-accrued disabled reason, create relationship (2-step), void credit, deactivated history.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/referees');
  await page.waitForTimeout(2500);
  await d.shot('03-ref-00-list');

  // open detail of the single referee
  await page.getByText('QA Test Referee (Updated)').first().click().catch(e => console.log('row click fail', String(e).slice(0,120)));
  await page.waitForTimeout(1500);
  await d.shot('03-ref-01-detail');
  await d.dump('referee detail');

  // tabs
  for (const tab of ['Relationships', 'Credits']) {
    const t = page.getByRole('tab', { name: tab }).first();
    const btn = (await t.count()) ? t : page.getByRole('button', { name: tab }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(1200);
      await d.shot(`03-ref-02-tab-${tab.toLowerCase()}`);
      await d.dump(`tab ${tab}`);
    } else console.log('TAB NOT FOUND:', tab);
  }

  // Pay accrued credits button state + tooltip/reason
  const pay = page.getByRole('button', { name: /Pay accrued/i }).first();
  if (await pay.count()) {
    console.log('Pay accrued disabled?', await pay.isDisabled());
    console.log('Pay accrued title attr:', await pay.getAttribute('title'));
    console.log('Pay accrued aria-disabled:', await pay.getAttribute('aria-disabled'));
    await pay.hover().catch(()=>{});
    await page.waitForTimeout(800);
    await d.shot('03-ref-03-pay-hover');
  } else console.log('NO Pay accrued button found');

  // Create a referee relationship — look for button
  const newRel = page.getByRole('button', { name: /relationship/i }).first();
  console.log('relationship button count:', await newRel.count());
  if (await newRel.count()) {
    await newRel.click();
    await page.waitForTimeout(1200);
    await d.shot('03-ref-04-rel-dialog-step1');
    await d.dump('rel dialog step 1');
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
