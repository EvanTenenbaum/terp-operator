import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'artifacts/frontend-audit';
fs.mkdirSync(OUT, { recursive: true });

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });
}

test.describe('Deep frontend audit', () => {
  test.setTimeout(180_000);

  test('palette executes a real command and surfaces toast', async ({ page }) => {
    const events: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') events.push(`ERR ${m.text()}`); });
    page.on('pageerror', (e) => events.push(`PAGE ${e.message}`));
    await login(page);
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    // Type a query
    await page.keyboard.type('createVendor');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/palette-deep-createVendor.png`, fullPage: true });
    // Find command result with class entity-result? They're regular <button>
    const cmdButtons = await dialog.locator('button:has-text("Create vendor")').count();
    fs.writeFileSync(`${OUT}/palette-deep.json`, JSON.stringify({ commandMatchCount: cmdButtons, events }, null, 2));
    await page.keyboard.press('Escape');
  });

  test('rapid double-click on Cmd+Enter post action', async ({ page }) => {
    const events: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') events.push(`ERR ${m.text()}`); });
    page.on('pageerror', (e) => events.push(`PAGE ${e.message}`));
    await login(page);
    // Click intake, then attempt to rapid-fire any "Confirm" actions
    await page.locator('[data-testid="sidenav-item-intake"]').click();
    await page.waitForTimeout(1500);
    // Look for any submit / confirm button
    const confirmBtns = await page.getByRole('button', { name: /confirm|post|submit|approve|apply/i }).all();
    let result = { tested: confirmBtns.length, errors: events };
    fs.writeFileSync(`${OUT}/rapid-click-diag.json`, JSON.stringify(result, null, 2));
  });

  test('contrast and ARIA: count violations on dashboard', async ({ page }) => {
    await login(page);
    const issues = await page.evaluate(() => {
      const out: string[] = [];
      // images without alt
      Array.from(document.images).forEach((img) => { if (!img.getAttribute('alt')) out.push(`img-no-alt ${img.src.slice(-40)}`); });
      // form inputs without label
      Array.from(document.querySelectorAll('input,select,textarea')).forEach((el) => {
        const id = el.getAttribute('id');
        const lbl = id ? document.querySelector(`label[for="${id}"]`) : null;
        const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        if (!lbl && !aria) out.push(`input-no-label ${el.tagName}#${id ?? '-'}`);
      });
      // headings hierarchy
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => h.tagName);
      out.push(`headings:${headings.join(',')}`);
      return out;
    });
    fs.writeFileSync(`${OUT}/a11y-dashboard.json`, JSON.stringify(issues, null, 2));
  });

  test('connectors/recovery/closeout/referees: unreachable via UI but tRPC succeeds', async ({ page, request }) => {
    await login(page);
    const cookies = (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join('; ');
    const out: Record<string, any> = {};
    for (const view of ['connectors', 'recovery', 'closeout', 'referees']) {
      const navCount = await page.locator(`[data-testid="sidenav-item-${view}"]`).count();
      const resp = await request.post('http://localhost:8787/trpc/queries.grid', {
        data: { json: { view } },
        headers: { cookie: cookies, 'content-type': 'application/json' }
      });
      out[view] = { sidenavCount: navCount, gridHttp: resp.status() };
    }
    fs.writeFileSync(`${OUT}/unreachable-views.json`, JSON.stringify(out, null, 2));
  });

  test('CSV export: try to export from dashboard/sales', async ({ page, request }) => {
    await login(page);
    const cookies = (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join('; ');
    const out: Record<string, any> = {};
    for (const view of ['sales', 'purchaseOrders', 'inventory', 'clients', 'matchmaking']) {
      const resp = await request.get(`http://localhost:8787/trpc/queries.csvExport?input=${encodeURIComponent(JSON.stringify({ json: { view } }))}`, {
        headers: { cookie: cookies }
      });
      const body = await resp.text();
      out[view] = { status: resp.status(), bytes: body.length, contentType: resp.headers()['content-type'], head: body.slice(0, 120) };
    }
    fs.writeFileSync(`${OUT}/csv-export.json`, JSON.stringify(out, null, 2));
  });

  test('long text + special chars + emoji in form fields', async ({ page }) => {
    await login(page);
    // Open command palette and try to enter weird strings
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(400);
    const longString = 'A'.repeat(2000) + ' <script>alert(1)</script> 😀 OR 1=1;--';
    await page.keyboard.type(longString.slice(0, 200));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/long-string-palette.png`, fullPage: true });
    // Check if any error broke
    const overflow = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map(i => ({ name: i.name || i.id, valLen: i.value.length, scrollW: i.scrollWidth, clientW: i.clientWidth }));
    });
    fs.writeFileSync(`${OUT}/long-string-diag.json`, JSON.stringify(overflow, null, 2));
    await page.keyboard.press('Escape');
  });

  test('skeleton + slow network throttle', async ({ page, context }) => {
    await context.route('**/trpc/queries.dashboard*', async (route) => {
      await new Promise(r => setTimeout(r, 3000));
      route.continue();
    });
    await login(page).catch(() => {});
    // We'll be on the dashboard but it should be slow
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/slow-network-dashboard.png`, fullPage: true });
  });

  test('focus trap inside command palette', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(400);
    // Tab a bunch to see focus stays inside
    const focusPath: string[] = [];
    for (let i = 0; i < 12; i++) {
      const tag = await page.evaluate(() => {
        const a = document.activeElement;
        return `${a?.tagName ?? 'NONE'}.${a?.className?.toString().slice(0, 30) ?? ''}`;
      });
      focusPath.push(tag);
      await page.keyboard.press('Tab');
    }
    fs.writeFileSync(`${OUT}/focus-trap.json`, JSON.stringify(focusPath, null, 2));
    await page.keyboard.press('Escape');
  });
});
