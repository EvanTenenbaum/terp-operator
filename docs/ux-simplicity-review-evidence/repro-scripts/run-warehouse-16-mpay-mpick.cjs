// Mobile payments log attempt + mobile pick full pack flow + rotate + back-button
const { launch, snap, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch({ viewport: { width: 390, height: 844 } });

  // A) Try logging a receipt on mobile payments
  await page.goto('http://localhost:5173/mobile/payments');
  await page.waitForTimeout(2500);
  const firstRow = page.locator('main button[aria-expanded]').first();
  const rowName = await firstRow.getAttribute('aria-label');
  console.log('expanding payment row:', rowName);
  await firstRow.click();
  await page.waitForTimeout(1200);
  await snap(page, '16-m-pay-form');
  const formTxt = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
  console.log('form area:', formTxt.slice(0, 600));
  // fill amount + method
  const amountInput = page.locator('input[inputmode="decimal"], input[type="number"]').first();
  console.log('amount input count:', await amountInput.count());
  await amountInput.fill('1');
  // pick a method button
  const methodBtns = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /cash|wire|check|ach|zelle/i.test(t)));
  console.log('method options:', methodBtns);
  await page.locator('button', { hasText: /^Cash$/ }).first().click().catch(async () => page.getByRole('button', { name: /cash/i }).first().click());
  await page.waitForTimeout(500);
  const rr = page.getByRole('button', { name: 'Record Receipt' });
  console.log('Record Receipt disabled:', await rr.isDisabled().catch(()=>'?'));
  await rr.click();
  await page.waitForTimeout(3000);
  console.log('toasts after submit:', await readToasts(page));
  console.log('body after submit:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 400));
  await snap(page, '16-m-pay-submitted');

  // B) Mobile pick: full pack flow on PICK-REAL-00022
  await page.goto('http://localhost:5173/mobile/pick');
  await page.waitForTimeout(2500);
  await snap(page, '16-m-pick-queue');
  console.log('m-pick queue:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 600));
  const q22 = page.locator('button', { hasText: 'PICK-REAL-00022' }).first();
  await q22.click();
  await page.waitForTimeout(2000);
  await snap(page, '16-m-pick-list');
  // tap target sizes on list
  const tapSizes = await page.evaluate(() => [...document.querySelectorAll('ul.divide-y li button')].map(b => { const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; }));
  console.log('line tap targets:', JSON.stringify(tapSizes));
  const lineBtns = page.locator('ul.divide-y li button:not([disabled])');
  await lineBtns.first().click();
  await page.waitForTimeout(1500);
  await snap(page, '16-m-pick-line');
  // input modes for numeric keyboard
  const im = await page.evaluate(() => ['pick-actual-qty','pick-actual-weight','pick-bag-code'].map(id => { const e = document.getElementById(id); return e ? { id, inputmode: e.getAttribute('inputmode'), fontSize: getComputedStyle(e).fontSize, h: Math.round(e.getBoundingClientRect().height) } : { id, missing: true }; }));
  console.log('inputs:', JSON.stringify(im));
  // pack with rotate mid-flow: fill weight, rotate to landscape, press Enter
  await page.locator('#pick-actual-weight').fill('6.25');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1200);
  await snap(page, '16-m-pick-landscape');
  console.log('after rotate still on line?', await page.locator('#pick-actual-weight').isVisible().catch(()=>false), 'weight value:', await page.locator('#pick-actual-weight').inputValue().catch(()=>'?'));
  await page.locator('#pick-actual-weight').press('Enter');
  await page.waitForTimeout(2500);
  console.log('after pack (landscape) screen:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 350));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);

  // C) back-button mid-pack: on current line, fill weight, hit browser back
  const onLine = await page.locator('#pick-actual-weight').isVisible().catch(()=>false);
  console.log('on line screen for back test:', onLine);
  if (onLine) {
    await page.locator('#pick-actual-weight').fill('4.4');
    await page.goBack();
    await page.waitForTimeout(1500);
    console.log('after back URL:', page.url());
    console.log('after back screen:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 300));
    await snap(page, '16-m-after-back');
    await page.goForward().catch(()=>{});
    await page.waitForTimeout(1200);
    console.log('after forward URL:', page.url(), 'screen:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(120, 300));
  }
  await done();
})().catch(e => { console.error(e); process.exit(1); });
