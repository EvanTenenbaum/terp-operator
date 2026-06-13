// Desktop /pick full flow on PICK-REAL-00007
const { launch, snap, aria, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  // track recordWeighAndPack calls for double-submit detection
  const packCalls = [];
  page.on('request', r => { if (r.url().includes('command') && r.method() === 'POST') {
    const pd = r.postData() || '';
    if (pd.includes('recordWeighAndPack')) packCalls.push({ t: Date.now(), url: r.url().slice(-80) });
  }});
  await page.goto('http://localhost:5173/pick');
  await page.waitForTimeout(2500);

  // STEP 1: tap queue item PICK-REAL-00007
  await page.locator('button', { hasText: 'PICK-REAL-00007' }).first().click();
  await page.waitForTimeout(2000);
  await snap(page, '05-list-screen');
  console.log('=== LIST SCREEN TEXT ===');
  console.log(await page.evaluate(() => document.querySelector('main')?.innerText?.slice(0, 1500) || document.body.innerText.slice(1200, 2800)));

  // STEP 2: tap first enabled line
  const lineBtns = page.locator('ul.divide-y li button:not([disabled])');
  console.log('enabled line buttons:', await lineBtns.count());
  await lineBtns.first().click();
  await page.waitForTimeout(1500);
  await snap(page, '05-line-screen');
  console.log('=== LINE SCREEN TEXT ===');
  console.log(await page.evaluate(() => document.querySelector('main')?.innerText?.slice(0, 1200) || document.body.innerText.slice(1200, 2600)));

  // STEP 3: weight-only pack via Enter (in-tolerance: leave qty blank)
  // First: try 0 weight
  await page.locator('#pick-actual-weight').fill('0');
  await page.locator('#pick-actual-weight').press('Enter');
  await page.waitForTimeout(800);
  console.log('ZERO WEIGHT error visible:', await page.locator('#pick-weight-error').textContent().catch(()=>null));
  await snap(page, '05-zero-weight');
  // Negative weight
  await page.locator('#pick-actual-weight').fill('-3');
  await page.locator('#pick-actual-weight').press('Enter');
  await page.waitForTimeout(800);
  console.log('NEG WEIGHT error visible:', await page.locator('#pick-weight-error').textContent().catch(()=>null));

  // Valid weight, Enter to pack, observe auto-advance
  const itemBefore = await page.locator('.text-2xl.font-bold').first().textContent().catch(()=>'?');
  console.log('item before pack:', itemBefore);
  await page.locator('#pick-actual-weight').fill('12.5');
  await page.locator('#pick-actual-weight').press('Enter');
  await page.waitForTimeout(2500);
  const itemAfter = await page.locator('.text-2xl.font-bold').first().textContent().catch(()=>'?');
  console.log('item after pack (auto-advance?):', itemAfter);
  console.log('TOASTS:', await readToasts(page));
  await snap(page, '05-after-first-pack');
  console.log('packCalls so far:', packCalls.length);

  // STEP 4: discrepancy — qty far from expected
  const expected = await page.locator('.text-4xl.font-bold').first().textContent().catch(()=>'?');
  console.log('expected qty on current line:', expected);
  await page.locator('#pick-actual-qty').fill(String(Math.max(1, Math.round(Number(expected||2)/2))));
  await page.locator('#pick-actual-weight').fill('9.9');
  await page.locator('#pick-actual-weight').press('Enter');
  await page.waitForTimeout(1200);
  const discVisible = await page.locator('#pick-discrepancy-note').isVisible().catch(()=>false);
  console.log('discrepancy prompt visible:', discVisible);
  await snap(page, '05-discrepancy-prompt');
  if (discVisible) {
    await page.locator('#pick-discrepancy-note').fill('Short by half — bin underweight (warehouse lane test)');
    await page.getByRole('button', { name: /Pack with note/ }).click();
    await page.waitForTimeout(2500);
    console.log('TOASTS after pack-with-note:', await readToasts(page));
    await snap(page, '05-after-pack-with-note');
  }
  const bodyNow = await page.evaluate(() => document.body.innerText.slice(1100, 2400));
  console.log('=== SCREEN NOW ===\n', bodyNow);
  console.log('packCalls total:', packCalls.length, JSON.stringify(packCalls));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
