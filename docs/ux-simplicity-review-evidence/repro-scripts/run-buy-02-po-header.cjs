const { launch, snap, aria, readToasts } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'New PO' }).click();
  await page.waitForTimeout(1000);

  await page.getByLabel('Payment terms').selectOption({ label: 'Prepayment Required' });
  await snap(page, '02-terms-prepayment');

  // 2. Vendor select
  await page.getByRole('combobox', { name: 'Vendor', exact: true }).selectOption({ label: 'Vista Verde' });
  await page.waitForTimeout(800);
  console.log('Context button disabled after vendor?', await page.getByRole('button', { name: 'Context', exact: true }).isDisabled());
  // aside content
  console.log('--- Vendor context aside ---');
  console.log(await aria(page, 'aside, [role="complementary"]').catch(()=>'(err)'));
  await snap(page, '02-vendor-selected-aside');

  // 3. Open Context drawer
  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await page.waitForTimeout(1200);
  await snap(page, '02-context-drawer');
  console.log('--- After Context click (dialog/drawer) ---');
  const dlg = await aria(page, '[role="dialog"]').catch(() => null);
  console.log(dlg || '(no dialog role — dumping page tail)');
  if (!dlg) console.log((await aria(page)).slice(-4000));
  console.log('TOASTS:', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
