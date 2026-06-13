// Probe: why does the matchmaking grid churn? And can a synthetic click select a row?
const { start } = require('./lib-longtail.cjs');
(async () => {
  const d = await start();
  const { page } = d;
  await page.goto('http://localhost:5173/matchmaking');
  await page.waitForTimeout(3000);

  const churnDetail = await page.evaluate(async () => {
    const el = document.querySelector('.ag-center-cols-container');
    if (!el) return null;
    const tally = {};
    const mo = new MutationObserver(ms => {
      for (const m of ms) {
        for (const n of [...m.addedNodes, ...m.removedNodes]) {
          const k = (n.nodeType === 1 ? (n.className || n.nodeName) : n.nodeName).toString().slice(0, 60);
          tally[k] = (tally[k] || 0) + 1;
        }
      }
    });
    mo.observe(el, { childList: true, subtree: true });
    await new Promise(r => setTimeout(r, 3000));
    mo.disconnect();
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8);
  });
  console.log('churn detail:', JSON.stringify(churnDetail, null, 1));

  // synthetic click on first row
  const result = await page.evaluate(() => {
    const grid = document.querySelector('.ag-root-wrapper');
    const row = grid && grid.querySelector('.ag-center-cols-container .ag-row');
    if (!row) return 'no row';
    const cell = row.querySelector('.ag-cell');
    const evOpts = { bubbles: true, cancelable: true, view: window };
    cell.dispatchEvent(new MouseEvent('mousedown', evOpts));
    cell.dispatchEvent(new MouseEvent('mouseup', evOpts));
    cell.dispatchEvent(new MouseEvent('click', evOpts));
    return { rowId: row.getAttribute('row-id'), ariaSelectedBefore: row.getAttribute('aria-selected') };
  });
  console.log('synthetic click:', JSON.stringify(result));
  await page.waitForTimeout(1000);
  const sel = await page.evaluate(() => {
    const rows = document.querySelectorAll('.ag-root-wrapper .ag-row[aria-selected="true"]');
    return rows.length;
  });
  console.log('selected rows after synthetic click:', sel);
  const accept = page.getByRole('button', { name: 'Accept' }).first();
  console.log('Accept disabled?', await accept.isDisabled());
  await d.shot('02h-mm-synthetic-click');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
