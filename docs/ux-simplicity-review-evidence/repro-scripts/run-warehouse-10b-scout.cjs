// Scout /sales after customer selection
const { launch, snap } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/sales');
  await page.waitForTimeout(3000);
  await page.selectOption('select[aria-label="Choose customer"]', { label: 'Canyon Market' });
  await page.waitForTimeout(6000);
  await snap(page, '10b-after-customer');
  const inputs = await page.evaluate(() => [...document.querySelectorAll('input[aria-label]')].map(i => i.getAttribute('aria-label')));
  console.log('inputs:', inputs);
  const headings = await page.evaluate(() => [...document.querySelectorAll('h2, h3')].map(h => h.textContent.trim()).slice(0, 20));
  console.log('headings:', headings);
  const gridTexts = await page.evaluate(() => [...document.querySelectorAll('.ag-root-wrapper')].map(w => w.innerText.replace(/\s+/g, ' ').slice(0, 150)));
  console.log('grids:', JSON.stringify(gridTexts, null, 1));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
