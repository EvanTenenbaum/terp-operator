// Reports: open every report chip, dump content, screenshot, probe interactions.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/reports');
  await page.waitForTimeout(2000);
  const chips = ['Revenue Summary', 'Payables Due', 'Client Balances', 'Inventory Aging', 'Category Performance', 'Cash Movement', 'Vendor Performance', 'Client Sales History', 'Closeout Period'];
  let n = 1;
  for (const c of chips) {
    const t0 = Date.now();
    await page.getByRole('button', { name: c, exact: true }).first().click().catch(async e => {
      console.log('CHIP CLICK FAIL', c, String(e).slice(0, 150));
      // try generic text click
      await page.getByText(c, { exact: true }).first().click().catch(e2 => console.log('TEXT CLICK FAIL', c));
    });
    await page.waitForTimeout(2500);
    console.log(`CHIP ${c}: clicked, settle ${Date.now() - t0}ms`);
    const main = page.locator('main').first();
    const txt = await (await main.count() ? main : page.locator('body')).innerText().catch(() => '');
    console.log(`\n===== REPORT ${c} =====\n${txt.slice(0, 4500)}\n===== END ${c} =====`);
    await d.shot(`01-report-${String(n).padStart(2, '0')}-${c.toLowerCase().replace(/[^a-z]+/g, '-')}`);
    n++;
  }
  // Probe: row click on revenue summary navigates to sales?
  await page.getByRole('button', { name: 'Revenue Summary', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const row = page.locator('table tbody tr').first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(1500);
    console.log('AFTER ROW CLICK URL:', page.url());
    await d.shot('01-report-rowclick');
    await page.goBack(); await page.waitForTimeout(1200);
  }
  // KPI hover/tooltips: look for title attrs / info icons
  const infoCount = await page.locator('[title], [aria-label*="info" i], svg.lucide-info').count();
  console.log('elements with title/info on reports page:', infoCount);
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
