// Enumerate matchmaking grids and their first rows.
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.ag-root-wrapper')).map((g, i) => {
      // find panel title: nearest ancestor section's heading
      let t = '';
      let el = g;
      while (el && el !== document.body) {
        const h = el.querySelector('h1,h2,h3,[class*="title"]');
        if (h && h.textContent) { t = h.textContent.trim().slice(0, 40); break; }
        el = el.parentElement;
      }
      const rows = g.querySelectorAll('.ag-center-cols-container .ag-row');
      const first = rows[0] ? (rows[0].innerText || '').replace(/\n/g, ' | ').slice(0, 100) : '(empty)';
      return { i, title: t, rowCount: rows.length, first };
    });
  });
  console.log(JSON.stringify(info, null, 1));
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
