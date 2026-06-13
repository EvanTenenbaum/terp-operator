// Scout: visit each longtail surface, dump nav + text, screenshot.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  const surfaces = ['/reports', '/matchmaking', '/referees', '/contacts', '/items', '/disputes', '/photography', '/credit-review', '/settings', '/recovery', '/closeout'];
  for (const s of surfaces) {
    await page.goto('http://localhost:5173' + s);
    await page.waitForTimeout(2200);
    const name = '00-scout-' + s.replace(/\//g, '');
    await d.shot(name);
    await d.dump(s);
  }
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
