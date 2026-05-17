import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'artifacts/frontend-audit';
fs.mkdirSync(OUT, { recursive: true });

type Diag = { view: string; errors: string[]; warnings: string[]; pageErrors: string[]; status: 'load' | 'blank' | 'error' | 'missing'; notes: string[] };

const views = [
  'dashboard',
  'reports',
  'purchaseOrders',
  'intake',
  'sales',
  'matchmaking',
  'orders',
  'payments',
  'inventory',
  'clients',
  'vendors',
  'fulfillment',
  'connectors',
  'recovery',
  'closeout',
  'referees',
  'settings'
];

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });
}

function attachConsole(page: Page, diag: Diag) {
  page.on('console', (m: ConsoleMessage) => {
    const text = `[${m.type()}] ${m.text()}`;
    if (m.type() === 'error') diag.errors.push(text);
    if (m.type() === 'warning') diag.warnings.push(text);
  });
  page.on('pageerror', (err) => diag.pageErrors.push(err.message));
  page.on('requestfailed', (req) => diag.errors.push(`REQUEST_FAILED ${req.url()} ${req.failure()?.errorText}`));
}

test.describe('Dynamic Frontend Audit Part 2', () => {
  test.setTimeout(180_000);

  test('view coverage matrix + grid sanity + a11y spot checks', async ({ page }) => {
    const matrix: Diag[] = [];
    const globalDiag: Diag = { view: 'GLOBAL', errors: [], warnings: [], pageErrors: [], status: 'load', notes: [] };
    attachConsole(page, globalDiag);

    await login(page);
    await page.screenshot({ path: `${OUT}/00-post-login-dashboard.png`, fullPage: true });

    // Test nav: find sidenav buttons that exist
    const navButtons = await page.locator('[data-testid^="sidenav-item-"]').all();
    const navViewKeys = (await Promise.all(navButtons.map((b) => b.getAttribute('data-testid')))).map((s) => s?.replace('sidenav-item-', ''));
    globalDiag.notes.push(`Nav-visible views (owner): ${navViewKeys.join(', ')}`);

    for (const view of views) {
      const diag: Diag = { view, errors: [], warnings: [], pageErrors: [], status: 'load', notes: [] };
      attachConsole(page, diag);

      const navItem = page.locator(`[data-testid="sidenav-item-${view}"]`);
      const isInNav = (await navItem.count()) > 0;
      if (!isInNav) {
        diag.notes.push('Not present in sidenav for owner role');
        // Try to navigate by manipulating store directly via console
        try {
          await page.evaluate((v) => {
            // try to set activeView via zustand store if exposed
            const win = window as any;
            if (win.__terpStore) win.__terpStore.setActiveView(v);
          }, view);
        } catch {}
        // Take screenshot of current state
        await page.screenshot({ path: `${OUT}/view-${view}-MISSING.png`, fullPage: true });
        diag.status = 'missing';
        matrix.push(diag);
        continue;
      }

      try {
        await navItem.click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        // Detect blank: check that body has visible content (height > 100 of non-nav)
        const bodyText = await page.locator('main, [role="main"], body').first().innerText();
        if (!bodyText || bodyText.trim().length < 5) {
          diag.status = 'blank';
        }
        // Detect Vite overlay
        const overlay = await page.locator('vite-error-overlay').count();
        if (overlay > 0) diag.status = 'error';

        await page.screenshot({ path: `${OUT}/view-${view}.png`, fullPage: true });

        // Spot a11y: count buttons w/o aria-label and not visible text
        const unlabeled = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.filter((b) => !b.getAttribute('aria-label') && (b.textContent || '').trim().length === 0).length;
        });
        if (unlabeled > 0) diag.notes.push(`unlabeled buttons: ${unlabeled}`);

        // Count grid columns for AG Grid pages
        const colCount = await page.locator('.ag-header-cell:visible').count();
        if (colCount > 0) diag.notes.push(`visible AG header cells: ${colCount}`);
        if (colCount > 8) diag.notes.push(`>8 columns visible (Numbers-native violation candidate)`);
      } catch (e: any) {
        diag.status = 'error';
        diag.notes.push(`exception during navigation: ${e.message}`);
      }
      matrix.push(diag);
    }

    fs.writeFileSync(`${OUT}/view-matrix.json`, JSON.stringify({ globalDiag, matrix }, null, 2));
  });

  test('command palette open/list/execute', async ({ page }) => {
    const diag: Diag = { view: 'palette', errors: [], warnings: [], pageErrors: [], status: 'load', notes: [] };
    attachConsole(page, diag);
    await login(page);
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    const dialog = page.getByRole('dialog');
    const palOpen = await dialog.count();
    diag.notes.push(`palette dialog count: ${palOpen}`);
    await page.screenshot({ path: `${OUT}/palette-01-open.png`, fullPage: true });
    await page.keyboard.type('createReferee');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/palette-02-typed-createReferee.png`, fullPage: true });
    const visibleResults = await page.locator('[role="option"], [role="menuitem"], .palette-item').count();
    diag.notes.push(`palette result candidates: ${visibleResults}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const stillOpen = await dialog.count();
    diag.notes.push(`palette open after Escape: ${stillOpen}`);
    fs.writeFileSync(`${OUT}/palette-diag.json`, JSON.stringify(diag, null, 2));
  });

  test('hotkeys + drawer + esc behavior', async ({ page }) => {
    const diag: Diag = { view: 'hotkeys', errors: [], warnings: [], pageErrors: [], status: 'load', notes: [] };
    attachConsole(page, diag);
    await login(page);

    // Press Cmd+1..6 and screenshot
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await page.keyboard.press(`Meta+${n}`);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/hotkey-cmd${n}.png`, fullPage: true });
    }

    // Open a drawer if possible by clicking first row in intake
    await page.locator('[data-testid="sidenav-item-intake"]').click();
    await page.waitForTimeout(1200);
    const firstRow = page.locator('.ag-center-cols-container .ag-row').first();
    if ((await firstRow.count()) > 0) {
      await firstRow.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/drawer-after-row-click.png`, fullPage: true });
      // try escape to close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/drawer-after-escape.png`, fullPage: true });
    } else {
      diag.notes.push('no rows in intake view to click');
    }

    fs.writeFileSync(`${OUT}/hotkeys-diag.json`, JSON.stringify(diag, null, 2));
  });

  test('empty states + responsive + edge cases', async ({ page }) => {
    const diag: Diag = { view: 'edge', errors: [], warnings: [], pageErrors: [], status: 'load', notes: [] };
    attachConsole(page, diag);
    await login(page);

    // referees should be empty
    const refNav = page.locator('[data-testid="sidenav-item-referees"]');
    if ((await refNav.count()) > 0) {
      await refNav.click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/empty-referees.png`, fullPage: true });
    }

    // resize to tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/responsive-tablet-768.png`, fullPage: true });
    // resize to mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/responsive-mobile-390.png`, fullPage: true });
    // back to desktop
    await page.setViewportSize({ width: 1440, height: 900 });

    // Browser back button
    await page.locator('[data-testid="sidenav-item-dashboard"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-testid="sidenav-item-sales"]').click();
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/back-button.png`, fullPage: true });

    // Reload mid-state
    await page.reload();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/reload-state.png`, fullPage: true });

    fs.writeFileSync(`${OUT}/edge-diag.json`, JSON.stringify(diag, null, 2));
  });

  test('two tabs sync check', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p1 = await ctx.newPage();
    const p2 = await ctx.newPage();
    const d1: Diag = { view: 'tab1', errors: [], warnings: [], pageErrors: [], status: 'load', notes: [] };
    const d2: Diag = { view: 'tab2', errors: [], warnings: [], pageErrors: [], status: 'load', notes: [] };
    attachConsole(p1, d1);
    attachConsole(p2, d2);
    await login(p1);
    await p2.goto('/');
    await p2.waitForTimeout(2000);
    // log in p2 too
    if ((await p2.getByLabel('Email').count()) > 0) {
      await p2.getByLabel('Email').fill('owner@terpagro.local');
      await p2.getByLabel('Password').fill('terp-demo');
      await p2.getByRole('button', { name: 'Sign in' }).click();
      await p2.waitForTimeout(3000);
    }
    await p1.locator('[data-testid="sidenav-item-vendors"]').click();
    await p1.waitForTimeout(800);
    await p2.locator('[data-testid="sidenav-item-vendors"]').click();
    await p2.waitForTimeout(800);
    await p1.screenshot({ path: `${OUT}/multi-tab-p1.png`, fullPage: true });
    await p2.screenshot({ path: `${OUT}/multi-tab-p2.png`, fullPage: true });
    fs.writeFileSync(`${OUT}/multi-tab-diag.json`, JSON.stringify({ d1, d2 }, null, 2));
    await ctx.close();
  });
});
