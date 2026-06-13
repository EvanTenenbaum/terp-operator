const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3500);
  const counts = await page.evaluate(() => {
    const t = document.querySelectorAll('table')[0];
    const rows = [...t.querySelectorAll('tbody tr')];
    const drafts = rows.filter(r => /Draft|Needs Fix/.test(r.textContent)).length;
    return { total: rows.length, draftish: drafts };
  });
  console.log('money-in table:', JSON.stringify(counts));
  // try Delete key on first draft row
  const row = page.locator('table').first().locator('tbody tr').first();
  await row.getByLabel('Notes').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(1200);
  const counts2 = await page.evaluate(() => document.querySelectorAll('table')[0].querySelectorAll('tbody tr').length);
  console.log('rows after Delete key:', counts2);
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
