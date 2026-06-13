// Step 9: Quick actions > Money in modal; draft delete affordances; Types button
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/payments');
  await page.waitForTimeout(3000);

  // 1) Types button (first = Money In)
  await page.getByRole('button', { name: 'Types', exact: true }).first().click();
  await page.waitForTimeout(800);
  const typesUI = await page.evaluate(() => [...document.querySelectorAll('[role=menu],[role=dialog],[role=listbox],[data-radix-popper-content-wrapper]')].map(e => (e.textContent||'').trim().replace(/\s+/g,' ').slice(0,400)));
  console.log('Types popover:', JSON.stringify(typesUI));
  await d.shot('09-types-popover');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 2) Draft row delete affordance: inspect all buttons within first row
  const row = page.locator('table').first().locator('tbody tr').first();
  const rowButtons = await row.evaluate(tr => [...tr.querySelectorAll('button')].map(b => ({ txt: (b.textContent||'').trim(), aria: b.getAttribute('aria-label')||'', title: b.title||'' })));
  console.log('draft row buttons:', JSON.stringify(rowButtons));
  // try right-click context menu
  await row.click({ button: 'right' });
  await page.waitForTimeout(800);
  const ctx = await page.evaluate(() => [...document.querySelectorAll('[role=menu],[data-radix-popper-content-wrapper]')].map(e => (e.textContent||'').trim().replace(/\s+/g,' ').slice(0,300)));
  console.log('context menu:', JSON.stringify(ctx));
  await d.shot('09-row-context');
  await page.keyboard.press('Escape');

  // 3) Quick actions > Money in
  await page.getByRole('button', { name: 'Quick actions' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('menuitem', { name: 'Money in' }).click().catch(async () => {
    await page.getByText('Money in', { exact: true }).click();
  });
  await page.waitForTimeout(1500);
  console.log('url after Money in action:', page.url());
  const dialog = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(e => (e.textContent||'').trim().replace(/\s+/g,' ').slice(0,500)));
  console.log('dialog:', JSON.stringify(dialog));
  await d.shot('09-money-in-action');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
