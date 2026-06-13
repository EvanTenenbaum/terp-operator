// Step 11: try each receiving transaction type to map which fail
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      api.push({ name: JSON.parse(r.request().postData()||'{}')['0']?.json?.name, tx: JSON.parse(r.request().postData()||'{}')['0']?.json?.payload?.transactionType, ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,120})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  const types = ['check_payment_in', 'crypto_payment_in'];
  for (const t of types) {
    await page.getByRole('button', { name: 'Row', exact: true }).first().click();
    await page.waitForTimeout(1000);
    const row = page.locator('table').first().locator('tbody tr').first();
    await row.getByLabel('Entity id').selectOption({ label: 'Moss Landing Co-op' });
    await row.getByLabel('Transaction type').selectOption(t);
    await page.waitForTimeout(500);
    await row.getByLabel('Amount', { exact: true }).fill('33.33');
    await row.getByLabel('Notes').fill('money-lane QA type test ' + t);
    await page.waitForTimeout(1000);
    await row.getByRole('button', { name: /Record/ }).click();
    await page.waitForTimeout(2500);
    const status = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')).slice(15,17));
    console.log(t, '=> row status:', JSON.stringify(status));
  }
  console.log('exchanges:', JSON.stringify(api, null, 1));
  await d.shot('11-type-matrix');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
