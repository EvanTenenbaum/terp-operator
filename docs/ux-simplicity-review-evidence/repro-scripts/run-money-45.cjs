// Step 45: keyboard-only entry of a money-out row
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const api = [];
  page.on('response', async r => {
    if (r.url().includes('commands.run')) {
      let body = ''; try { body = await r.text(); } catch {}
      const pd = JSON.parse(r.request().postData()||'{}')['0']?.json || {};
      api.push({ name: pd.name, ok: body.includes('"ok":true'), toast: (body.match(/"toast":"([^"]{0,160})/)||[])[1] });
    }
  });
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Paying' }).click();
  await page.waitForTimeout(1000);
  const btn = page.getByRole('button', { name: 'Row', exact: true });
  await btn.nth(await btn.count() > 1 ? 1 : 0).click();
  await page.waitForTimeout(900);
  const row = page.locator('table').nth(1).locator('tbody tr').first();

  let keys = 0;
  const K = async (k, n=1) => { for (let i=0;i<n;i++){ await page.keyboard.press(k); keys++; } };
  // focus the date input
  await row.getByLabel('Date').focus();
  await K('Tab'); // -> entity type
  // entity type already customer? select vendor by typing
  await page.keyboard.type('v'); keys++; // vendor
  await K('Tab'); // -> entity id
  await page.keyboard.type('Vista'); keys += 5; // type-ahead?
  const ent = await row.getByLabel('Entity id').inputValue();
  console.log('entity after typeahead:', ent || '(empty)');
  if (!ent) { await K('ArrowDown'); }
  const ent2 = await row.getByLabel('Entity id').inputValue();
  console.log('entity after arrow:', ent2 || '(empty)');
  await K('Tab'); // -> tx type
  await K('Tab'); // -> allocation
  await K('Tab'); // -> amount?
  const active = await page.evaluate(() => ({ tag: document.activeElement.tagName, aria: document.activeElement.getAttribute('aria-label') }));
  console.log('focus after 3 tabs from entity:', JSON.stringify(active));
  // ensure we are in Amount; if not, tab until
  for (let i = 0; i < 6; i++) {
    const a = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
    if (a === 'Amount') break;
    await K('Tab');
  }
  await page.keyboard.type('44.44'); keys += 5;
  await K('Enter');
  await page.waitForTimeout(2500);
  console.log('keys used:', keys, 'api:', JSON.stringify(api));
  const state = await row.evaluate(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim().replace(/\s+/g,' ')).slice(14,18));
  console.log('row state after Enter:', JSON.stringify(state));
  await d.shot('45-keyboard-entry');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
