// Floor knob valid change + scores explainer.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(3500);
  const floor = page.getByLabel(/Show matches scoring at least/).first();
  console.log('floor value now:', await floor.inputValue());
  const fadedBefore = await page.evaluate(() => document.querySelectorAll('.ag-root-wrapper .ag-row.opacity-40').length);
  console.log('faded before:', fadedBefore);
  await floor.fill('70');
  await floor.blur().catch(() => {});
  await page.waitForTimeout(3000);
  const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
  console.log('toasts:', JSON.stringify(toasts.filter(t => t.trim()).slice(0, 3)));
  const fadedAfter = await page.evaluate(() => document.querySelectorAll('.ag-root-wrapper .ag-row.opacity-40').length);
  console.log('faded after floor=70:', fadedAfter);
  await d.shot('02o-mm-floor-70');
  // restore 10
  await floor.fill('10');
  await floor.blur().catch(() => {});
  await page.waitForTimeout(2000);
  console.log('restored to', await floor.inputValue());
  // explainer
  const how = page.getByText('How scores are calculated').first();
  await how.click().catch(e => console.log('how click fail', String(e).slice(0, 80)));
  await page.waitForTimeout(1000);
  await d.shot('02o-mm-explainer');
  const body = await page.locator('body').innerText();
  const i = body.indexOf('How scores are calculated');
  console.log('explainer:', body.slice(i, i + 600).replace(/\n/g, ' | '));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
