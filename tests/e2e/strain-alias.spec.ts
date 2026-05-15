import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CommandName } from '../../src/shared/commandCatalog';

async function login(page: Page, email = 'owner@terpagro.local') {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/Daily Decision View/).waitFor();
}

async function trpcQuery(page: Page, path: string, inputValue: unknown = null) {
  return page.evaluate(async ({ queryPath, queryInput }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: queryInput } }));
    const response = await fetch(`/trpc/${queryPath}?batch=1&input=${input}`, { credentials: 'include' });
    return response.json();
  }, { queryPath: path, queryInput: inputValue });
}

function queryData<T = unknown>(response: unknown): T {
  return (response as { 0: { result: { data: { json: T } } } })[0].result.data.json;
}

async function runCommand(page: Page, name: CommandName, payload: Record<string, unknown>, reason = 'strain alias e2e') {
  return page.evaluate(
    async ({ commandName, commandPayload, commandReason }) => {
      const body = {
        0: {
          json: {
            name: commandName,
            payload: commandPayload,
            reason: commandReason,
            idempotencyKey: `${commandName}-${crypto.randomUUID()}`
          }
        }
      };
      const response = await fetch('/trpc/commands.run?batch=1', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      return response.json();
    },
    { commandName: name, commandPayload: payload, commandReason: reason }
  );
}

function commandData(response: unknown) {
  return (response as { 0: { result: { data: { json: { ok: boolean; commandId: string; affectedIds: string[]; toast?: string } } } } })[0].result.data.json;
}

test('strain alias surfaces on customer-facing rows while vendor surfaces keep canonical name', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);

  const reference = queryData<{ items: Array<{ id: string; name: string; alias: string | null }>; customers: Array<{ id: string; name: string }>; availableBatches: Array<{ id: string; itemId: string | null; name: string; batchCode: string }> }>(await trpcQuery(page, 'queries.reference'));
  const candy = reference.items.find((row) => row.name === 'Infused Candy');
  expect(candy, 'seed item Infused Candy must exist').toBeTruthy();
  const candyBatch = reference.availableBatches.find((row) => row.itemId === candy!.id);
  expect(candyBatch, 'seed batch for candy item must exist').toBeTruthy();
  const customer = reference.customers.find((row) => /sunset/i.test(row.name)) ?? reference.customers[0];
  expect(customer).toBeTruthy();

  // Reset to known state: clear any prior alias so the change is a real transition we can reverse.
  if (candy!.alias) {
    await runCommand(page, 'setItemAlias', { itemId: candy!.id, alias: '' }, 'Reset strain alias before test');
  }

  const aliasResult = commandData(await runCommand(page, 'setItemAlias', { itemId: candy!.id, alias: 'Springtime Candy' }, 'Set strain alias for customer-facing view'));
  expect(aliasResult.ok).toBe(true);
  const aliasCommandId = aliasResult.commandId;
  expect(aliasResult.toast).toContain('Springtime Candy');

  const refRefreshed = queryData<{ items: Array<{ id: string; alias: string | null; name: string }> }>(await trpcQuery(page, 'queries.reference'));
  const aliasedItem = refRefreshed.items.find((row) => row.id === candy!.id);
  expect(aliasedItem?.alias).toBe('Springtime Candy');

  const inventoryRows = queryData<Array<{ id: string; name: string; itemAlias: string | null; displayName: string }>>(await trpcQuery(page, 'queries.grid', { view: 'inventory' }));
  const inventoryRow = inventoryRows.find((row) => row.id === candyBatch!.id);
  expect(inventoryRow?.itemAlias).toBe('Springtime Candy');
  expect(inventoryRow?.displayName).toBe('Springtime Candy');
  expect(inventoryRow?.name).toBe('Infused Candy 10mg');

  const order = commandData(await runCommand(page, 'createSalesOrder', { customerId: customer.id }, 'Create SO for strain alias test'));
  expect(order.ok).toBe(true);
  const orderId = order.affectedIds[0];

  const addLine = commandData(await runCommand(page, 'addSalesOrderLine', { orderId, batchId: candyBatch!.id, qty: 1, sourceRowKey: candyBatch!.batchCode }, 'Add candy line'));
  expect(addLine.ok).toBe(true);

  const lines = queryData<Array<{ id: string; itemName: string; displayName: string; itemAlias: string | null }>>(await trpcQuery(page, 'queries.salesOrderLines', { orderId }));
  const lineRow = lines[0];
  expect(lineRow.itemName).toBe('Infused Candy 10mg');
  // PO line keeps the canonical (item-level) name from PO creation, separate from batch.name
  expect(lineRow.displayName).toBe('Springtime Candy');
  expect(lineRow.itemAlias).toBe('Springtime Candy');

  const purchaseOrderRows = queryData<Array<{ id: string; poNo: string }>>(await trpcQuery(page, 'queries.grid', { view: 'purchaseOrders' }));
  const candyPo = purchaseOrderRows.find((row) => row.poNo === 'PO-DEMO-001');
  expect(candyPo, 'PO-DEMO-001 must exist in seed').toBeTruthy();
  const poLines = queryData<Array<{ productName: string }>>(await trpcQuery(page, 'queries.purchaseOrderLines', { purchaseOrderId: candyPo!.id }));
  const candyPoLine = poLines.find((row) => /candy/i.test(row.productName));
  expect(candyPoLine, 'candy PO line must exist').toBeTruthy();
  expect(candyPoLine!.productName).not.toBe('Springtime Candy');
  expect(/candy/i.test(candyPoLine!.productName)).toBe(true);

  const reversal = commandData(await runCommand(page, 'reverseCommandById', { commandId: aliasCommandId }, 'Reverse strain alias command'));
  expect(reversal.ok).toBe(true);
  const refAfterReverse = queryData<{ items: Array<{ id: string; alias: string | null }> }>(await trpcQuery(page, 'queries.reference'));
  const restoredItem = refAfterReverse.items.find((row) => row.id === candy!.id);
  expect(restoredItem?.alias).toBeNull();

  const inventoryAfterReverse = queryData<Array<{ id: string; itemAlias: string | null }>>(await trpcQuery(page, 'queries.grid', { view: 'inventory' }));
  const inventoryAfter = inventoryAfterReverse.find((row) => row.id === candyBatch!.id);
  expect(inventoryAfter?.itemAlias).toBeNull();

  const linesAfter = queryData<Array<{ displayName: string }>>(await trpcQuery(page, 'queries.salesOrderLines', { orderId }));
  expect(linesAfter[0].displayName).toBe('Springtime Candy');
});
