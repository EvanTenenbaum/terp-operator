const { launch, snap, aria, readToasts } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(1500);
  console.log('URL after New PO:', page.url());
  await snap(page, '01-newpo-initial');
  const a = await aria(page);
  console.log(a);
  console.log('TOASTS:', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
