// Complete order on PICK-REAL-00007; discrepancy + double-enter + hold on PICK-REAL-00004
const { launch, snap, aria, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  const packCalls = [];
  page.on('request', r => { if (r.method() === 'POST' && (r.postData()||'').includes('recordWeighAndPack')) packCalls.push(Date.now()); });
  await page.goto('http://localhost:5173/pick');
  await page.waitForTimeout(2500);

  // A) Complete PICK-REAL-00007
  const q7 = page.locator('button', { hasText: 'PICK-REAL-00007' });
  if (await q7.count()) {
    await q7.first().click();
    await page.waitForTimeout(2000);
    await snap(page, '06-list-all-packed');
    console.log('LIST TEXT:', await page.evaluate(() => document.body.innerText.slice(1100, 1900)));
    const completeBtn = page.getByRole('button', { name: /Complete Order/i });
    console.log('Complete Order visible:', await completeBtn.isVisible().catch(()=>false));
    if (await completeBtn.isVisible().catch(()=>false)) {
      await completeBtn.click();
      await page.waitForTimeout(3000);
      console.log('after complete URL/screen:', page.url());
      console.log('TOASTS:', await readToasts(page));
      await snap(page, '06-after-complete');
      console.log('PICK-REAL-00007 still in queue?', await page.locator('button', { hasText: 'PICK-REAL-00007' }).count());
    }
  } else {
    console.log('PICK-REAL-00007 not in queue (already fulfilled?)');
  }

  // B) PICK-REAL-00004: discrepancy prompt + double-enter
  await page.locator('button', { hasText: 'PICK-REAL-00004' }).first().click();
  await page.waitForTimeout(2000);
  const lineBtns = page.locator('ul.divide-y li button:not([disabled])');
  console.log('lines on 00004:', await lineBtns.count());
  await lineBtns.first().click();
  await page.waitForTimeout(1500);
  const expected = await page.locator('.text-4xl.font-bold').first().textContent();
  console.log('expected:', expected);
  // qty far off: 25% of expected
  const qty = (Number(expected) * 0.25).toFixed(2);
  await page.locator('#pick-actual-qty').fill(qty);
  await page.locator('#pick-actual-weight').fill('7.7');
  const before = packCalls.length;
  // double Enter fast
  await page.locator('#pick-actual-weight').press('Enter');
  await page.locator('#pick-actual-weight').press('Enter');
  await page.waitForTimeout(1500);
  const discVisible = await page.locator('#pick-discrepancy-note').isVisible().catch(()=>false);
  console.log('discrepancy prompt visible:', discVisible, '| packCalls delta after double-enter:', packCalls.length - before);
  await snap(page, '06-discrepancy-prompt');
  if (discVisible) {
    await page.locator('#pick-discrepancy-note').fill('Short pick - warehouse lane QA note');
    // double-click Pack with note fast to test double-submit
    const pwn = page.getByRole('button', { name: /Pack with note/ });
    await pwn.click();
    await page.waitForTimeout(2500);
    console.log('packCalls after pack-with-note:', packCalls.length - before);
    console.log('TOASTS:', await readToasts(page));
    await snap(page, '06-after-pack-with-note');
  }

  // C) Hold path on next line
  const onLine = await page.locator('#pick-actual-weight').isVisible().catch(()=>false);
  console.log('on line screen for hold test:', onLine);
  if (onLine) {
    await page.getByRole('button', { name: 'Hold', exact: true }).click();
    await page.waitForTimeout(600);
    await page.locator('#pick-hold-reason').fill('Damaged bag — hold for QA (warehouse lane)');
    await snap(page, '06-hold-form');
    await page.getByRole('button', { name: 'Confirm hold' }).click();
    await page.waitForTimeout(2500);
    console.log('TOASTS after hold:', await readToasts(page));
    console.log('SCREEN after hold:', await page.evaluate(() => document.body.innerText.slice(1100, 2100)));
    await snap(page, '06-after-hold');
  }
  await done();
})().catch(e => { console.error(e); process.exit(1); });
