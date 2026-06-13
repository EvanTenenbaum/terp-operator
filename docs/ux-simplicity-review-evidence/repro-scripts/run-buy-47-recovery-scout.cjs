const { launch, snap, nukeOverlay, aria, readToasts } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/recovery');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  await snap(page, '47-recovery-page');
  const main = await aria(page, 'main');
  console.log(main.slice(0, 6000));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
