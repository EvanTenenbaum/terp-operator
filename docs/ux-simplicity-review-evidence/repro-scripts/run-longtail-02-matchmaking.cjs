// Matchmaking: entry forms (need + stock), accept/dismiss, outreach history, expiry styling, settings knobs.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(2500);
  await d.shot('02-mm-00-initial');

  // --- 1. Entry form: customer need ---
  console.log('--- entry: customer need ---');
  const custSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Canyon Market' }) }).first();
  await custSelect.selectOption({ label: 'reaper-test-01f2a3f5' }).catch(e => console.log('cust select fail', String(e).slice(0,150)));
  // need fields: category select, qty, target $, by date
  const needSection = page.locator('text=Need').first();
  // pick category in the need form (first Category select after customer)
  const selects = page.locator('select');
  const nSel = await selects.count();
  console.log('select count on page:', nSel);
  // Try by accessible labels first
  const catSel = page.locator('select').nth(1);
  await catSel.selectOption({ label: 'Flower' }).catch(e => console.log('cat sel fail', String(e).slice(0,100)));
  // Qty + Target inputs near "Add Need"
  const qty = page.getByPlaceholder('Qty').first();
  if (await qty.count()) { await qty.fill('10'); } else {
    const numInputs = page.locator('input[type="number"]');
    console.log('number inputs:', await numInputs.count());
    await numInputs.nth(0).fill('10').catch(()=>{});
    await numInputs.nth(1).fill('500').catch(()=>{});
  }
  await page.getByPlaceholder('Target $').first().fill('500').catch(()=>{});
  await d.shot('02-mm-01-need-filled');
  await page.getByRole('button', { name: 'Add Need' }).click().catch(e => console.log('Add Need click fail', String(e).slice(0,100)));
  await page.waitForTimeout(2000);
  await d.shot('02-mm-02-need-added');
  console.log('after Add Need, page contains toast?');
  const bodyTxt1 = await page.locator('body').innerText();
  console.log(bodyTxt1.includes('Need') ? 'need text present' : '');

  // --- 2. Entry form: vendor stock ---
  console.log('--- entry: vendor stock ---');
  const vendSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Boulder Creek' }) }).first();
  await vendSelect.selectOption({ label: 'Boulder Creek' }).catch(e => console.log('vend select fail', String(e).slice(0,150)));
  // stock category select - find selects again
  const allSel = page.locator('select');
  const cnt = await allSel.count();
  // assume order: customer, need-cat, vendor, stock-cat, lookback, repeat...
  await allSel.nth(3).selectOption({ label: 'Flower' }).catch(e => console.log('stock cat fail', String(e).slice(0,100)));
  const numInputs2 = page.locator('input[type="number"]');
  const ni = await numInputs2.count();
  console.log('number input count:', ni);
  // dump placeholders to find right ones
  for (let i = 0; i < ni; i++) {
    const ph = await numInputs2.nth(i).getAttribute('placeholder');
    console.log('numinput', i, 'placeholder', ph);
  }
  await page.getByPlaceholder('Ask $').first().fill('450').catch(e=>console.log('ask fail'));
  // qty for stock: second Qty placeholder
  const qtys = page.getByPlaceholder('Qty');
  if (await qtys.count() > 1) await qtys.nth(1).fill('25');
  await d.shot('02-mm-03-stock-filled');
  await page.getByRole('button', { name: 'Add Stock' }).click().catch(e => console.log('Add Stock fail', String(e).slice(0,100)));
  await page.waitForTimeout(2000);
  await d.shot('02-mm-04-stock-added');

  // --- 3. Deterministic matches: inspect grid, accept one OPEN ---
  console.log('--- matches grid ---');
  const grid = page.locator('text=Deterministic Matches').first();
  await grid.scrollIntoViewIfNeeded().catch(()=>{});
  await page.waitForTimeout(800);
  const matchTxt = await page.locator('body').innerText();
  const m = matchTxt.match(/Deterministic Matches[\s\S]{0,300}/);
  console.log('match section head:', m && m[0].slice(0, 200));
  // select an OPEN row: click its checkbox or row, then Accept button
  // find rows
  const rows = page.locator('[role="row"], table tbody tr');
  console.log('row count:', await rows.count());
  // Accept/Dismiss buttons at grid header act on selection presumably
  // Click first OPEN status row
  const openCell = page.getByText('OPEN', { exact: true }).first();
  await openCell.click().catch(e => console.log('open row click fail', String(e).slice(0,100)));
  await page.waitForTimeout(1000);
  await d.shot('02-mm-05-row-clicked');
  const afterRowClick = await page.locator('body').innerText();
  if (afterRowClick.length - matchTxt.length !== 0) console.log('row click changed page (maybe drawer)');
  console.log('URL now', page.url());
  await d.dump('after-open-row-click');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
