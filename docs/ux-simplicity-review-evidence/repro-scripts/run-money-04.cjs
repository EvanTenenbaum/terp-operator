// Step 4: complete and POST a payment row. Watch toast, allocation, posted row.
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  // Reuse first draft row (created in earlier step) instead of adding more
  const row = page.locator('table').first().locator('tbody tr').first();
  const status = await row.evaluate(tr => tr.textContent);
  console.log('first row contains Draft?', /Draft/.test(status));

  await row.getByLabel('Entity id').selectOption({ label: 'Moss Landing Co-op' });
  await page.waitForTimeout(800);
  await row.getByLabel('Amount').fill('137.55');
  await row.getByLabel('Notes').fill('money-lane QA payment 1');
  await page.waitForTimeout(1500);

  // Full trace/preview text
  const fullCells = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')));
  console.log('PREVIEW cell (full):', fullCells[15]);
  console.log('AMOUNT cell (full):', fullCells[11]);
  await d.shot('04-filled-before-post');

  // POST
  await row.getByRole('button', { name: 'Record payment' }).click();
  // capture toast quickly
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    const toasts = await page.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert],[class*=toast],[class*=Toast],[data-sonner-toast]')].map(t => (t.textContent||'').trim().replace(/\s+/g,' ').slice(0,300)).filter(Boolean));
    if (toasts.length) { console.log('TOASTS:', JSON.stringify(toasts));
      const toastLinks = await page.evaluate(() => [...document.querySelectorAll('[role=status] a, [role=alert] a, [class*=toast] a, [class*=toast] button, [data-sonner-toast] a, [data-sonner-toast] button')].map(a => (a.textContent||'').trim()).filter(Boolean));
      console.log('TOAST ACTIONS:', JSON.stringify(toastLinks));
      break; }
  }
  await d.shot('04-after-post');
  await page.waitForTimeout(2000);

  // Find the posted row (search for our note)
  const posted = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    const r = rows.find(tr => tr.textContent.includes('money-lane QA payment 1'));
    if (!r) return 'NOT FOUND in visible rows';
    return [...r.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ').slice(0,80));
  });
  console.log('POSTED ROW:', JSON.stringify(posted, null, 1));
  await d.shot('04-posted-row');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
