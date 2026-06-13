// Desktop /fulfillment: find PICK-REAL-00007 (all packed, status open), Mark fulfilled
const { launch, snap, aria, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch();
  await page.goto('http://localhost:5173/fulfillment');
  await page.waitForTimeout(2500);

  // Filter to the pick
  const fbox = page.getByLabel('Filter Fulfillment grid');
  await fbox.fill('pickNo:PICK-REAL-00007');
  await fbox.press('Enter');
  await page.waitForTimeout(1500);
  const hdr = await page.getByRole('button', { name: /Fulfillment \d+ row/ }).first().textContent().catch(()=>'?');
  console.log('after filter header:', hdr);
  await snap(page, '07-filtered');

  // force-click the row
  const cell = page.locator('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell').first();
  await cell.click({ force: true });
  await page.waitForTimeout(2500);
  const pill = await page.locator('.selection-pill').allTextContents();
  console.log('pills:', pill);
  // lines panel content
  const linesTxt = await page.evaluate(() => {
    const regions = [...document.querySelectorAll('section, [role="region"]')];
    const r = regions.find(x => x.textContent?.includes('Fulfillment Lines'));
    return r ? r.innerText.replace(/\s+/g, ' ').slice(0, 600) : 'NOT FOUND';
  });
  console.log('LINES PANEL:', linesTxt);
  await snap(page, '07-row-selected');

  // status action bar: Mark fulfilled
  const mf = page.getByRole('button', { name: /Mark fulfilled/ });
  console.log('Mark fulfilled count:', await mf.count());
  if (await mf.count()) {
    console.log('Mark fulfilled disabled:', await mf.first().isDisabled());
    console.log('Mark fulfilled title:', await mf.first().getAttribute('title'));
    if (!(await mf.first().isDisabled())) {
      await mf.first().click();
      await page.waitForTimeout(3500);
      console.log('TOASTS after fulfill:', await readToasts(page));
      await snap(page, '07-after-fulfill');
      // does the toast include a View order action?
      const viewOrder = page.getByRole('button', { name: 'View order' });
      console.log('View order toast action count:', await viewOrder.count());
      // row gone from open queue?
      await fbox.fill('status:open');
      await fbox.press('Enter');
      await page.waitForTimeout(1500);
      await fbox.fill('pickNo:PICK-REAL-00007');
      await fbox.press('Enter');
      await page.waitForTimeout(1500);
      const rowTxt = await page.evaluate(() => document.querySelector('.ag-center-cols-container')?.innerText?.slice(0,200));
      console.log('row after fulfill (filtered by pickNo only):', rowTxt);
      await snap(page, '07-after-fulfill-grid');
    }
  }
  await done();
})().catch(e => { console.error(e); process.exit(1); });
