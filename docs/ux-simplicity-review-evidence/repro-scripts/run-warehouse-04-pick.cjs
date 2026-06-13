// Desktop /pick: queue -> list -> line, pack with Enter, auto-advance
const { launch, snap, aria, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/pick');
  await page.waitForTimeout(2500);
  await snap(page, '04-pick-queue');
  console.log('URL:', page.url());
  const queueText = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  console.log('=== QUEUE TEXT ===\n', queueText);
  await done();
})().catch(e => { console.error(e); process.exit(1); });
