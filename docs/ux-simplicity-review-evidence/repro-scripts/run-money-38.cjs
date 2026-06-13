// Step 38: View links, Money Buckets row, Credit Watch row, Your drafts
const { start } = require('./lib-money.cjs');
(async () => {
  const d = await start('owner@terpagro.local');
  const { page } = d;
  const go = async () => { await page.goto('http://localhost:5173/dashboard'); await page.waitForTimeout(4000); };
  await go();

  // 1) CASH POSITION -> View
  const cashView = page.getByText('CASH POSITION').locator('xpath=ancestor::*[self::div or self::section][1]').getByText('View').first();
  await cashView.click().catch(async e => { console.log('fallback view click'); await page.getByText('View', { exact: true }).first().click(); });
  await page.waitForTimeout(2500);
  console.log('CASH POSITION View ->', page.url());
  await d.shot('38-cash-view');

  // 2) Money bucket row click
  await go();
  await page.getByText('cash-file-a', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  console.log('bucket cash-file-a click ->', page.url());
  await d.shot('38-bucket-click');

  // 3) Credit watch row
  await go();
  const cwRow = page.getByText('Credit Watch').locator('xpath=ancestor::*[self::div or self::section][2]').getByText('Harbor Wellness').first();
  await cwRow.click().catch(async () => { await page.getByText('Harbor Wellness').first().click(); });
  await page.waitForTimeout(3000);
  console.log('credit watch Harbor ->', page.url());
  const drawerOpen = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(x => (x.textContent||'').replace(/\s+/g,' ').slice(0,150)));
  console.log('dialogs:', JSON.stringify(drawerOpen));
  const filterVal = await page.locator('input[placeholder*="filter" i]').first().inputValue().catch(() => 'n/a');
  console.log('grid filter value:', filterVal);
  await d.shot('38-credit-watch-landing');

  // 4) Your drafts
  await go();
  const drafts = await page.evaluate(() => (document.body.innerText.match(/Your drafts[\s\S]{0,300}/)||['?'])[0].replace(/\n+/g,' | '));
  console.log('your drafts section:', drafts);
  await page.getByText(/Your drafts/).first().click().catch(()=>{});
  await page.waitForTimeout(1000);
  const draftLinks = await page.evaluate(() => {
    const m = [...document.querySelectorAll('h2,h3')].find(h => /Your drafts/.test(h.textContent));
    let sec = m; while (sec && !sec.querySelector('a,button:not(h2 button)') ) sec = sec.parentElement;
    return sec ? [...sec.querySelectorAll('a,button')].map(b => (b.textContent||'').trim().slice(0,60)).filter(Boolean).slice(0,10) : [];
  });
  console.log('draft section links:', JSON.stringify(draftLinks));
  await d.shot('38-your-drafts');
  await d.finish();
})().catch(e => { console.error(e); process.exit(1); });
