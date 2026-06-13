const { launch, snap, nukeOverlay, aria } = require('./buy-lib.cjs');
(async () => {
  const { page, done } = await launch();
  // Use the app's API session to query POs directly
  await page.goto('http://localhost:5173/purchaseOrders');
  await page.waitForTimeout(2000);
  const api = await page.evaluate(async () => {
    const tryUrls = ['/api/purchase-orders?limit=5', '/api/purchaseOrders?limit=5', 'http://localhost:8787/api/purchase-orders?limit=5'];
    const out = {};
    for (const u of tryUrls) {
      try { const r = await fetch(u, { credentials: 'include' }); out[u] = { status: r.status, body: (await r.text()).slice(0, 500) }; } catch (e) { out[u] = String(e); }
    }
    return out;
  });
  console.log(JSON.stringify(api, null, 2));
  // check the status filter buttons state and whether drafts are excluded
  const region = page.getByRole('region', { name: 'Recent purchase orders' });
  await region.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('DRAFT');
  await page.waitForTimeout(800);
  console.log('rows matching DRAFT:', JSON.stringify(await region.locator('.ag-center-cols-container .ag-row').allInnerTexts()));
  await region.getByRole('textbox', { name: /Filter Recent purchase orders/ }).fill('status:draft');
  await page.waitForTimeout(800);
  console.log('rows matching status:draft:', JSON.stringify((await region.locator('.ag-center-cols-container .ag-row').allInnerTexts()).slice(0, 10)));
  await snap(page, '07-draft-filter');
  await done();
})().catch(e => { console.error(e); process.exit(1); });
