// Step 22: unallocate + attempt re-allocate (lean logging)
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, payload: JSON.stringify(pd.payload||{}).slice(0,200), ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,200})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('INV-REAL-00444');
  await page.waitForTimeout(2000);
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await page.waitForTimeout(2000);

  const panelText = () => page.evaluate(() => (document.body.innerText.match(/Payment allocations[\s\S]{0,200}/)||['?'])[0].split('\n').slice(0,8).join(' | '));

  const allocIdx = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('select')];
    return sels.findIndex(s => s.options[0] && s.options[0].text === 'Choose' && s.options.length > 1 && /INV-/.test(s.options[1].text) && s.options.length < 10);
  });
  console.log('allocIdx:', allocIdx);
  if (allocIdx < 0) { console.log('no allocation select with INV options'); await d.finish(); return; }
  const sel = page.locator('select').nth(allocIdx);
  console.log('alloc opts:', JSON.stringify(await sel.evaluate(s => [...s.options].map(o => o.text))));
  await sel.selectOption({ index: 1 });
  await page.waitForTimeout(800);
  const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Unallocate|Apply Discount/.test(b.textContent)).map(b => ({ t: b.textContent.trim(), disabled: b.disabled })));
  console.log('buttons after select:', JSON.stringify(btns));
  await d.shot('22-allocation-selected');

  await page.getByRole('button', { name: 'Unallocate' }).click();
  await page.waitForTimeout(2500);
  console.log('api after unallocate:', JSON.stringify(api, null, 1));
  console.log('panel:', await panelText());
  console.log('grid row:', await page.evaluate(() => (document.querySelector('.ag-center-cols-container .ag-row')?.textContent||'').replace(/\s+/g,' ').slice(0,180)));
  await d.shot('22-after-unallocate');

  // Re-allocate attempt: Order select (first option 'Choose order'), pick INV-REAL-00444 if present
  api.length = 0;
  const ordIdx = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('select')];
    return sels.findIndex(s => s.options[0] && s.options[0].text === 'Choose order');
  });
  console.log('ordIdx:', ordIdx);
  const ord = page.locator('select').nth(ordIdx);
  const hasTarget = await ord.evaluate(s => [...s.options].findIndex(o => o.text.includes('INV-REAL-00444')));
  console.log('INV-REAL-00444 option index in order select:', hasTarget);
  if (hasTarget > 0) {
    await ord.selectOption({ index: hasTarget });
  } else {
    await ord.selectOption({ index: 1 });
  }
  await page.waitForTimeout(1500);
  console.log('api after order select:', JSON.stringify(api, null, 1));
  console.log('panel:', await panelText());
  // any new enabled buttons?
  const btns2 = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /llocat|Apply|Save/.test(b.textContent) && !b.disabled).map(b => b.textContent.trim().slice(0,40)));
  console.log('enabled action-ish buttons:', JSON.stringify(btns2));
  await d.shot('22-reallocate-attempt');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
