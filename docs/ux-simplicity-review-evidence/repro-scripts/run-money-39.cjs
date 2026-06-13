const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(4500);
  const views = await page.evaluate(() => [...document.querySelectorAll('a,button')].filter(e => /^\s*View\s*$/.test(e.textContent)).map(e => ({ tag: e.tagName, href: e.getAttribute('href'), ctx: (e.closest('div')?.parentElement?.textContent||'').replace(/\s+/g,' ').slice(0,60) })));
  console.log('View elements:', JSON.stringify(views, null, 1));
  // click first View (cash position)
  await page.locator('a,button').filter({ hasText: /^View$/ }).first().click();
  await page.waitForTimeout(2500);
  console.log('after cash View click:', page.url());
  await d.shot('39-cash-view2');
  // Pending work queues: Payments ready 495 — clickable?
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(4000);
  const pq = await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button,div,li')].filter(e => /Payments ready/.test(e.textContent||'') && e.textContent.length < 60);
    return el.map(e => e.tagName).slice(0,5);
  });
  console.log('Payments ready elements:', JSON.stringify(pq));
  await page.getByText(/Payments ready/).last().click().catch(e => console.log('click err'));
  await page.waitForTimeout(2500);
  console.log('after Payments ready click:', page.url());
  await d.shot('39-payments-ready');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
