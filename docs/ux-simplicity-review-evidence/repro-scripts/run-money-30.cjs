// Step 30: vendor page panels (prepayment/consignment), then History+reverse on MY payout
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, payload: JSON.stringify(pd.payload||{}).slice(0,200), ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,250})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/vendors');
  await page.waitForTimeout(3500);

  // page section overview
  const sections = await page.evaluate(() => [...document.querySelectorAll('h2,h3,h4')].map(h => h.textContent.trim().replace(/\s+/g,' ')).slice(0,25));
  console.log('sections:', JSON.stringify(sections));
  const hasPrepay = await page.evaluate(() => /prepay/i.test(document.body.innerText));
  const hasConsign = await page.evaluate(() => /consign/i.test(document.body.innerText));
  console.log('mentions prepay:', hasPrepay, 'consign:', hasConsign);

  // due-reason variety
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('consignment');
  await page.waitForTimeout(1500);
  const consignRows = await page.evaluate(() => [...document.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0,5).map(r => r.textContent.replace(/\s+/g,' ').slice(0,160)));
  console.log('consignment rows:', JSON.stringify(consignRows, null, 1));
  await d.shot('30-consignment-filter');

  // my payout: History + reverse
  await filterBox.first().fill('money-lane QA payout 1');
  await page.waitForTimeout(1500);
  const row = page.locator('.ag-center-cols-container .ag-row').first();
  console.log('my payout found:', await row.count(), await row.evaluate(r => r.textContent.replace(/\s+/g,' ').slice(0,120)).catch(()=>''));
  await row.click({ button: 'right' });
  await page.waitForTimeout(1000);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].map(e => e.textContent.trim()));
  console.log('ctx menu:', JSON.stringify(menu));
  await page.getByText('History', { exact: true }).last().click();
  await page.waitForTimeout(2000);
  const dlg = page.locator('[role=dialog]').last();
  console.log('HISTORY:', await dlg.evaluate(x => (x.textContent||'').trim().replace(/\s+/g,' ').slice(0,800)));
  await d.shot('30-payout-history');
  const histButtons = await dlg.evaluate(x => [...x.querySelectorAll('button')].map(b => ({ t: (b.textContent||'').trim().slice(0,40), d: b.disabled })).filter(b => b.t));
  console.log('history buttons:', JSON.stringify(histButtons));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
