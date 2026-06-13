// Step 7: full payload dump; try explicitly re-typing date; check Quick actions for a payment workflow
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  let fullPost = '';
  page.on('request', r => { if (r.url().includes('commands.run')) fullPost = r.postData() || ''; });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  const row = page.locator('table').first().locator('tbody tr').first();
  // Explicitly retype the date
  await row.getByLabel('Date').fill('2026-06-12');
  await row.getByLabel('Entity id').selectOption({ label: 'Moss Landing Co-op' });
  await row.getByLabel('Amount').fill('142.33');
  await page.waitForTimeout(1000);
  await row.getByRole('button', { name: 'Record payment' }).click();
  await page.waitForTimeout(2500);
  console.log('FULL POST PAYLOAD:', fullPost.slice(0, 1500));
  const trace = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')).slice(14, 18));
  console.log('row trace/status after:', JSON.stringify(trace));

  // Quick actions menu
  await page.getByRole('button', { name: 'Quick actions' }).click();
  await page.waitForTimeout(800);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role=menu] *,[role=menuitem],[role=dialog] button')].map(e => (e.textContent||'').trim().replace(/\s+/g,' ').slice(0,60)).filter((t,i,a) => t && a.indexOf(t) === i).slice(0, 30));
  console.log('Quick actions menu:', JSON.stringify(menu));
  await d.shot('07-quick-actions');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
