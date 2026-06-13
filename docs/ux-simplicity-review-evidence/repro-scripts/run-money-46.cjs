// Step 46: manager@ gating spot-check on /payments
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('manager@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  await d.shot('46-manager-payments');
  const info = await page.evaluate(() => ({
    whoami: (document.body.innerText.match(/Sign out\s*([\s\S]{0,30})/)||['?'])[0].replace(/\s+/g,' ').slice(0,60),
    hasRowBtn: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Row'),
    hasRecordPayment: [...document.querySelectorAll('button')].filter(b => /Record payment/.test(b.textContent)).length,
    hasTypes: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Types'),
    presets: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /^(Unpaid|Overdue|Unapplied)/.test(t)),
  }));
  console.log('manager payments:', JSON.stringify(info, null, 1));

  // can manager post money-out?
  await page.getByRole('button', { name: 'Paying' }).click().catch(()=>{});
  await page.waitForTimeout(1000);
  const btn = page.getByRole('button', { name: 'Row', exact: true });
  console.log('Row buttons for manager:', await btn.count());
  if (await btn.count()) {
    await btn.nth(await btn.count() > 1 ? 1 : 0).click();
    await page.waitForTimeout(900);
    const row = page.locator('table').nth(1).locator('tbody tr').first();
    const hasCommit = await row.getByRole('button', { name: /Record/ }).count();
    console.log('manager sees Record button on draft row:', hasCommit);
  }
  // allocations panel + finder selection
  const filterBox = page.locator('input[placeholder*="filter" i]');
  await filterBox.first().fill('active-payment-1');
  await page.waitForTimeout(1500);
  await page.locator('.ag-center-cols-container .ag-row').first().click();
  await page.waitForTimeout(1500);
  const panelBtns = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Unallocate|Apply Discount/.test(b.textContent)).map(b => ({ t: b.textContent.trim(), d: b.disabled })));
  console.log('manager panel buttons:', JSON.stringify(panelBtns));
  // context menu items
  await page.locator('.ag-center-cols-container .ag-row').first().click({ button: 'right' });
  await page.waitForTimeout(800);
  console.log('manager ctx menu:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].map(e => e.textContent.trim()))));
  await d.shot('46-manager-panel');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
