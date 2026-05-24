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

  test('transaction ledger posting is manager-gated consistently', async ({ page }) => {
    await login(page, 'intake@terpagro.local');
    const result = await runCommand(page, 'postTransactionLedgerRow', {
      direction: 'receiving',
      entityType: 'other',
      entityName: 'QA operator blocked',
      transactionType: 'other_receipt',
      allocationTargetType: 'unapplied',
      amount: 1,
      method: 'cash',
      bucket: 'cash-file-a',
      notes: 'operator should not post manager ledger command'
    });

    expect(result.status).toBe(403);
    expect(commandError(result)).toContain('requires manager access');
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
    // All seed batches carry a priceRange; addSalesOrderLine therefore sets unitCostResolved=false
    // on every new line. confirmSalesOrder checks unitCostResolved BEFORE the duplicate-source
    // check, so we must resolve landed COGS on both lines via setLineLandedCost before confirming.
    const batch = reference[0].result.data.json.availableBatches.find(
      (row: { availableQty: string; unitCost?: string; priceRange?: string }) => Number(row.availableQty) >= 2 && row.unitCost && Number(row.unitCost) > 0
    );
    const order = commandData(await runCommand(page, 'createSalesOrder', { customerId: customer.id }));
    const orderId = order.affectedIds[0];

    const addLine1 = commandData(await runCommand(page, 'addSalesOrderLine', { orderId, batchId: batch.id, qty: 1, sourceRowKey: batch.batchCode }));
    const addLine2 = commandData(await runCommand(page, 'addSalesOrderLine', { orderId, batchId: batch.id, qty: 1, sourceRowKey: batch.batchCode }));
    // Resolve landed COGS on both lines so confirmSalesOrder passes the unitCostResolved gate
    // and reaches the duplicate-source row check in postSalesOrder.
    if (batch.priceRange) {
      const [lo, hi] = (batch.priceRange as string).split('-').map(Number);
      const mid = (lo + hi) / 2;
      await runCommand(page, 'setLineLandedCost', { lineId: addLine1.affectedIds[1], landedCost: mid, basis: 'pick-mid' });
      await runCommand(page, 'setLineLandedCost', { lineId: addLine2.affectedIds[1], landedCost: mid, basis: 'pick-mid' });
    }
    await runCommand(page, 'confirmSalesOrder', { orderId });
    const posted = commandData(await runCommand(page, 'postSalesOrder', { orderId }));

    expect(posted.ok).toBe(false);
    expect(posted.toast).toContain('appears more than once from the same source row');
  });

  test('money and warehouse commands reject no-op or premature actions', async ({ page }) => {
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

  test('transaction ledger posts receiving rows and vendor PO payments through auditable commands', async ({ page }) => {
    await login(page);
    const marker = `QA ledger ${Date.now()}`;
    const reference = await trpcQuery(page, 'queries.reference');
    const customer = reference[0].result.data.json.customers.find((row: { name: string }) => row.name === 'Cobalt Reserve') ?? reference[0].result.data.json.customers[0];
    const invoice = reference[0].result.data.json.openInvoices.find((row: { customerId: string }) => row.customerId === customer.id);
    const vendor = reference[0].result.data.json.vendors[0];
    const po = commandData(await runCommand(page, 'createPurchaseOrder', { vendorId: vendor.id }, 'ledger contract creates PO target'));

    const received = commandData(
      await runCommand(page, 'postTransactionLedgerRow', {
        direction: 'receiving',
        entityType: 'customer',
        entityId: customer.id,
        transactionType: 'client_payment',
        allocationTargetType: invoice ? 'selected_invoice' : 'fifo',
        allocationTargetId: invoice?.id,
        date: '2026-05-14',
        method: 'cash',
        bucket: 'cash-file-a',
        amount: 7,
        reference: `${marker} receiving`,
        notes: `${marker} selected invoice path should normalize into payment allocation`
      })
    );
    expect(received.ok).toBe(true);
    expect(received.affectedIds.length).toBeGreaterThan(0);

    const paid = commandData(
      await runCommand(page, 'postTransactionLedgerRow', {
        direction: 'paying',
        entityType: 'vendor',
        entityId: vendor.id,
        transactionType: 'vendor_product_payment',
        allocationTargetType: 'selected_po',
        allocationTargetId: po.affectedIds[0],
        date: '2026-05-14',
        method: 'cash',
        bucket: 'accounting',
        amount: 12,
        reference: `${marker} paying`,
        notes: `${marker} product payment should link to PO without sales price`
      })
    );
    expect(paid.ok).toBe(true);
    expect(paid.affectedIds).toContain(po.affectedIds[0]);

    const ledger = await trpcQuery(page, 'queries.transactionLedger');
    expect(ledger[0].result.data.json.receiving.some((row: { reference?: string; transactionType?: string }) => row.reference === `${marker} receiving` && row.transactionType === 'client_payment')).toBe(true);
    expect(ledger[0].result.data.json.paying.some((row: { reference?: string; transactionType?: string; allocationTargetLabel?: string }) => row.reference === `${marker} paying` && row.transactionType === 'vendor_product_payment' && row.allocationTargetLabel)).toBe(true);

    const vendorRows = await trpcQuery(page, 'queries.grid', { view: 'vendors' });
    const linkedBill = vendorRows[0].result.data.json.find((row: { purchaseOrderId?: string }) => row.purchaseOrderId === po.affectedIds[0]);
    expect(linkedBill).toEqual(expect.objectContaining({ amount: '12.00', amountPaid: '12.00', status: 'paid' }));
    expect(linkedBill).not.toHaveProperty('unitPrice');

    const reversedPaying = commandData(await runCommand(page, 'reverseCommandById', { commandId: paid.commandId }, 'reverse transaction ledger vendor payment'));
    expect(reversedPaying.ok).toBe(true);
    const afterReverseLedger = await trpcQuery(page, 'queries.transactionLedger');
    expect(afterReverseLedger[0].result.data.json.paying.some((row: { reference?: string }) => row.reference === `${marker} paying`)).toBe(false);
    const afterReverseVendorRows = await trpcQuery(page, 'queries.grid', { view: 'vendors' });
    expect(afterReverseVendorRows[0].result.data.json.find((row: { purchaseOrderId?: string }) => row.purchaseOrderId === po.affectedIds[0]).status).toBe('reversed');

    const reversedReceiving = commandData(await runCommand(page, 'reverseCommandById', { commandId: received.commandId }, 'reverse transaction ledger receiving payment'));
    expect(reversedReceiving.ok).toBe(true);
    const afterReceivingReverseLedger = await trpcQuery(page, 'queries.transactionLedger');
    expect(afterReceivingReverseLedger[0].result.data.json.receiving.some((row: { reference?: string }) => row.reference === `${marker} receiving`)).toBe(false);

    const type = commandData(
      await runCommand(page, 'upsertTransactionType', {
        label: 'QA Vendor Rebate',
        direction: 'paying',
        allowedEntityTypes: ['vendor'],
        defaultMethod: 'wire',
        defaultBucket: 'accounting',
        defaultAllocationIntent: 'unapplied'
      })
    );
    expect(type.ok).toBe(true);
    const refreshed = await trpcQuery(page, 'queries.reference');
    expect(refreshed[0].result.data.json.transactionTypes.some((row: { slug: string; allowedEntityTypes: string[] }) => row.slug === 'qa_vendor_rebate' && row.allowedEntityTypes.includes('vendor'))).toBe(true);
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

    // May 2026 breaking change: approvePurchaseOrder now requires finalized status.
    // A PO must go draft → finalized → approved. Finalization validates the lines.
    const finalized = commandData(await runCommand(page, 'finalizePurchaseOrder', { purchaseOrderId }));
    expect(finalized.ok).toBe(true);

    const approved = commandData(await runCommand(page, 'approvePurchaseOrder', { purchaseOrderId }));
    expect(approved.ok).toBe(true);

    // approvePurchaseOrder internally calls receivePurchaseOrder when a vendor is set,
    // so the second explicit call returns the no-new-rows path which still contains
    // 'draft intake row' in the toast message. Use the singular stem so the assertion
    // matches both "draft intake row(s)" and "draft intake rows".
    const received = commandData(await runCommand(page, 'receivePurchaseOrder', { purchaseOrderId }));
    expect(received.ok).toBe(true);
    expect(received.toast).toContain('draft intake row');

    const intakeRows = await trpcQuery(page, 'queries.grid', { view: 'intake' });
    const linkedDraft = intakeRows[0].result.data.json.find((row: { purchaseOrderId?: string }) => row.purchaseOrderId === purchaseOrderId);
    expect(linkedDraft.status).toBe('draft');
    expect(Number(linkedDraft.availableQty)).toBe(0);

    const vendorBills = await trpcQuery(page, 'queries.grid', { view: 'vendors' });
    expect(vendorBills[0].result.data.json.some((row: { purchaseOrderId?: string }) => row.purchaseOrderId === purchaseOrderId)).toBe(false);
  });

  test('vendor quick-add deduplicates existing vendors case-insensitively', async ({ page }) => {
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const vendor = reference[0].result.data.json.vendors[0];
    const duplicate = commandData(
      await runCommand(page, 'createVendor', {
        name: String(vendor.name).toLowerCase(),
        termsDays: Number(vendor.termsDays ?? 14)
      })
    );

    expect(duplicate.ok).toBe(true);
    expect(duplicate.affectedIds).toContain(vendor.id);
    expect(String(duplicate.toast).toLowerCase()).toContain('already exists');
  });

  test('payment reversal has real ledger consequences, not just an audit label', async ({ page }) => {
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const customer = reference[0].result.data.json.customers.find((row: { name: string }) => row.name === 'Cobalt Reserve');

    // Record the balance BEFORE the credit so assertions are relative to starting state.
    // The realistic seed leaves Cobalt Reserve with a non-zero balance, so we cannot
    // assert the absolute value of -100; instead assert it changed by the payment amount.
    const before = await trpcQuery(page, 'queries.grid', { view: 'clients' });
    const initialBalance = Number(before[0].result.data.json.find((row: { id: string }) => row.id === customer.id).balance);

    const credit = commandData(await runCommand(page, 'logPayment', { customerId: customer.id, amount: -100, method: 'cash', notes: 'adversarial buyer credit' }));
    expect(credit.ok).toBe(true);

    const withCredit = await trpcQuery(page, 'queries.grid', { view: 'clients' });
    // Balance should have decreased by 100 (the credit amount)
    expect(Number(withCredit[0].result.data.json.find((row: { id: string }) => row.id === customer.id).balance)).toBeCloseTo(initialBalance - 100, 2);

    const reversed = commandData(await runCommand(page, 'reverseCommandById', { commandId: credit.commandId }));
    expect(reversed.ok).toBe(true);

    const afterReverse = await trpcQuery(page, 'queries.grid', { view: 'clients' });
    // After reversal, balance should be back to the original value
    expect(Number(afterReverse[0].result.data.json.find((row: { id: string }) => row.id === customer.id).balance)).toBeCloseTo(initialBalance, 2);
  });

  test('archive enforces the same open-work blockers preview reports', async ({ page }) => {
    await login(page);
    const period = new Date().toISOString().slice(0, 7);
    const locked = commandData(await runCommand(page, 'lockPeriod', { period }, 'lock current test period'));
    expect(locked.ok).toBe(false);
    expect(locked.toast).toContain('cannot be locked yet');

    const preview = await trpcQuery(page, 'queries.closeoutPreview', { period });
    const closeout = preview[0].result.data.json;
    expect(closeout.eligible).toBe(false);
    expect(closeout.locked).toBe(false);
    expect(closeout.openWorkCount).toBeGreaterThan(0);
    expect(closeout.unsafeRows).toBe(closeout.openWorkCount);
    expect(closeout.blockers.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining(['unsafePurchaseOrders']));
    expect(closeout.blockers.map((row: { label: string }) => row.label.toLowerCase()).join(' ')).not.toContain('unsafe');
    expect(closeout.controlTotals).toEqual(expect.objectContaining({ purchaseOrders: expect.any(Number), purchaseReceipts: expect.any(Number), invoices: expect.any(Number), payments: expect.any(Number), vendorBills: expect.any(Number), connectorRequests: expect.any(Number), fulfillment: expect.any(Number), commands: expect.any(Number) }));

    const archived = commandData(await runCommand(page, 'archivePeriod', { period }, 'try archive with open work'));
    expect(archived.ok).toBe(false);
    expect(archived.toast).toContain('must be locked');
  });

  test('inventory transfer commands are audited, reversible, and keep held stock out of sale posting', async ({ page }) => {
    await login(page);
    const reference = await trpcQuery(page, 'queries.reference');
    const batch = reference[0].result.data.json.availableBatches.find((row: { availableQty: string; ownershipStatus?: string }) => Number(row.availableQty) >= 1 && row.ownershipStatus !== 'OFC')
      ?? reference[0].result.data.json.availableBatches.find((row: { availableQty: string }) => Number(row.availableQty) >= 1);
    const nextOwnership = batch.ownershipStatus === 'OFC' ? 'C' : 'OFC';

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
    const owned = commandData(await runCommand(page, 'transferInventoryOwnership', { batchId: batch.id, ownershipStatus: nextOwnership, vendorId: nextOwnership === 'C' ? batch.vendorId ?? reference[0].result.data.json.vendors[0].id : undefined }, 'QA ownership correction'));
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
    // All seed batches carry a priceRange; addSalesOrderLine sets unitCostResolved=false on the
    // new line. confirmSalesOrder checks unitCostResolved BEFORE the pricing guardrail check, so
    // we must resolve landed COGS via setLineLandedCost first, then confirm with a deliberately
    // low unitPrice (1) to trigger the 'below pricing guardrails' guard.
    const batch = reference[0].result.data.json.availableBatches.find(
      (row: { availableQty: string; unitCost?: string; priceRange?: string }) => Number(row.availableQty) >= 1 && row.unitCost && Number(row.unitCost) > 0
    );
    const order = commandData(await runCommand(page, 'createSalesOrder', { customerId: customer.id }));
    const orderId = order.affectedIds[0];

    const addLine = commandData(await runCommand(page, 'addSalesOrderLine', { orderId, batchId: batch.id, qty: 1, unitPrice: 1 }));
    // Resolve landed COGS so confirmSalesOrder reaches the pricing guardrail check
    // (unitPrice 1 is far below the priceFloor that setLineLandedCost establishes).
    if (batch.priceRange) {
      const [lo, hi] = (batch.priceRange as string).split('-').map(Number);
      const mid = (lo + hi) / 2;
      await runCommand(page, 'setLineLandedCost', { lineId: addLine.affectedIds[1], landedCost: mid, basis: 'pick-mid' });
    }
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

  test('idempotency key replay returns cached result for identical command and payload', async ({ page }) => {
    await login(page);
    const idempotencyKey = `test-idempotency-${crypto.randomUUID()}`;
    const vendorName = `QA Vendor ${Date.now()}`;

    // Helper function to run command with specific idempotency key
    async function runWithKey(commandName: CommandName, commandPayload: Record<string, unknown>, key: string) {
      return page.evaluate(
        async ({ name, payload, idemKey }) => {
          const body = {
            0: {
              json: {
                name,
                payload,
                reason: 'idempotency test',
                idempotencyKey: idemKey
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
        { name: commandName, payload: commandPayload, idemKey: key }
      );
    }

    // First request
    const first = await runWithKey('createVendor', { name: vendorName, termsDays: 14 }, idempotencyKey);
    expect(first.status).toBe(200);
    const firstData = commandData(first);
    expect(firstData.ok).toBe(true);
    expect(firstData.affectedIds.length).toBeGreaterThan(0);
    const vendorId = firstData.affectedIds[0];

    // Second request with SAME key, SAME command, SAME payload (should replay)
    const second = await runWithKey('createVendor', { name: vendorName, termsDays: 14 }, idempotencyKey);
    expect(second.status).toBe(200);
    const secondData = commandData(second);
    expect(secondData.ok).toBe(true);
    expect(secondData.affectedIds).toEqual([vendorId]); // Same vendor ID
    expect(secondData.commandId).toBe(firstData.commandId); // Same command ID (replay)
  });

  test('idempotency key reused with different command name throws error', async ({ page }) => {
    await login(page);
    const idempotencyKey = `test-idempotency-collision-${crypto.randomUUID()}`;
    const vendorName = `QA Vendor ${Date.now()}`;

    async function runWithKey(commandName: CommandName, commandPayload: Record<string, unknown>, key: string) {
      return page.evaluate(
        async ({ name, payload, idemKey }) => {
          const body = {
            0: {
              json: {
                name,
                payload,
                reason: 'idempotency collision test',
                idempotencyKey: idemKey
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
        { name: commandName, payload: commandPayload, idemKey: key }
      );
    }

    // First request: createVendor
    const first = await runWithKey('createVendor', { name: vendorName, termsDays: 14 }, idempotencyKey);
    expect(first.status).toBe(200);
    expect(commandData(first).ok).toBe(true);

    // Second request: DIFFERENT command (createBatch) with SAME key
    const second = await runWithKey('createBatch', { name: 'QA Batch', category: 'Flower', intakeQty: 1, unitCost: 10, unitPrice: 15 }, idempotencyKey);
    expect(second.status).toBe(500); // Should error
    const error = commandError(second);
    expect(error).toContain('Idempotency key reused with different command');
    expect(error).toContain('createVendor');
    expect(error).toContain('createBatch');
  });

  test('idempotency key reused with different payload throws error', async ({ page }) => {
    await login(page);
    const idempotencyKey = `test-idempotency-payload-${crypto.randomUUID()}`;
    const vendorName1 = `QA Vendor ${Date.now()}-1`;
    const vendorName2 = `QA Vendor ${Date.now()}-2`;

    async function runWithKey(commandName: CommandName, commandPayload: Record<string, unknown>, key: string) {
      return page.evaluate(
        async ({ name, payload, idemKey }) => {
          const body = {
            0: {
              json: {
                name,
                payload,
                reason: 'idempotency payload test',
                idempotencyKey: idemKey
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
        { name: commandName, payload: commandPayload, idemKey: key }
      );
    }

    // First request
    const first = await runWithKey('createVendor', { name: vendorName1, termsDays: 14 }, idempotencyKey);
    expect(first.status).toBe(200);
    expect(commandData(first).ok).toBe(true);

    // Second request: SAME command but DIFFERENT payload
    const second = await runWithKey('createVendor', { name: vendorName2, termsDays: 30 }, idempotencyKey);
    expect(second.status).toBe(500); // Should error
    const error = commandError(second);
    expect(error).toContain('Idempotency key reused with different payload');
    expect(error).toContain('unique key');
  });

  test('idempotency key handles property order variations (same payload, different order)', async ({ page }) => {
    await login(page);
    const idempotencyKey = `test-idempotency-order-${crypto.randomUUID()}`;
    const vendorName = `QA Vendor ${Date.now()}`;

    async function runWithKey(commandName: CommandName, commandPayload: Record<string, unknown>, key: string) {
      return page.evaluate(
        async ({ name, payload, idemKey }) => {
          const body = {
            0: {
              json: {
                name,
                payload,
                reason: 'idempotency property order test',
                idempotencyKey: idemKey
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
        { name: commandName, payload: commandPayload, idemKey: key }
      );
    }

    // First request: { name, termsDays }
    const first = await runWithKey('createVendor', { name: vendorName, termsDays: 14 }, idempotencyKey);
    expect(first.status).toBe(200);
    const firstData = commandData(first);
    expect(firstData.ok).toBe(true);
    const vendorId = firstData.affectedIds[0];

    // Second request: SAME payload but DIFFERENT property order { termsDays, name }
    const second = await runWithKey('createVendor', { termsDays: 14, name: vendorName }, idempotencyKey);
    expect(second.status).toBe(200);
    const secondData = commandData(second);
    expect(secondData.ok).toBe(true);
    expect(secondData.affectedIds).toEqual([vendorId]); // Should replay, not create duplicate
    expect(secondData.commandId).toBe(firstData.commandId); // Same command ID (replay)
  });

  test('idempotency handles concurrent requests with same key atomically', async ({ page }) => {
    await login(page);
    const idempotencyKey = `test-idempotency-concurrent-${crypto.randomUUID()}`;
    const vendorName = `QA Vendor ${Date.now()}`;

    async function runWithKey(commandName: CommandName, commandPayload: Record<string, unknown>, key: string) {
      return page.evaluate(
        async ({ name, payload, idemKey }) => {
          const body = {
            0: {
              json: {
                name,
                payload,
                reason: 'idempotency concurrent test',
                idempotencyKey: idemKey
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
        { name: commandName, payload: commandPayload, idemKey: key }
      );
    }

    // Launch two concurrent requests with same idempotency key
    const [first, second] = await Promise.all([
      runWithKey('createVendor', { name: vendorName, termsDays: 14 }, idempotencyKey),
      runWithKey('createVendor', { name: vendorName, termsDays: 14 }, idempotencyKey)
    ]);

    // Both requests should succeed (one executes, one replays)
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstData = commandData(first);
    const secondData = commandData(second);

    expect(firstData.ok).toBe(true);
    expect(secondData.ok).toBe(true);

    // CRITICAL: Both should reference the SAME command ID (proving replay, not duplicate execution)
    expect(firstData.commandId).toBe(secondData.commandId);

    // Both should reference the same vendor ID
    expect(firstData.affectedIds).toEqual(secondData.affectedIds);

    // Verify only ONE vendor was created (not two)
    const reference = await trpcQuery(page, 'queries.reference');
    const vendors = reference[0].result.data.json.vendors.filter((v: { name: string }) => v.name === vendorName);
    expect(vendors.length).toBe(1); // Only one vendor created despite concurrent requests

    // CRITICAL: Verify only ONE journal entry exists (not two with different statuses)
    const journalCheck = await page.evaluate(
      async (idemKey: string) => {
        const response = await fetch('/trpc/queries.commandJournal?batch=1&input=' + encodeURIComponent(JSON.stringify({ 0: { json: null } })), {
          method: 'GET',
          credentials: 'include',
          headers: { 'content-type': 'application/json' }
        });
        const data = await response.json();
        const entries = data[0].result.data.json.filter((entry: { idempotencyKey: string }) => entry.idempotencyKey === idemKey);
        return { count: entries.length, statuses: entries.map((e: { status: string }) => e.status) };
      },
      idempotencyKey
    );

    expect(journalCheck.count).toBe(1); // Only ONE journal entry
    expect(journalCheck.statuses).toEqual(['ok']); // Status is 'ok', not 'pending' or mixed
  });
});
