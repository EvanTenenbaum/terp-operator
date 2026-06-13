// Mobile intake verify+flag; fulfillment CSV export; queue step counts
const { launch, snap, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:5173/mobile/intake');
  await page.waitForTimeout(2500);
  // Tap Flag discrepancy first (non-destructive-ish? it flags batch) — use Verify on the Ready one
  const flagBtn = page.getByRole('button', { name: 'Flag discrepancy' }).first();
  await flagBtn.click();
  await page.waitForTimeout(1200);
  await snap(page, '18-m-intake-flag');
  console.log('after flag tap:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 500));
  console.log('toasts:', await readToasts(page));
  // Verify
  const verifyBtn = page.getByRole('button', { name: 'Verify', exact: true }).first();
  if (await verifyBtn.count()) {
    await verifyBtn.click();
    await page.waitForTimeout(2000);
    console.log('after verify:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 500));
    console.log('toasts:', await readToasts(page));
    await snap(page, '18-m-intake-verified');
  }
  await done();

  // Desktop: fulfillment CSV export
  const { page: p2, done: done2 } = require('./wh-lib.cjs');
  const l2 = await require('./wh-lib.cjs').launch();
  await l2.page.goto('http://localhost:5173/fulfillment');
  await l2.page.waitForTimeout(2500);
  const dl = l2.page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await l2.page.getByRole('button', { name: 'Export visible grid CSV' }).first().click();
  const d = await dl;
  console.log('CSV download:', d ? d.suggestedFilename() : 'NO DOWNLOAD EVENT');
  if (d) { await d.saveAs('/Users/evan/work/terp-agro-operator-console/.ux-review-scratch/warehouse-export.csv'); }
  console.log('toasts:', await require('./wh-lib.cjs').readToasts(l2.page));
  await l2.done();
})().catch(e => { console.error(e); process.exit(1); });
