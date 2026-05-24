/**
 * Phase 5 receipt proof: finalize → copy for Signal → print external → print internal
 *
 * Tests the full ReceiptPanel loop against mocked tRPC responses so the test
 * runs without a seeded DB. All four procedures (paymentExternalReceipt,
 * paymentInternalReceipt, paymentSignalText, paymentPrintHtml) are intercepted
 * via page.route; all other tRPC requests fall through to the real server.
 *
 * NOTE: tRPC is mounted at /trpc (not /api/trpc). The httpBatchLink URL in
 * src/client/api/trpc.ts uses '/trpc' as the base.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock HTML fixtures
// ---------------------------------------------------------------------------

const EXTERNAL_HTML = `<!doctype html><html><head><title>Payment Received</title></head><body><h1>Payment Received PAY-001</h1><p>To: Test Vendor \u2014 2026-05-22</p><p>Total: 500</p></body></html>`;

const INTERNAL_HTML = `<!doctype html><html><head><title>Payment Received</title></head><body><div data-testid="watermark" style="position:fixed;top:40%;left:0;width:100%;text-align:center;font-size:3em;color:rgba(200,0,0,0.18);transform:rotate(-30deg);pointer-events:none;z-index:1000;font-weight:bold">INTERNAL \u2014 DO NOT SEND</div><h1>Payment Received PAY-001</h1><p>To: Test Vendor \u2014 2026-05-22</p></body></html>`;

// ---------------------------------------------------------------------------
// Mock projection data (returned as tRPC query results)
// ---------------------------------------------------------------------------

const externalProjection = {
  kind: 'payment_received',
  header: { title: 'Payment Received', counterparty: 'Test Vendor', dateISO: '2026-05-22', documentNo: 'PAY-001' },
  lines: [] as unknown[],
  totals: { subtotal: 500, total: 500 },
  projectionVersion: 1,
  __EXTERNAL_PROJECTED__: true,
};

const internalProjection = {
  kind: 'payment_received',
  header: { title: 'Payment Received', counterparty: 'Test Vendor', dateISO: '2026-05-22', documentNo: 'PAY-001' },
  lines: [] as unknown[],
  totals: { subtotal: 500, total: 500 },
  internalNotes: 'cash \u2014 partial allocation',
  projectionVersion: 1,
  __INTERNAL_ONLY__: true,
};

// ---------------------------------------------------------------------------
// The single proof test
// ---------------------------------------------------------------------------

test('Phase 5 receipt: finalize \u2192 copy for Signal \u2192 print external \u2192 print internal', async ({ page, context }) => {
  test.setTimeout(60_000);

  // Set up route mocks BEFORE login so they are active throughout the session.
  // Only intercept batch requests that contain payment receipt procedures; let
  // everything else (auth, payments grid, etc.) fall through to the real server.
  await page.route('**/trpc/**', async route => {
    const url = route.request().url();

    // Only intercept receipt-related batch requests
    if (
      !url.includes('payment') ||
      (!url.includes('ExternalReceipt') &&
        !url.includes('InternalReceipt') &&
        !url.includes('SignalText') &&
        !url.includes('PrintHtml'))
    ) {
      await route.continue();
      return;
    }

    // Parse procedure list from URL path (before the ?)
    const trpcPath = url.split('/trpc/')[1]?.split('?')[0] ?? '';
    const procedures = decodeURIComponent(trpcPath).split(',');

    // Parse batch input params
    const inputRaw = new URL(url).searchParams.get('input') ?? '{}';
    const batchInput = JSON.parse(inputRaw) as Record<string, unknown>;

    const responses = procedures.map((proc, idx) => {
      // Strip router prefix: "queries.paymentExternalReceipt" → "paymentExternalReceipt"
      const clean = proc.replace(/^[^.]*\./, '');

      if (clean === 'paymentExternalReceipt') {
        return { result: { data: { json: externalProjection } } };
      }
      if (clean === 'paymentInternalReceipt') {
        return { result: { data: { json: internalProjection } } };
      }
      if (clean === 'paymentSignalText') {
        return { result: { data: { json: 'Payment Received PAY-001\nTo: Test Vendor\nTotal: 500' } } };
      }
      if (clean === 'paymentPrintHtml') {
        const procInputWrapper = batchInput[String(idx)] as { json?: { audience?: string } } | undefined;
        const procInput = procInputWrapper?.json;
        const isInternal = procInput?.audience === 'internal';
        return { result: { data: { json: isInternal ? INTERNAL_HTML : EXTERNAL_HTML } } };
      }
      return { result: { data: { json: null } } };
    });

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(responses) });
  });

  // ---------------------------------------------------------------------------
  // 1. Login
  // ---------------------------------------------------------------------------
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });

  // ---------------------------------------------------------------------------
  // 2. Navigate to Payments view
  // ---------------------------------------------------------------------------
  await page.getByTestId('sidenav-item-payments').click();
  await page.waitForLoadState('networkidle');

  // ---------------------------------------------------------------------------
  // 3. Select first payment row to trigger ReceiptPanel rendering
  // ---------------------------------------------------------------------------
  await page.locator('.ag-row').first().click();

  // ---------------------------------------------------------------------------
  // 4. Wait for ReceiptPanel and enabled Print button
  // ---------------------------------------------------------------------------
  await expect(page.getByTestId('receipt-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('receipt-print')).toBeEnabled({ timeout: 5_000 });

  // ---------------------------------------------------------------------------
  // 5. Copy for Signal
  // ---------------------------------------------------------------------------
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('receipt-copy-signal').click();
  const signalText = await page.evaluate(() => navigator.clipboard.readText());
  expect(signalText).toContain('PAY-001');

  // ---------------------------------------------------------------------------
  // 6. Intercept window.open so we can capture the HTML written to the popup
  //    without triggering a real print dialog.
  // ---------------------------------------------------------------------------
  await page.evaluate(() => {
    (window as any).__capturedPrintHtml = '';
    const origOpen = window.open.bind(window);
    (window as any).open = (...args: unknown[]) => {
      const win = origOpen(...(args as Parameters<typeof window.open>)) as Window | null;
      if (win?.document) {
        const origWrite = win.document.write.bind(win.document);
        win.document.write = (...markups: string[]) => {
          (window as any).__capturedPrintHtml = markups[0] ?? '';
          origWrite(...markups);
        };
      }
      return win;
    };
  });

  // ---------------------------------------------------------------------------
  // 7. Print on External tab
  // ---------------------------------------------------------------------------
  await page.getByTestId('receipt-print').click();
  let capturedHtml = await page.evaluate(() => (window as any).__capturedPrintHtml as string);
  expect(capturedHtml).not.toMatch(/<script/i);
  expect(capturedHtml).not.toContain('INTERNAL');

  // ---------------------------------------------------------------------------
  // 8. Switch to Internal tab and print
  // ---------------------------------------------------------------------------
  await page.getByTestId('receipt-tab-internal').click();
  // Wait for the print button to be enabled again (internal printHtmlQuery re-fetches)
  await expect(page.getByTestId('receipt-print')).toBeEnabled({ timeout: 5_000 });
  await page.getByTestId('receipt-print').click();
  capturedHtml = await page.evaluate(() => (window as any).__capturedPrintHtml as string);
  expect(capturedHtml).toContain('INTERNAL \u2014 DO NOT SEND');
  expect(capturedHtml).not.toMatch(/<script/i);
});
