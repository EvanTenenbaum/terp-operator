// Step 8: did anything post? Check payments grid for our notes; check row states; try posting again and watch result body
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      api.push({ post: (r.request().postData()||'').slice(0,300), body: body.slice(0, 600) });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  // search entire page for our QA notes
  const found = await page.evaluate(() => {
    const hits = [];
    for (const tr of document.querySelectorAll('table tbody tr')) {
      if (/money-lane QA/.test(tr.textContent)) {
        hits.push([...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,50)));
      }
    }
    return hits;
  });
  console.log('rows mentioning money-lane QA:', JSON.stringify(found, null, 1));

  // first table first row state
  const row = page.locator('table').first().locator('tbody tr').first();
  const state = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,70)));
  console.log('first row now:', JSON.stringify(state, null, 1));

  // try posting again
  const amtVal = await row.getByLabel('Amount').inputValue().catch(() => 'no-input');
  console.log('amount input value:', amtVal);
  if (amtVal !== 'no-input') {
    if (!amtVal) await row.getByLabel('Amount').fill('142.33');
    const ent = await row.getByLabel('Entity id').inputValue();
    if (!ent) await row.getByLabel('Entity id').selectOption({ label: 'Moss Landing Co-op' });
    await page.waitForTimeout(800);
    await row.getByRole('button', { name: 'Record payment' }).click();
    await page.waitForTimeout(3500);
    console.log('command exchanges:', JSON.stringify(api, null, 1));
    const state2 = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,90)).slice(14,18));
    console.log('first row after repost:', JSON.stringify(state2));
  }
  await d.shot('08-repost');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
