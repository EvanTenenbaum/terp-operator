// Scout /fulfillment: presets, queue, chips
const { launch, snap, aria, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(2500);
  await snap(page, '00-fulfillment-default');
  console.log('URL:', page.url());
  console.log('=== ARIA ===');
  console.log(await aria(page));
  console.log('=== TOASTS ===', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
