// Mobile shell tour at 390x844
const { launch, snap, readToasts } = require('./wh-lib.cjs');
(async () => {
  const { page, done } = await launch({ viewport: { width: 390, height: 844 } });

  const tour = async (url, name) => {
    await page.goto('http://localhost:5173' + url);
    await page.waitForTimeout(2500);
    await snap(page, name);
    const txt = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
    console.log(`=== ${url} ===`);
    console.log(txt.slice(0, 900));
    console.log('');
    return txt;
  };

  await tour('/mobile/dashboard', '14-m-dashboard');
  await tour('/mobile/inventory', '14-m-inventory');
  const cat = await tour('/mobile/catalog', '14-m-catalog');
  // catalog: look for copy-offer + any cost/margin leak
  console.log('catalog mentions cost?', /cost|margin|COGS/i.test(cat));
  const copyBtn = page.getByRole('button', { name: /copy/i });
  console.log('copy buttons:', await copyBtn.count(), await copyBtn.allTextContents().catch(()=>[]));

  const pay = await tour('/mobile/payments', '14-m-payments');
  // can we log a payment?
  const payBtns = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean));
  console.log('payments buttons:', payBtns.slice(0, 25));
  const payInputs = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].map(i => i.getAttribute('aria-label') || i.getAttribute('placeholder') || i.tagName));
  console.log('payments inputs:', payInputs.slice(0, 15));

  await tour('/mobile/contacts', '14-m-contacts');
  // tap first contact
  const contactBtn = page.locator('main a, main button, main li').first();
  const firstContact = await page.evaluate(() => {
    const el = document.querySelector('main ul li a, main ul li button, main [role="list"] a');
    return el ? el.textContent.trim().slice(0, 60) : null;
  });
  console.log('first contact element:', firstContact);
  const link = page.locator('main a[href*="/mobile/contacts/"]').first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(2500);
    console.log('contact detail URL:', page.url());
    console.log('detail text:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700));
    await snap(page, '14-m-contact-detail');
  } else {
    // maybe buttons instead of links
    const li = page.locator('main li button, main li').first();
    await li.click().catch(()=>{});
    await page.waitForTimeout(2000);
    console.log('after tapping first contact URL:', page.url());
    await snap(page, '14-m-contact-detail');
  }

  const intake = await tour('/mobile/intake', '14-m-intake');
  const intakeBtns = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean));
  console.log('intake buttons:', intakeBtns.slice(0, 25));
  await done();
})().catch(e => { console.error(e); process.exit(1); });
