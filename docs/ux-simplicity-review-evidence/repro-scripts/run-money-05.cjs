// Step 5: fresh row -> fill -> post; capture API requests/responses + any error UI
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.request().method() !== 'GET' && r.url().includes('localhost:8787')) {
      let body = '';
      try { body = (await r.text()).slice(0, 500); } catch {}
      api.push({ m: r.request().method(), url: r.url().slice(22, 140), status: r.status(), body });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  await page.getByRole('button', { name: 'Row', exact: true }).first().click();
  await page.waitForTimeout(1200);
  const row = page.locator('table').first().locator('tbody tr').first();
  await row.getByLabel('Entity id').selectOption({ label: 'Moss Landing Co-op' });
  await page.waitForTimeout(600);
  await row.getByLabel('Amount').fill('142.33');
  await row.getByLabel('Notes').fill('money-lane QA payment 2');
  await page.waitForTimeout(1500);
  await row.getByRole('button', { name: 'Record payment' }).click();
  await page.waitForTimeout(3000);
  await d.shot('05-after-post-fresh');

  // status cell + trace of first row
  const cells = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,200)));
  console.log('ROW after post:', JSON.stringify(cells, null, 1));
  console.log('API CALLS:', JSON.stringify(api, null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
