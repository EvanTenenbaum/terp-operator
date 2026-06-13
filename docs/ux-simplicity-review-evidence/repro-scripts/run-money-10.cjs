// Step 10: Money Out post attempt (vendor); then survey Client Balances for payment actions
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      api.push({ post: (r.request().postData()||'').slice(0,250), body: body.slice(0, 400) });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  // Switch to Paying tab/section. There are toggle buttons "Receiving"/"Paying" at top.
  await page.getByRole('button', { name: 'Paying' }).click();
  await page.waitForTimeout(1500);
  await d.shot('10-paying-view');
  // Money Out: second "Row" button or now-first? dump buttons
  const btns = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(t => /^(Row|Types|Record)/.test(t)));
  console.log('row/type buttons visible:', JSON.stringify(btns));

  const rowBtn = page.getByRole('button', { name: 'Row', exact: true });
  const cnt = await rowBtn.count();
  await rowBtn.nth(cnt > 1 ? 1 : 0).click();
  await page.waitForTimeout(1200);

  // find the money-out table: the one whose header mentions "Entity paying cash to"? Actually that's receiving. Money out header: "Cash paid to"? Use last table with a draft input row.
  const tables = page.locator('table');
  const tcount = await tables.count();
  console.log('table count:', tcount);
  let outRow = null;
  for (let i = 0; i < tcount; i++) {
    const r = tables.nth(i).locator('tbody tr').first();
    if (await r.getByLabel('Entity type').count()) {
      const dir = await tables.nth(i).evaluate(t => t.closest('section,div')?.textContent.slice(0,100));
      outRow = r;
    }
  }
  // pick the LAST table with editable row (money out is second section)
  for (let i = tcount - 1; i >= 0; i--) {
    const r = tables.nth(i).locator('tbody tr').first();
    if (await r.getByLabel('Entity type').count()) { outRow = r; break; }
  }
  if (!outRow) { console.log('no editable money-out row found'); await d.finish(); return; }
  await outRow.getByLabel('Entity type').selectOption('vendor').catch(e => console.log('entity type select err', String(e).slice(0,100)));
  await page.waitForTimeout(800);
  const entOpts = await outRow.getByLabel('Entity id').evaluate(s => [...s.options].slice(0,5).map(o => o.text));
  console.log('vendor opts:', JSON.stringify(entOpts));
  await outRow.getByLabel('Entity id').selectOption({ index: 1 });
  await outRow.getByLabel('Amount').fill('77.10');
  await outRow.getByLabel('Notes').fill('money-lane QA payout 1');
  await page.waitForTimeout(1200);
  const trace = await outRow.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')).slice(14,18));
  console.log('money-out trace before post:', JSON.stringify(trace));
  await outRow.getByRole('button', { name: /Record/ }).click();
  await page.waitForTimeout(3000);
  console.log('command exchanges:', JSON.stringify(api, null, 1));
  const trace2 = await outRow.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')).slice(14,18));
  console.log('money-out after post:', JSON.stringify(trace2));
  await d.shot('10-money-out-post');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
