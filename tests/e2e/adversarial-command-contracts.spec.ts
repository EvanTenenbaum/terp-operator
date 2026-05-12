import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CommandName } from '../../src/shared/commandCatalog';

async function login(page: Page, email = 'owner@terpagro.local') {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Owner Daily Decision View').waitFor();
}

async function trpcQuery(page: Page, path: string, inputValue: unknown = null) {
  return page.evaluate(async ({ queryPath, queryInput }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: queryInput } }));
    const response = await fetch(`/trpc/${queryPath}?batch=1&input=${input}`, { credentials: 'include' });
    return response.json();
  }, { queryPath: path, queryInput: inputValue });
}

async function runCommand(page: Page, name: CommandName, payload: Record<string, unknown>, reason = 'adversarial command contract') {
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
      return { status: response.status, json: await response.json() };
    },
    { commandName: name, commandPayload: payload, commandReason: reason }
  );
}

function commandData(response: Awaited<ReturnType<typeof runCommand>>) {
  return response.json[0]?.result?.data?.json;
}

function commandError(response: Awaited<ReturnType<typeof runCommand>>) {
  return response.json[0]?.error?.json?.message ?? response.json[0]?.error?.message;
}

test.describe('adversarial command contracts', () => {
  test('viewer role cannot mutate ledgers', async ({ page }) => {
    await login(page, 'viewer@terpagro.local');
    const result = await runCommand(page, 'createBatch', {
      name: 'Forbidden Batch',
      category: 'Flower',
      intakeQty: 1,
      unitCost: 1,
      unitPrice: 2
    });

    expect(result.status).toBe(403);
    expect(commandError(result)).toContain('requires operator access');
  });

  test('draft orders cannot bypass confirmation and credit checks by posting directly', async ({ page }) => {
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const customer = reference[0].result.data.json.customers.find((row: { name: string }) => row.name === 'Cobalt Reserve');
    const created = commandData(await runCommand(page, 'createSalesOrder', { customerId: customer.id }));

    const posted = commandData(await runCommand(page, 'postSalesOrder', { orderId: created.affectedIds[0] }));

    expect(posted.ok).toBe(false);
    expect(posted.toast).toContain('must be confirmed before posting');
  });

  test('posting refuses duplicate source rows even when the order is otherwise valid', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const customer = reference[0].result.data.json.customers.find((row: { name: string }) => row.name === 'Cobalt Reserve');
    const batch = reference[0].result.data.json.availableBatches.find((row: { availableQty: string }) => Number(row.availableQty) >= 2);
    const order = commandData(await runCommand(page, 'createSalesOrder', { customerId: customer.id }));
    const orderId = order.affectedIds[0];

    await runCommand(page, 'addSalesOrderLine', { orderId, batchId: batch.id, qty: 1, sourceRowKey: batch.batchCode });
    await runCommand(page, 'addSalesOrderLine', { orderId, batchId: batch.id, qty: 1, sourceRowKey: batch.batchCode });
    await runCommand(page, 'confirmSalesOrder', { orderId });
    const posted = commandData(await runCommand(page, 'postSalesOrder', { orderId }));

    expect(posted.ok).toBe(false);
    expect(posted.toast).toContain('appears more than once from the same source row');
  });

  test('money and warehouse commands reject unsafe no-op or premature actions', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const customer = reference[0].result.data.json.customers[0];
    const vendorRows = await trpcQuery(page, 'queries.grid', { view: 'vendors' });

    const zeroPayment = commandData(await runCommand(page, 'logPayment', { customerId: customer.id, amount: 0, method: 'cash' }));
    expect(zeroPayment.ok).toBe(false);
    expect(zeroPayment.toast).toContain('cannot be zero');

    const unscheduledBill = vendorRows[0].result.data.json.find((row: { status: string }) => row.status !== 'scheduled');
    const payout = commandData(await runCommand(page, 'recordVendorPayment', { vendorBillId: unscheduledBill.id }));
    expect(payout.ok).toBe(false);
    expect(payout.toast).toContain('Schedule this vendor payment');

    const fulfillmentRows = await trpcQuery(page, 'queries.grid', { view: 'fulfillment' });
    const pick = fulfillmentRows[0].result.data.json[0];
    const lines = await page.evaluate(async (pickListId) => {
      const input = encodeURIComponent(JSON.stringify({ 0: { json: { pickListId } } }));
      return (await (await fetch(`/trpc/queries.fulfillmentLines?batch=1&input=${input}`, { credentials: 'include' })).json())[0].result.data.json;
    }, pick.id);
    const packed = commandData(await runCommand(page, 'recordWeighAndPack', { fulfillmentLineId: lines[0].id, actualQty: 1 }));
    expect(packed.ok).toBe(false);
    expect(packed.toast).toContain('Actual weight must be greater than zero');
  });

  test('purchase orders are planned before receiving and do not post inventory/payables early', async ({ page }) => {
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const vendor = reference[0].result.data.json.vendors[0];
    const po = commandData(await runCommand(page, 'createPurchaseOrder', { vendorId: vendor.id }));
    expect(po.ok).toBe(true);
    const purchaseOrderId = po.affectedIds[0];

    const line = commandData(await runCommand(page, 'addPurchaseOrderLine', { purchaseOrderId, productName: 'QA Planned Flower', category: 'Flower', qty: 2, unitCost: 10, unitPrice: 16 }));
    expect(line.ok).toBe(true);

    const premature = commandData(await runCommand(page, 'receivePurchaseOrder', { purchaseOrderId }));
    expect(premature.ok).toBe(false);
    expect(premature.toast).toContain('Approve this purchase order');

    const approved = commandData(await runCommand(page, 'approvePurchaseOrder', { purchaseOrderId }));
    expect(approved.ok).toBe(true);

    const received = commandData(await runCommand(page, 'receivePurchaseOrder', { purchaseOrderId }));
    expect(received.ok).toBe(true);
    expect(received.toast).toContain('draft intake rows');

    const intakeRows = await trpcQuery(page, 'queries.grid', { view: 'intake' });
    const linkedDraft = intakeRows[0].result.data.json.find((row: { purchaseOrderId?: string }) => row.purchaseOrderId === purchaseOrderId);
    expect(linkedDraft.status).toBe('draft');
    expect(Number(linkedDraft.availableQty)).toBe(0);

    const vendorBills = await trpcQuery(page, 'queries.grid', { view: 'vendors' });
    expect(vendorBills[0].result.data.json.some((row: { purchaseOrderId?: string }) => row.purchaseOrderId === purchaseOrderId)).toBe(false);
  });

  test('payment reversal has real ledger consequences, not just an audit label', async ({ page }) => {
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const customer = reference[0].result.data.json.customers.find((row: { name: string }) => row.name === 'Cobalt Reserve');

    const credit = commandData(await runCommand(page, 'logPayment', { customerId: customer.id, amount: -100, method: 'cash', notes: 'adversarial buyer credit' }));
    expect(credit.ok).toBe(true);

    const withCredit = await trpcQuery(page, 'queries.grid', { view: 'clients' });
    expect(Number(withCredit[0].result.data.json.find((row: { id: string }) => row.id === customer.id).balance)).toBe(-100);

    const reversed = commandData(await runCommand(page, 'reverseCommandById', { commandId: credit.commandId }));
    expect(reversed.ok).toBe(true);

    const afterReverse = await trpcQuery(page, 'queries.grid', { view: 'clients' });
    expect(Number(afterReverse[0].result.data.json.find((row: { id: string }) => row.id === customer.id).balance)).toBe(0);
  });

  test('closeout archive enforces the same blockers preview reports', async ({ page }) => {
    await login(page);
    const period = new Date().toISOString().slice(0, 7);
    await runCommand(page, 'lockPeriod', { period }, 'lock current test period');

    const preview = await trpcQuery(page, 'queries.closeoutPreview', { period });
    const closeout = preview[0].result.data.json;
    expect(closeout.eligible).toBe(false);
    expect(closeout.unsafeRows).toBeGreaterThan(0);
    expect(closeout.blockers.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining(['unsafeBatches', 'unsafePurchaseOrders']));
    expect(closeout.controlTotals).toEqual(expect.objectContaining({ purchaseOrders: expect.any(Number), purchaseReceipts: expect.any(Number), invoices: expect.any(Number), payments: expect.any(Number), vendorBills: expect.any(Number), connectorRequests: expect.any(Number), fulfillment: expect.any(Number), commands: expect.any(Number) }));

    const archived = commandData(await runCommand(page, 'archivePeriod', { period }, 'try unsafe archive'));
    expect(archived.ok).toBe(false);
    expect(archived.toast).toContain('cannot be archived');
  });

  test('inventory transfer commands are audited, reversible, and keep held stock out of sale posting', async ({ page }) => {
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const batch = reference[0].result.data.json.availableBatches.find((row: { availableQty: string }) => Number(row.availableQty) >= 1);

    const held = commandData(await runCommand(page, 'setInventoryStatus', { batchId: batch.id, status: 'held' }, 'QA hold for damaged label check'));
    expect(held.ok).toBe(true);

    const inventoryRows = await trpcQuery(page, 'queries.grid', { view: 'inventory' });
    expect(inventoryRows[0].result.data.json.find((row: { id: string }) => row.id === batch.id).status).toBe('held');

    const customer = reference[0].result.data.json.customers.find((row: { name: string }) => row.name === 'Cobalt Reserve');
    const order = commandData(await runCommand(page, 'createSalesOrder', { customerId: customer.id }));
    const blockedLine = commandData(await runCommand(page, 'addSalesOrderLine', { orderId: order.affectedIds[0], batchId: batch.id, qty: 1 }));
    expect(blockedLine.ok).toBe(false);
    expect(blockedLine.toast).toContain('not available for sale');

    const moved = commandData(await runCommand(page, 'transferInventoryLocation', { batchId: batch.id, location: 'QA-Hold' }, 'QA move'));
    const owned = commandData(await runCommand(page, 'transferInventoryOwnership', { batchId: batch.id, ownershipStatus: 'OFC' }, 'QA ownership correction'));
    expect(moved.ok).toBe(true);
    expect(owned.ok).toBe(true);

    const movements = await trpcQuery(page, 'queries.inventoryMovements', { batchId: batch.id });
    expect(movements[0].result.data.json.map((row: { kind: string }) => row.kind)).toEqual(expect.arrayContaining(['status_transfer', 'location_transfer', 'ownership_transfer']));

    const reversed = commandData(await runCommand(page, 'reverseCommandById', { commandId: held.commandId }));
    expect(reversed.ok).toBe(true);
  });

  test('pricing guardrails lift unsafe reprices and snapshot the confirmation basis', async ({ page }) => {
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const customer = reference[0].result.data.json.customers.find((row: { name: string }) => row.name === 'Cobalt Reserve');
    const batch = reference[0].result.data.json.availableBatches.find((row: { availableQty: string }) => Number(row.availableQty) >= 1);
    const order = commandData(await runCommand(page, 'createSalesOrder', { customerId: customer.id }));
    const orderId = order.affectedIds[0];

    await runCommand(page, 'addSalesOrderLine', { orderId, batchId: batch.id, qty: 1, unitPrice: 1 });
    const unsafeConfirm = commandData(await runCommand(page, 'confirmSalesOrder', { orderId }));
    expect(unsafeConfirm.ok).toBe(false);
    expect(unsafeConfirm.toast).toContain('below pricing guardrails');

    const priced = commandData(await runCommand(page, 'priceSalesOrder', { orderId, strategy: 'clearance' }));
    expect(priced.ok).toBe(true);
    expect(priced.delta.guardrails.length).toBeGreaterThan(0);

    const confirmed = commandData(await runCommand(page, 'confirmSalesOrder', { orderId }));
    expect(confirmed.ok).toBe(true);
    expect(confirmed.delta.pricingSnapshot.lines[0]).toEqual(expect.objectContaining({ unitCost: expect.any(String), unitPrice: expect.any(String), minimumUnitPrice: expect.any(String), guardrails: [] }));
  });
});
