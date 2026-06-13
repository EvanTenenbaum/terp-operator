// Reports v2: re-goto /reports before each chip (Client Balances chip navigates away).
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  const chips = ['Payables Due', 'Inventory Aging', 'Category Performance', 'Cash Movement', 'Vendor Performance', 'Client Sales History', 'Closeout Period'];
  let n = 1;
  for (const c of chips) {
    await page.goto('http://localhost:5173/reports');
    await page.waitForTimeout(1800);
    const t0 = Date.now();
    const btn = page.getByRole('button', { name: c, exact: true }).first();
    if (!(await btn.count())) { console.log('NO CHIP', c); continue; }
    await btn.click({ timeout: 8000 }).catch(e => console.log('CLICK FAIL', c, String(e).slice(0, 120)));
    await page.waitForTimeout(2500);
    console.log(`CHIP ${c}: url after = ${page.url()}`);
    const txt = await page.locator('body').innerText().catch(() => '');
    // trim nav prefix
    const i = txt.indexOf('Evan Owner');
    console.log(`\n===== REPORT ${c} =====\n${txt.slice(i, i + 4000)}\n===== END ${c} =====`);
    await d.shot(`01b-report-${String(n).padStart(2, '0')}-${c.toLowerCase().replace(/[^a-z]+/g, '-')}`);
    n++;
  }
  // Revenue summary row-click probe
  await page.goto('http://localhost:5173/reports');
  await page.waitForTimeout(1800);
  const row = page.locator('table tbody tr').first();
  if (await row.count()) {
    await row.click({ timeout: 8000 }).catch(e => console.log('row click fail', String(e).slice(0,120)));
    await page.waitForTimeout(1800);
    console.log('AFTER REVENUE ROW CLICK URL:', page.url());
    await d.shot('01b-report-rowclick');
  }
  // Export CSV buttons probe (top-level Export CSV + per-report)
  await page.goto('http://localhost:5173/reports');
  await page.waitForTimeout(1800);
  const dl = page.waitForEvent('download', { timeout: 6000 }).catch(() => null);
  await page.getByRole('button', { name: 'Export CSV' }).first().click({ timeout: 5000 }).catch(e => console.log('export click fail', String(e).slice(0,100)));
  const got = await dl;
  console.log('Export CSV produced download?', got ? got.suggestedFilename() : 'NO DOWNLOAD EVENT');
  await d.shot('01b-report-export');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
