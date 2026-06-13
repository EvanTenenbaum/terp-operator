const { launch, snap, nukeOverlay, aria } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch('intake@terpagro.local');
  await page.goto('http://localhost:5173/intake');
  await page.waitForTimeout(2500);
  await nukeOverlay(page);
  await snap(page, '27-intake-queue');
  const a = await aria(page, 'main');
  console.log(a.slice(0, 10000));
  await done();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
