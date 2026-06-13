// Step 18: allocate (manual + auto), observe, then unallocate to restore. Watch commands.
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, payload: JSON.stringify(pd.payload||{}).slice(0,200), ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,160})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('active-payment-1');
  await page.waitForTimeout(2000);
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await page.waitForTimeout(2000);

  const panelRoot = () => page.evaluate(() => {
    let nodes = [...document.querySelectorAll('div,section')].filter(e => /allocation\(s\)/.test(e.textContent || ''));
    let el = nodes[nodes.length - 1];
    while (el && !el.querySelector('select') && el.parentElement) el = el.parentElement;
    return (el.textContent||'').trim().replace(/\s+/g,' ').slice(0, 400);
  });
  console.log('panel before:', await panelRoot());

  // Manual: choose order INV-REAL-00005
  const orderSel = page.locator('select').filter({ hasText: 'Choose order' }).first();
  await orderSel.selectOption({ index: 1 });
  await page.waitForTimeout(1500);
  console.log('after choosing order:', await panelRoot());
  console.log('api so far:', JSON.stringify(api));
  await d.shot('18-order-chosen');

  // look for an allocate/apply button now enabled
  const enabledBtns = await page.evaluate(() => {
    let nodes = [...document.querySelectorAll('div,section')].filter(e => /allocation\(s\)/.test(e.textContent || ''));
    let el = nodes[nodes.length - 1];
    while (el && !el.querySelector('select') && el.parentElement) el = el.parentElement;
    return [...el.querySelectorAll('button')].map(b => ({ t: (b.textContent||'').trim().slice(0,40), disabled: b.disabled }));
  });
  console.log('panel buttons now:', JSON.stringify(enabledBtns));

  // Auto apply to oldest
  await page.getByRole('button', { name: /Auto apply to oldest/i }).first().click();
  await page.waitForTimeout(2500);
  console.log('after auto apply:', await panelRoot());
  console.log('api:', JSON.stringify(api, null, 1));
  await d.shot('18-after-auto-apply');

  // grid row unapplied cell now?
  const gridRow = await page.evaluate(() => (document.querySelector('.ag-center-cols-container .ag-row')?.textContent||'').replace(/\s+/g,' ').slice(0,200));
  console.log('grid row now:', gridRow);

  // Unallocate to restore: select the allocation then click Unallocate
  const allocSel = page.locator('select').filter({ hasText: /Choose/ }).first();
  const allocOpts = await allocSel.evaluate(s => [...s.options].map(o => o.text.slice(0,60)));
  console.log('allocation select options:', JSON.stringify(allocOpts));
  if (allocOpts.length > 1) {
    await allocSel.selectOption({ index: 1 });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Unallocate' }).click();
    await page.waitForTimeout(2500);
    console.log('after unallocate:', await panelRoot());
    console.log('api end:', JSON.stringify(api.slice(-2), null, 1));
  }
  await d.shot('18-after-unallocate');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
