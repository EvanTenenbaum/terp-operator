// Step 27: Receipt + Linked Orders tabs; then History/reverse on my own payout
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('SO-REAL-00444');
  await page.waitForTimeout(1500);
  const row = page.locator('.ag-center-cols-container .ag-row').first();
  await row.click({ button: 'right' });
  await page.waitForTimeout(1000);
  await page.getByText('History', { exact: true }).last().click();
  await page.waitForTimeout(1500);

  const dlg = () => page.locator('[role=dialog]').last();
  // Receipt tab
  await dlg().getByRole('tab', { name: 'Receipt' }).or(dlg().getByRole('button', { name: 'Receipt' })).first().click();
  await page.waitForTimeout(2000);
  console.log('RECEIPT:', await dlg().evaluate(x => (x.textContent||'').trim().replace(/\s+/g,' ').slice(0,700)));
  await d.shot('27-receipt-tab');

  // Linked Orders tab
  await dlg().getByRole('tab', { name: 'Linked Orders' }).or(dlg().getByRole('button', { name: 'Linked Orders' })).first().click();
  await page.waitForTimeout(2000);
  console.log('LINKED ORDERS:', await dlg().evaluate(x => (x.textContent||'').trim().replace(/\s+/g,' ').slice(0,700)));
  const links = await dlg().evaluate(x => [...x.querySelectorAll('a,button')].map(b => (b.textContent||'').trim()).filter(t => /INV|SO-|Order/i.test(t)).slice(0,10));
  console.log('cross-links:', JSON.stringify(links));
  await d.shot('27-linked-orders-tab');
  // click first cross-link if any
  if (links.length) {
    await dlg().locator('a,button').filter({ hasText: links[0] }).first().click();
    await page.waitForTimeout(2500);
    console.log('after cross-link url:', page.url());
    await d.shot('27-after-crosslink');
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
