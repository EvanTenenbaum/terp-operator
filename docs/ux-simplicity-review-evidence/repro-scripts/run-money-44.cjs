// Step 44: random-walk: zero amount, huge amount, bucket switch, keyboard-only entry
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, amt: pd.payload?.amount, ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,200})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Paying' }).click();
  await page.waitForTimeout(1000);

  const addRow = async () => {
    const btn = page.getByRole('button', { name: 'Row', exact: true });
    await btn.nth(await btn.count() > 1 ? 1 : 0).click();
    await page.waitForTimeout(900);
    return page.locator('table').nth(1).locator('tbody tr').first();
  };

  // A) zero amount
  let row = await addRow();
  await row.getByLabel('Entity type').selectOption('vendor');
  await page.waitForTimeout(600);
  await row.getByLabel('Entity id').selectOption({ label: 'Vista Verde' });
  await row.getByLabel('Amount', { exact: true }).fill('0');
  await page.waitForTimeout(800);
  const zeroTrace = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')).slice(14,18));
  console.log('zero amount trace/status:', JSON.stringify(zeroTrace));
  await row.getByRole('button', { name: /Record/ }).click();
  await page.waitForTimeout(2200);
  console.log('zero amount api:', JSON.stringify(api));
  const zeroAfter = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')).slice(14,18));
  console.log('zero amount after:', JSON.stringify(zeroAfter));
  await d.shot('44-zero-amount');

  // B) huge amount on same draft row
  api.length = 0;
  await row.getByLabel('Amount', { exact: true }).fill('99999999');
  await page.waitForTimeout(1000);
  console.log('huge preview:', JSON.stringify(await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')).slice(14,16))));
  await row.getByLabel('Notes').fill('money-lane QA huge payout');
  await row.getByRole('button', { name: /Record/ }).click();
  await page.waitForTimeout(2500);
  console.log('huge api:', JSON.stringify(api));
  await d.shot('44-huge-amount');

  // C) bucket switch mid-entry on a fresh row
  row = await addRow();
  await row.getByLabel('Entity type').selectOption('vendor');
  await page.waitForTimeout(500);
  await row.getByLabel('Entity id').selectOption({ label: 'Vista Verde' });
  await row.getByLabel('Amount', { exact: true }).fill('55.55');
  await row.getByLabel('Bucket').selectOption({ index: 2 });
  const amtAfterBucket = await row.getByLabel('Amount', { exact: true }).inputValue();
  await row.getByLabel('Transaction type').selectOption({ index: 0 });
  const amtAfterTx = await row.getByLabel('Amount', { exact: true }).inputValue();
  const bucketAfterTx = await row.getByLabel('Bucket').inputValue();
  console.log('amount after bucket switch:', amtAfterBucket, '| after tx switch:', amtAfterTx, '| bucket kept:', bucketAfterTx);
  await d.shot('44-bucket-switch');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
