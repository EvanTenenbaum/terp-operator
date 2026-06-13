// Step 23: state of INV-REAL-00444 payment + re-allocation attempt via Order select
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
  await filterBox.first().fill('SO-REAL-00444');
  await page.waitForTimeout(2000);
  const rows = page.locator('.ag-center-cols-container .ag-row');
  console.log('rows:', await rows.count());
  if (!await rows.count()) {
    // payment trace may have changed after unallocation; search by amount
    await filterBox.first().fill('2946.96');
    await page.waitForTimeout(2000);
    console.log('rows by amount:', await rows.count());
  }
  console.log('row text:', await rows.first().evaluate(r => r.textContent.replace(/\s+/g,' ').slice(0,200)).catch(()=>'none'));
  await rows.first().click();
  await page.waitForTimeout(2000);
  const panelText = () => page.evaluate(() => (document.body.innerText.match(/Payment allocations[\s\S]{0,160}/)||['?'])[0].split('\n').slice(0,6).join(' | '));
  console.log('panel:', await panelText());
  await d.shot('23-state');

  // status bar "Unapplied $..." value
  const statusBar = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => e.children.length < 8 && /Selected .*Unapplied \$/.test(e.textContent||'') && e.textContent.length < 200);
    return el ? el.textContent.trim().replace(/\s+/g,' ') : 'not found';
  });
  console.log('status bar:', statusBar);

  // order select re-allocate attempt
  const ordIdx = await page.evaluate(() => [...document.querySelectorAll('select')].findIndex(s => s.options[0] && s.options[0].text === 'Choose order'));
  console.log('ordIdx:', ordIdx);
  if (ordIdx >= 0) {
    const ord = page.locator('select').nth(ordIdx);
    const optIdx = await ord.evaluate(s => [...s.options].findIndex(o => /INV-REAL-00444/.test(o.text)));
    console.log('00444 in order list at:', optIdx);
    await ord.selectOption({ index: optIdx > 0 ? optIdx : 1 });
    await page.waitForTimeout(1500);
    console.log('api after order pick:', JSON.stringify(api));
    const btns2 = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /llocat|Apply/i.test(b.textContent)).map(b => ({ t: b.textContent.trim().slice(0,30), d: b.disabled })));
    console.log('action buttons:', JSON.stringify(btns2));
    console.log('panel now:', await panelText());
    await d.shot('23-order-picked');
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
