import { expect, test, type Page } from '@playwright/test';
import type { CommandName } from '../../src/shared/commandCatalog';

async function login(page: Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Owner Daily Decision View').waitFor();
}

async function trpcQuery(page: Page, path: string, inputValue: unknown = null) {
  return page.evaluate(async ({ queryPath, queryInput }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: queryInput } }));
    return (await fetch(`/trpc/${queryPath}?batch=1&input=${input}`, { credentials: 'include' })).json();
  }, { queryPath: path, queryInput: inputValue });
}

async function runCommand(page: Page, name: CommandName, payload: Record<string, unknown>, reason = 'roadmap final gate') {
  return page.evaluate(
    async ({ commandName, commandPayload, commandReason }) => {
      const response = await fetch('/trpc/commands.run?batch=1', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          0: {
            json: {
              name: commandName,
              payload: commandPayload,
              reason: commandReason,
              idempotencyKey: `${commandName}-${crypto.randomUUID()}`
            }
          }
        })
      });
      return response.json();
    },
    { commandName: name, commandPayload: payload, commandReason: reason }
  );
}

function commandData(response: unknown) {
  return (response as Array<{ result?: { data?: { json?: unknown } } }>)[0]?.result?.data?.json as { ok: boolean; toast?: string; commandId?: string };
}

test.describe('roadmap final gate', () => {
  test('reports route and inventory transitions are visible, selected-row surfaces', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    const nav = page.getByRole('navigation');

    await nav.getByRole('button', { name: 'Reports' }).click();
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revenue', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aging inventory', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Revenue report \d+ row/ })).toBeVisible();
    await page.getByRole('button', { name: 'Category analytics', exact: true }).click();
    await expect(page.getByRole('button', { name: /Category analytics report \d+ row/ })).toBeVisible();

    await nav.getByRole('button', { name: 'Inventory' }).click();
    // "Inventory controls" section heading was removed; select a row first to activate
    // SelectionSummary and the "Row actions" toggle, then open the action menu.
    await page.locator('.ag-root:visible').first().locator('.ag-center-cols-container .ag-row').first().click();
    await page.getByRole('button', { name: 'Row actions' }).click();
    await expect(page.getByRole('button', { name: 'Set status' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move location' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move ownership' })).toBeVisible();
  });

  test('operator vocabulary search and closeout archive safety stay aligned with backend truth', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    for (const q of ['m15', '25 flex', 'rich', 'ofc']) {
      const search = await trpcQuery(page, 'queries.globalSearch', { q });
      const groups = search[0].result.data.json.groups;
      expect(Object.values(groups).some((rows) => Array.isArray(rows) && rows.length > 0), q).toBe(true);
    }

    const period = new Date().toISOString().slice(0, 7);
    const locked = commandData(await runCommand(page, 'lockPeriod', { period }, 'roadmap final gate lock period'));
    expect(locked.ok).toBe(false);
    expect(locked.toast).toContain('cannot be locked yet');
    const preview = await trpcQuery(page, 'queries.closeoutPreview', { period });
    const safety = preview[0].result.data.json;
    expect(safety.locked).toBe(false);
    expect(safety.openWorkCount).toBeGreaterThan(0);
    expect(safety.unsafeRows).toBe(safety.openWorkCount);
    expect(safety.blockers.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining(['unsafePurchaseOrders']));
    expect(safety.blockers.map((row: { label: string }) => row.label.toLowerCase()).join(' ')).not.toContain('unsafe');

    const archive = commandData(await runCommand(page, 'archivePeriod', { period, verified: true }, 'roadmap final gate open-work archive'));
    expect(archive.ok).toBe(false);
    expect(archive.toast).toContain('must be locked');
  });
});
