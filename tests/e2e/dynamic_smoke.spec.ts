import { test, chromium } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(120_000);
test('command palette and hotkey tests', async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const page = await ctx.newPage();
  const events: string[] = [];
  page.on('pageerror', (err) => events.push(`PAGEERROR ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') events.push(`CONSOLE_ERROR ${m.text()}`); });
  await page.goto('/');
  await page.fill('input#email', 'owner@terpagro.local');
  await page.fill('input#password', 'terp-demo');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Open command palette via Cmd+K
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/palette-open.png', fullPage: true });

  // Type something
  await page.keyboard.type('createReferee');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/palette-typed.png', fullPage: true });

  // Press Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Now try the hotkey for sales
  await page.keyboard.press('Meta+3');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'artifacts/hotkey-sales.png', fullPage: true });

  // Try ESC on a form
  await page.keyboard.press('Meta+5');
  await page.waitForTimeout(2000);

  // Try rapid button clicks: focus on dashboard
  await page.locator('[data-testid="sidenav-item-dashboard"]').click();
  await page.waitForTimeout(1500);

  fs.writeFileSync('artifacts/palette-events.log', events.join('\n'));
  console.log('Events:', events.length);
  for (const e of events.slice(0, 30)) console.log(e);
  await browser.close();
});
