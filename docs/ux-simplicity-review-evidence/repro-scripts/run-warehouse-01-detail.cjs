// Click a pick row with open lines, inspect detail panel; presets toggle
const { launch, snap, aria, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(2500);

  // Test preset toggles first
  for (const preset of ['Fulfilled', 'Open picks']) {
    await page.getByRole('button', { name: preset, exact: true }).click();
    await page.waitForTimeout(1500);
    const hdr = await page.getByRole('button', { name: /Fulfillment \d+ row/ }).textContent().catch(()=>'?');
    console.log(`PRESET ${preset}:`, hdr);
  }
  await snap(page, '01-preset-fulfilled-back-open');

  // Test alert-filter buttons
  for (const f of ['Needs picking', 'In progress', 'Has alerts', 'Ready to close']) {
    await page.getByRole('button', { name: f, exact: true }).click();
    await page.waitForTimeout(1200);
    const hdr = await page.getByRole('button', { name: /Fulfillment \d+ row/ }).textContent().catch(()=>'?');
    console.log(`FILTER ${f}:`, hdr, '| chips:', await page.locator('button:has-text("Remove")').allTextContents().catch(()=>[]));
    await page.getByRole('button', { name: f, exact: true }).click(); // toggle off
    await page.waitForTimeout(800);
  }
  await snap(page, '01-filters-cycled');

  // Click PICK-ACTIVE-001 (2 lines)
  await page.getByText('PICK-ACTIVE-001', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await snap(page, '01-detail-pick-active-001');
  console.log('=== DETAIL ARIA ===');
  console.log(await aria(page, 'main'));
  console.log('TOASTS:', await readToasts(page));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
