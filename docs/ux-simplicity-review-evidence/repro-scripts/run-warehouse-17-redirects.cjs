// Mobile redirect mapping at 390px + desktop<->mobile roundtrip
const { launch, snap } = require('./wh-lib.cjs');
(async () => {
  const { page, context, done } = await launch({ viewport: { width: 390, height: 844 } });
  // ensure no prefer-desktop flag
  await page.evaluate(() => localStorage.removeItem('terp-prefer-desktop'));

  const probe = async (url) => {
    await page.goto('http://localhost:5173' + url);
    await page.waitForTimeout(2500);
    console.log(`${url}  ->  ${new URL(page.url()).pathname}`);
  };
  await probe('/payments');
  await probe('/contacts/441fc077-3c4b-4cfd-aca7-ccdd20712557');
  await probe('/sales');
  await probe('/fulfillment');
  await probe('/pick');
  await probe('/inventory');
  await probe('/orders');

  // "Use desktop site" toggle in mobile header
  await page.goto('http://localhost:5173/mobile/dashboard');
  await page.waitForTimeout(2000);
  const desktopLink = page.getByLabel('Switch to desktop view');
  console.log('Desktop toggle present:', await desktopLink.count(), 'text:', await desktopLink.textContent().catch(()=>'?'));
  await desktopLink.click();
  await page.waitForTimeout(2500);
  console.log('after Desktop click URL:', new URL(page.url()).pathname, 'prefer-desktop:', await page.evaluate(() => localStorage.getItem('terp-prefer-desktop')));
  await snap(page, '17-m-desktop-mode-390');
  // at 390px in desktop mode — does it stay desktop on deep links now?
  await probe('/fulfillment');
  await snap(page, '17-desktop-fulfillment-390');
  await done();

  // Round trip on desktop viewport
  const { page: p2, done: done2 } = await launch();
  await p2.evaluate(() => localStorage.removeItem('terp-prefer-desktop'));
  await p2.goto('http://localhost:5173/dashboard');
  await p2.waitForTimeout(2000);
  const mLink = p2.getByRole('link', { name: /Switch to mobile view|Mobile view/ });
  console.log('SideNav mobile link:', await mLink.count());
  await mLink.first().click();
  await p2.waitForTimeout(2500);
  console.log('after mobile link URL:', new URL(p2.url()).pathname);
  await snap(p2, '17-desktop-to-mobile');
  // mobile shell at desktop width? then switch back
  const dLink = p2.getByLabel('Switch to desktop view');
  console.log('desktop link in mobile shell:', await dLink.count());
  await dLink.click();
  await p2.waitForTimeout(2500);
  console.log('after desktop link URL:', new URL(p2.url()).pathname);
  await snap(p2, '17-mobile-back-to-desktop');
  await done2();
})().catch(e => { console.error(e); process.exit(1); });
