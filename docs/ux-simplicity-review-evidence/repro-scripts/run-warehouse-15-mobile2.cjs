// Mobile deep interactions: catalog row + copy offer; payments receive flow; contacts detail
const { launch, snap, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch({ viewport: { width: 390, height: 844 } });

  // CATALOG: tap a row, inspect sheet for internal leak + copy offer
  await page.goto('http://localhost:5173/mobile/catalog');
  await page.waitForTimeout(2500);
  const row = page.locator('main button', { hasText: 'FLW-OUTDOOR-001' }).first();
  console.log('catalog row count:', await row.count());
  await row.click().catch(async () => { await page.locator('main [role="button"], main li, main div[class*="card"]').first().click(); });
  await page.waitForTimeout(1500);
  await snap(page, '15-m-catalog-sheet');
  const sheetTxt = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
  console.log('catalog sheet:', sheetTxt.slice(0, 900));
  console.log('leak check cost/margin/vendor:', /cost|margin|vendor/i.test(sheetTxt));
  const copyBtn = page.locator('[data-testid="copy-offer-button"]');
  console.log('copy-offer btn:', await copyBtn.count());
  if (await copyBtn.count()) {
    await copyBtn.click();
    await page.waitForTimeout(800);
    console.log('copy feedback:', (await page.evaluate(() => document.body.innerText)).match(/Copied|copy|error/gi)?.slice(0,5));
    await snap(page, '15-m-copy-offer');
  }

  // PAYMENTS: Receive Payment flow
  await page.goto('http://localhost:5173/mobile/payments');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Receive Payment' }).click();
  await page.waitForTimeout(1500);
  await snap(page, '15-m-receive-payment');
  console.log('receive payment screen:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700));
  const payInputs = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].map(i => ({ t: i.tagName, l: i.getAttribute('aria-label'), ph: i.getAttribute('placeholder'), im: i.getAttribute('inputmode') })));
  console.log('inputs:', JSON.stringify(payInputs).slice(0, 800));
  // don't actually log a payment against existing data? Brief allows mutations; but choose a customer + small amount and submit to test end-to-end.
  // First check what the form requires.

  // CONTACTS: tap row -> detail
  await page.goto('http://localhost:5173/mobile/contacts');
  await page.waitForTimeout(2500);
  // filter to Customer tab and pick a real-looking one
  const rowBtns = page.locator('main button');
  console.log('contact buttons:', await rowBtns.count());
  const target = page.locator('main button', { hasText: 'Canyon Market' }).first();
  if (await target.count()) { await target.click(); }
  else { await rowBtns.nth(5).click(); }
  await page.waitForTimeout(2500);
  console.log('contact detail URL:', page.url());
  console.log('detail:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 800));
  await snap(page, '15-m-contact-detail');
  await done();
})().catch(e => { console.error(e); process.exit(1); });
