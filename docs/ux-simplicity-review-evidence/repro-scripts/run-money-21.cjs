// Step 21: unallocate/reallocate cycle on a posted allocated payment (Cobalt, INV-REAL-00444)
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, payload: JSON.stringify(pd.payload||{}).slice(0,220), ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,200})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('INV-REAL-00444');
  await page.waitForTimeout(2000);
  const rows = page.locator('.ag-center-cols-container .ag-row');
  console.log('rows for INV-REAL-00444:', await rows.count());
  const rowTxt = await rows.first().evaluate(r => r.textContent.replace(/\s+/g,' ').slice(0,200));
  console.log('row:', rowTxt);
  await rows.first().click();
  await page.waitForTimeout(2000);

  const panelText = () => page.evaluate(() => (document.body.innerText.match(/Payment allocations[\s\S]{0,250}/)||['?'])[0].replace(/\n/g,' | '));
  console.log('panel:', await panelText());
  await d.shot('21-alloc-selected-payment');

  // Allocation select = first select inside panel region; get its options
  const allocSelInfo = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('select')];
    // panel selects come after quick-ledger ones; find select with option text containing "INV-" AND sibling label Allocation
    const labeled = sels.map((s, i) => ({ i, opts: [...s.options].map(o => o.text.slice(0,60)) }));
    return labeled.filter(x => x.opts[0] === 'Choose' || x.opts[0] === 'Choose order');
  });
  console.log('candidate panel selects:', JSON.stringify(allocSelInfo, null, 1));

  // select the allocation
  const allocSel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Choose' }) });
  // use evaluate to find the alloc select index with options length>1 and first option exactly Choose
  const idx = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('select')];
    return sels.findIndex(s => s.options[0] && s.options[0].text === 'Choose' && s.options.length > 1 && /INV-|→|\$/.test(s.options[1].text));
  });
  console.log('alloc select index:', idx);
  if (idx >= 0) {
    const sel = page.locator('select').nth(idx);
    const opts = await sel.evaluate(s => [...s.options].map(o => o.text.slice(0,80)));
    console.log('alloc options:', JSON.stringify(opts));
    await sel.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Unallocate|Apply Discount/.test(b.textContent)).map(b => ({ t: b.textContent.trim(), disabled: b.disabled })));
    console.log('action buttons:', JSON.stringify(btns));
    await d.shot('21-allocation-chosen');

    // Unallocate
    await page.getByRole('button', { name: 'Unallocate' }).click();
    await page.waitForTimeout(2500);
    console.log('api:', JSON.stringify(api, null, 1));
    console.log('panel after unallocate:', await panelText());
    const gridRow = await page.evaluate(() => (document.querySelector('.ag-center-cols-container .ag-row')?.textContent||'').replace(/\s+/g,' ').slice(0,200));
    console.log('grid row after unallocate:', gridRow);
    await d.shot('21-after-unallocate');
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
