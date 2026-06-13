// Step 2: examine the Money In quick ledger draft row area; click "Row" to add a draft
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  // Find the Money In section and its Row button
  const moneyIn = page.locator('section,div').filter({ has: page.getByRole('heading', { name: /Money In/i }) });
  // Just click the first "Row" button (under Money In per recon order)
  const rowBtns = page.getByRole('button', { name: 'Row', exact: true });
  console.log('Row buttons:', await rowBtns.count());
  await rowBtns.first().click();
  await page.waitForTimeout(1500);
  await d.shot('02-after-add-row');

  // Dump the first table's first data row inputs/selects
  const rowInfo = await page.evaluate(() => {
    const tbl = document.querySelector('table');
    if (!tbl) return 'no table';
    const rows = [...tbl.querySelectorAll('tbody tr')].slice(0, 3);
    return rows.map(tr => [...tr.querySelectorAll('td')].map(td => {
      const input = td.querySelector('input,select,textarea,button');
      const cellTxt = (td.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (input) {
        return {
          tag: input.tagName,
          type: input.type || '',
          ph: input.placeholder || '',
          val: (input.value !== undefined ? String(input.value) : '').slice(0, 30),
          aria: input.getAttribute('aria-label') || '',
          txt: cellTxt.slice(0, 25),
        };
      }
      return { txt: cellTxt };
    }));
  });
  console.log(JSON.stringify(rowInfo, null, 2));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
