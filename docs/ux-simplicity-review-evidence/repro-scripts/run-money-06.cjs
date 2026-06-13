// Step 6: repost first row, capture ALL non-GET network; then try the standalone "Record payment" workflow button
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    const req = r.request();
    if (req.method() !== 'GET') {
      let body = '';
      try { body = (await r.text()).slice(0, 800); } catch {}
      let post = '';
      try { post = (req.postData() || '').slice(0, 500); } catch {}
      api.push({ m: req.method(), url: r.url().slice(0, 160), status: r.status(), post, body });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  const row = page.locator('table').first().locator('tbody tr').first();
  const cellsBefore = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,60)));
  console.log('first row before:', JSON.stringify(cellsBefore.slice(14, 18)));
  // ensure amount + entity set
  await row.getByLabel('Entity id').selectOption({ label: 'Moss Landing Co-op' });
  await row.getByLabel('Amount').fill('142.33');
  await page.waitForTimeout(1200);
  api.length = 0;
  await row.getByRole('button', { name: 'Record payment' }).click();
  await page.waitForTimeout(3000);
  console.log('API on row post:', JSON.stringify(api, null, 1).slice(0, 3000));

  await d.shot('06-row-post-retry');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
