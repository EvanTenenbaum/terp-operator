import { expect, test, type Page } from '@playwright/test';
import type { CommandName } from '../../src/shared/commandCatalog';

async function login(page: Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
  const response = await page.request.post('/trpc/auth.login?batch=1', {
    data: {
      0: {
        json: {
          email: 'owner@terpagro.local',
          password: 'terp-demo'
        }
      }
    }
  });
  expect(response.ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });
}

async function trpcQuery(page: Page, path: string, inputValue: unknown = null) {
  return page.evaluate(async ({ queryPath, queryInput }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: queryInput } }));
    return (await fetch(`/trpc/${queryPath}?batch=1&input=${input}`, { credentials: 'include' })).json();
  }, { queryPath: path, queryInput: inputValue });
}

async function runCommand(page: Page, name: CommandName, payload: Record<string, unknown>, reason = 'tags matchmaking e2e') {
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
      return { status: response.status, json: await response.json() };
    },
    { commandName: name, commandPayload: payload, commandReason: reason }
  );
}

function commandData(response: Awaited<ReturnType<typeof runCommand>>) {
  return response.json[0]?.result?.data?.json as { ok: boolean; commandId: string; affectedIds: string[]; toast?: string; delta?: Record<string, unknown> };
}

test.describe('tags and deterministic matchmaking', () => {
  test('purchase and intake tags stay searchable and sliceable after receiving', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const vendor = reference[0].result.data.json.vendors[0];

    const po = commandData(await runCommand(page, 'createPurchaseOrder', { vendorId: vendor.id }, 'QA tagged purchase order'));
    expect(po.ok).toBe(true);
    const purchaseOrderId = po.affectedIds[0];

    const line = commandData(
      await runCommand(page, 'addPurchaseOrderLine', {
        purchaseOrderId,
        productName: 'QA Tagged Candy',
        category: 'Infused',
        tags: ['QA Tag Candy', 'Premium'],
        qty: 3,
        unitCost: 12,
        unitPrice: 22
      })
    );
    expect(line.ok).toBe(true);

    expect(commandData(await runCommand(page, 'approvePurchaseOrder', { purchaseOrderId })).ok).toBe(true);
    expect(commandData(await runCommand(page, 'receivePurchaseOrder', { purchaseOrderId })).ok).toBe(true);

    const intakeRows = await trpcQuery(page, 'queries.grid', { view: 'intake' });
    const linkedDraft = intakeRows[0].result.data.json.find((row: { purchaseOrderId?: string }) => row.purchaseOrderId === purchaseOrderId);
    expect(linkedDraft.tags).toEqual(expect.arrayContaining(['qa-tag-candy', 'premium']));

    const retagged = commandData(
      await runCommand(page, 'applyTags', {
        entityType: 'batch',
        entityId: linkedDraft.id,
        tags: ['qa-report-slice', 'premium'],
        mode: 'replace'
      })
    );
    expect(retagged.ok).toBe(true);

    const search = await trpcQuery(page, 'queries.globalSearch', { q: 'qa-report-slice' });
    expect(search[0].result.data.json.groups.batches.some((row: { id: string }) => row.id === linkedDraft.id)).toBe(true);

    const inventoryRows = await trpcQuery(page, 'queries.grid', { view: 'inventory' });
    expect(inventoryRows[0].result.data.json.find((row: { id: string }) => row.id === linkedDraft.id).tags).toEqual(['qa-report-slice', 'premium']);

    const stringEdited = commandData(await runCommand(page, 'updateBatch', { batchId: linkedDraft.id, tags: 'premium, string-slice' }, 'QA plain text tag edit'));
    expect(stringEdited.ok).toBe(true);
    const stringEditedInventory = await trpcQuery(page, 'queries.grid', { view: 'inventory' });
    expect(stringEditedInventory[0].result.data.json.find((row: { id: string }) => row.id === linkedDraft.id).tags).toEqual(['premium', 'string-slice']);
  });

  test('matchmaking connects customer needs to vendor stock without ledger mutation', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const customer = reference[0].result.data.json.customers[0];
    const vendor = reference[0].result.data.json.vendors[0];

    const need = commandData(
      await runCommand(page, 'createCustomerNeed', {
        customerId: customer.id,
        productName: 'QA Match Indoor Flower',
        category: 'Flower',
        tags: ['qa-match', 'premium'],
        qtyMin: 10,
        qtyMax: 30,
        targetPrice: 950,
        urgency: 'high',
        notes: 'Needs product even if not currently on hand'
      })
    );
    expect(need.ok).toBe(true);
    const customerNeedId = need.affectedIds[0];

    const supply = commandData(
      await runCommand(page, 'createVendorSupply', {
        vendorId: vendor.id,
        productName: 'QA Match Vendor Flower',
        category: 'Flower',
        tags: ['qa-match', 'premium'],
        availableQty: 20,
        askingPrice: 900,
        location: 'Vendor vault',
        terms: 'Can deliver tomorrow'
      })
    );
    expect(supply.ok).toBe(true);
    const vendorSupplyId = supply.affectedIds[0];

    const siblingSupply = commandData(
      await runCommand(page, 'createVendorSupply', {
        vendorId: vendor.id,
        productName: 'QA Match Backup Flower',
        category: 'Flower',
        tags: ['qa-match', 'premium'],
        availableQty: 15,
        askingPrice: 910
      })
    );
    expect(siblingSupply.ok).toBe(true);
    const siblingSupplyId = siblingSupply.affectedIds[0];

    const board = await trpcQuery(page, 'queries.matchmakingBoard');
    const match = board[0].result.data.json.matches.find((row: { customerNeedId: string; vendorSupplyId: string }) => row.customerNeedId === customerNeedId && row.vendorSupplyId === vendorSupplyId);
    const siblingMatch = board[0].result.data.json.matches.find((row: { customerNeedId: string; vendorSupplyId: string }) => row.customerNeedId === customerNeedId && row.vendorSupplyId === siblingSupplyId);
    expect(match).toEqual(expect.objectContaining({ status: 'open', score: expect.any(Number) }));
    expect(siblingMatch).toEqual(expect.objectContaining({ status: 'open', score: expect.any(Number) }));
    expect(match.score).toBeGreaterThanOrEqual(35);
    expect(match.reasons.join(' ')).toContain('Category match');

    const accepted = commandData(await runCommand(page, 'acceptMatchmakingMatch', { matchId: match.id }));
    expect(accepted.ok).toBe(true);

    const acceptedBoard = await trpcQuery(page, 'queries.matchmakingBoard');
    const acceptedMatch = acceptedBoard[0].result.data.json.matches.find((row: { id: string }) => row.id === match.id);
    const dismissedSibling = acceptedBoard[0].result.data.json.matches.find((row: { id: string }) => row.id === siblingMatch.id);
    const matchedNeed = acceptedBoard[0].result.data.json.needs.find((row: { id: string }) => row.id === customerNeedId);
    const heldSupply = acceptedBoard[0].result.data.json.supplies.find((row: { id: string }) => row.id === vendorSupplyId);
    expect(acceptedMatch.status).toBe('accepted');
    expect(dismissedSibling.status).toBe('dismissed');
    expect(acceptedBoard[0].result.data.json.matches.filter((row: { customerNeedId: string; status: string }) => row.customerNeedId === customerNeedId && row.status === 'open')).toHaveLength(0);
    expect(matchedNeed.status).toBe('matched');
    expect(heldSupply.status).toBe('held_for_match');
  });

  test('matchmaking workspace exposes quick entry and compact operator actions', async ({ page }) => {
    await login(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Matchmaking' }).click();

    await expect(page.getByRole('button', { name: 'Matchmaking Entry', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Need' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Vendor Stock' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Deterministic Matches \d+ row/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Customer Needs \d+ row/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Vendor Stock \d+ row/ })).toBeVisible();
    await page.locator('.ag-root:visible').first().locator('.ag-center-cols-container .ag-row').first().click();
    await expect(page.getByRole('button', { name: 'Accept' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dismiss' }).first()).toBeVisible();
  });
});
