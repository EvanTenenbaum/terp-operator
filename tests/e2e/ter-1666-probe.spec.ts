import { test } from '@playwright/test';

test('TER-1666 dump PO page DOM', async ({ page }) => {
  await page.setViewportSize({ width: 1397, height: 994 });
  await page.goto('http://100.71.65.30:5173/purchaseOrders', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4000);
  
  const children = await page.evaluate(() => {
    const viewStack = document.querySelector('.view-stack');
    if (!viewStack) return [{ error: 'No .view-stack found on page' }];
    return Array.from(viewStack.children).map(c => ({
      tag: c.tagName,
      classes: Array.from(c.classList).join(' '),
      text: (c.textContent || '').substring(0, 150)
    }));
  });
  
  console.log('=== VIEW-STACK CHILDREN ===');
  console.log(JSON.stringify(children, null, 2));
  
  const fixedEls = await page.evaluate(() => {
    const viewStack = document.querySelector('.view-stack');
    if (!viewStack) return [];
    const els = viewStack.querySelectorAll('.fixed');
    return Array.from(els).map(e => ({
      tag: e.tagName,
      classes: (e.className || '').substring(0, 120),
      text: (e.textContent || '').substring(0, 100)
    }));
  });
  console.log('\n=== FIXED-CLASS ELEMENTS INSIDE VIEW-STACK ===');
  console.log(JSON.stringify(fixedEls, null, 2));
  
  const flexInside = await page.evaluate(() => {
    const viewStack = document.querySelector('.view-stack');
    if (!viewStack) return [];
    const els = viewStack.querySelectorAll('.flex');
    return Array.from(els).map(e => ({
      tag: e.tagName,
      classes: (e.className || '').substring(0, 120),
      text: (e.textContent || '').substring(0, 80)
    })).slice(0, 10);
  });
  console.log('\n=== FLEX-CLASS ELEMENTS INSIDE VIEW-STACK (first 10) ===');
  console.log(JSON.stringify(flexInside, null, 2));
});
