const { launch, snap, aria } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  console.log('URL after login:', page.url());
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2500);
  await snap(page, '00-purchaseOrders');
  const a = await aria(page);
  console.log(a.slice(0, 8000));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
