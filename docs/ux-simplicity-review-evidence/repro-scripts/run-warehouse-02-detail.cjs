// Robust row click + filter verification
const { launch, snap, aria, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(2500);

  // Check if filter buttons change visible row set (not just header count)
  const firstRows = async () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0, 5);
    return rows.map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 80));
  });
  console.log('BASE rows:', await firstRows());
  await page.getByRole('button', { name: 'Has alerts', exact: true }).click();
  await page.waitForTimeout(1500);
  console.log('HAS-ALERTS pressed?', await page.getByRole('button', { name: 'Has alerts', exact: true }).getAttribute('aria-pressed'));
  console.log('HAS-ALERTS rows:', await firstRows());
  const cnt = await page.evaluate(() => document.querySelectorAll('.ag-center-cols-container .ag-row').length);
  console.log('HAS-ALERTS dom row count:', cnt);
  await snap(page, '02-has-alerts');
  await page.getByRole('button', { name: 'Has alerts', exact: true }).click();
  await page.waitForTimeout(1000);

  // Robust click on PICK-ACTIVE-001 via bounding box
  const cell = page.locator('.ag-cell[col-id="pickNo"]', { hasText: 'PICK-ACTIVE-001' }).first();
  const box = await cell.boundingBox();
  console.log('cell box:', box);
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(2500);
  await snap(page, '02-detail-pick-active-001');
  console.log('URL after click:', page.url());
  console.log('=== MAIN ARIA after row click ===');
  const a = await aria(page, 'main');
  // print only after the treegrid part to keep it short: find detail section
  console.log(a.slice(a.indexOf('Select a pick row') >= 0 ? 0 : 0));
  console.log('TOASTS:', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
