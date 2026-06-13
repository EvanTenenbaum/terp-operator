// Chrome lane 02 — ⌘⇧F entity search: navigate to customer / batch / order,
// verify grid filter + drawer. heal() steps over F-chrome-01 crashes.
const { start } = require('./lib-chrome.cjs');

(async () => {
  const { page, note, shot, heal, finish } = await start('owner@terpagro.local');
  const obs = (...a) => console.log('OBS', ...a);

  async function openEntities() {
    await page.keyboard.press('Meta+Shift+f');
    await page.waitForTimeout(600);
    if (await heal()) obs('(healed on ⌘⇧F open)');
    await page.waitForTimeout(300);
    const vis = await page.getByLabel('Entity search').isVisible().catch(() => false);
    const tabSel = await page.getByRole('tab', { name: 'Entities' }).getAttribute('aria-selected').catch(() => null);
    obs('entities tab open:', vis, 'aria-selected:', tabSel);
    return vis;
  }
  async function searchEntities(q) {
    await page.getByLabel('Entity search').fill(q);
    await page.waitForTimeout(1300); // debounce + fetch
    const text = await page.locator('[role="dialog"][aria-label="Command palette"]').innerText().catch(() => 'NOT OPEN');
    obs(`entity query "${q}" →`, text.replace(/\n+/g, ' | ').slice(0, 600));
    return text;
  }
  async function stateAfterNav(label) {
    await page.waitForTimeout(900);
    if (await heal()) obs(`(healed after navigating to ${label})`);
    await page.waitForTimeout(700);
    const url = page.url();
    const filterVal = await page.locator('[data-grid-quick-filter]').inputValue().catch(() => 'NO FILTER INPUT');
    const drawerOpen = await page.locator('aside[aria-label="Context drawer"]').isVisible().catch(() => false);
    const rowCount = await page.locator('.ag-center-cols-container .ag-row').count().catch(() => -1);
    obs(`after nav to ${label}: url=${url} filter="${filterVal}" drawerOpen=${drawerOpen} visibleRows=${rowCount}`);
  }

  // 1. customer
  await openEntities();
  await shot('02-01-entities-open');
  await searchEntities('Green Door');
  await shot('02-02-entities-customer-results');
  const cust = page.locator('button.entity-result', { hasText: 'Green Door' }).first();
  if (await cust.isVisible().catch(() => false)) {
    await cust.click();
    await stateAfterNav('customer Green Door');
    await shot('02-03-after-nav-customer');
  } else note({ type: 'finding', text: 'Entity search: no result for customer fragment "Green Door"' });

  // 2. batch
  await openEntities();
  await searchEntities('FLW-OUTDOOR-03');
  await shot('02-04-entities-batch-results');
  const batch = page.locator('button.entity-result', { hasText: 'FLW-OUTDOOR-030' }).first();
  if (await batch.isVisible().catch(() => false)) {
    await batch.click();
    await stateAfterNav('batch FLW-OUTDOOR-030');
    await shot('02-05-after-nav-batch');
  } else note({ type: 'finding', text: 'Entity search: batch fragment FLW-OUTDOOR-03 gave no clickable result' });

  // 3. order — discover an order id via search
  await openEntities();
  const t = await searchEntities('order');
  await shot('02-06-entities-order-results');
  // click first row under ORDERS group if present
  const orderBtn = page.locator('button.entity-result').filter({ has: page.locator('span.entity-type', { hasText: /^order$/i }) }).first();
  if (await orderBtn.isVisible().catch(() => false)) {
    const label = (await orderBtn.innerText()).replace(/\n+/g, ' ').slice(0, 80);
    obs('clicking order result:', label);
    await orderBtn.click();
    await stateAfterNav('order ' + label);
    await shot('02-07-after-nav-order');
  } else {
    obs('no order-type result for "order" query; trying "SO-"');
    await searchEntities('SO-');
    const o2 = page.locator('button.entity-result').filter({ has: page.locator('span.entity-type', { hasText: /^order$/i }) }).first();
    if (await o2.isVisible().catch(() => false)) {
      const label = (await o2.innerText()).replace(/\n+/g, ' ').slice(0, 80);
      obs('clicking order result:', label);
      await o2.click();
      await stateAfterNav('order ' + label);
      await shot('02-07-after-nav-order');
    } else note({ type: 'finding', text: 'Entity search: could not surface any order-type result via "order" or "SO-"' });
  }

  // 4. frame filter chips
  await openEntities();
  await searchEntities('flower');
  const frames = ['Sales', 'Inventory', 'Procurement', 'All'];
  for (const f of frames) {
    await page.getByRole('group', { name: 'Filter frame' }).getByRole('button', { name: f }).click();
    await page.waitForTimeout(600);
    const text = await page.locator('[role="dialog"][aria-label="Command palette"]').innerText().catch(() => '');
    const groups = (text.match(/^[A-Z]{4,}$/gm) || []).join(',');
    obs(`frame ${f}: visible groups ~ ${groups || text.replace(/\n+/g, '|').slice(0, 200)}`);
  }
  await shot('02-08-frame-filters');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await heal();

  await finish();
})().catch(e => { console.error(e); process.exit(1); });
