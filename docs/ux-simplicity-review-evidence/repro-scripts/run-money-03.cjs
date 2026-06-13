// Step 3: fill draft row: customer, amount; check preview cell + negative amount behavior
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  // count draft rows currently in money-in ledger
  const draftCountBefore = await page.evaluate(() => {
    const tbl = document.querySelector('table');
    return [...tbl.querySelectorAll('tbody tr')].filter(tr => /Draft/.test(tr.textContent)).length;
  });
  console.log('draft rows in first table (visible):', draftCountBefore);

  await page.getByRole('button', { name: 'Row', exact: true }).first().click();
  await page.waitForTimeout(1000);

  const row = page.locator('table').first().locator('tbody tr').first();
  // entity options
  const opts = await row.getByLabel('Entity id').evaluate(s => [...s.options].map(o => ({ v: o.value, t: o.text })).slice(0, 15));
  console.log('entity opts sample:', JSON.stringify(opts));
  // pick a customer
  await row.getByLabel('Entity id').selectOption({ index: 1 });
  await page.waitForTimeout(800);

  // transaction type options
  const txOpts = await row.getByLabel('Transaction type').evaluate(s => [...s.options].map(o => ({ v: o.value, t: o.text })));
  console.log('tx type opts:', JSON.stringify(txOpts));
  // allocation options
  const allocOpts = await row.getByLabel('Allocation target type').evaluate(s => [...s.options].map(o => ({ v: o.value, t: o.text })).slice(0, 12));
  console.log('alloc opts:', JSON.stringify(allocOpts));

  // Enter a positive amount and observe preview/trace cell
  await row.getByLabel('Amount').fill('125');
  await page.waitForTimeout(1500);
  const rowText = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,60)));
  console.log('ROW after +125:', JSON.stringify(rowText, null, 1));
  await d.shot('03-draft-positive-125');

  // Negative amount: does label flip to buyer credit?
  await row.getByLabel('Amount').fill('-125');
  await page.waitForTimeout(1500);
  const rowTextNeg = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,60)));
  console.log('ROW after -125:', JSON.stringify(rowTextNeg, null, 1));
  const txValNeg = await row.getByLabel('Transaction type').inputValue();
  console.log('tx type value after negative:', txValNeg);
  await d.shot('03-draft-negative-125');

  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
