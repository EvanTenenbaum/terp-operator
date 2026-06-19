/**
 * Payments domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.PAY.EXTRACT.
 *
 * NOTE: this module intentionally imports helpers, schemas, and the Payload
 * type from `@/server/services/commandBus`. commandBus.ts in turn re-imports
 * the 10 payment command handlers from this module, which creates a circular
 * import. This is safe under ESM because every reference to those imported
 * bindings lives inside a function body — by the time runCommand() invokes a
 * payment handler, commandBus.ts has fully evaluated and the live bindings
 * are resolved (same pattern as P1.PO.EXTRACT).
 *
 * Future cleanup (P2+): hoist the shared helpers to `@/domains/shared/...`
 * and remove the cycle entirely.
 */

import Decimal from 'decimal.js';
import { eq, sql } from 'drizzle-orm';

import {
  clientLedgerEntries,
  customers,
  invoices,
  paymentAllocations,
  payments,
  vendorBills,
  vendorPayments,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult } from '../../shared/types';

// Helpers, schemas, and the Payload type are kept in commandBus.ts for this
// phase (see header comment).
import {
  // Schemas
  allocatePaymentPayloadSchema,
  applyClientCreditPayloadSchema,
  applyDiscountPayloadSchema,
  logPaymentPayloadSchema,
  markPaymentUnappliedPayloadSchema,
  recordVendorPaymentPayloadSchema,
  refundPaymentPayloadSchema,
  scheduleVendorPaymentPayloadSchema,
  unallocatePaymentPayloadSchema,
  voidVendorPaymentPayloadSchema,
  // Money helpers
  addMoney,
  moneyScale,
  subMoney,
  // Misc helpers
  dateOrNull,
  oneWeek,
  paymentImpactPreview,
  requiredId,
  requiredNumber,
  stringValue,
  // Types
  type Payload,
} from '@/server/services/commandBus';

// Credit-engine recompute lives in its own module; safe to import directly.
import { enqueueCustomerRecompute } from '@/server/services/creditEngine';

export async function applyClientCredit(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  applyClientCreditPayloadSchema.parse(payload);
  const customerId = requiredId(payload.customerId, 'customerId');
  const amount = requiredNumber(payload.amount, 'amount');
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error('Customer not found.');
  const nextBalance = new Decimal(String(customer.balance ?? 0)).minus(String(amount)).toDecimalPlaces(2).toFixed(2);
  await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customerId));
  const [entry] = await tx.insert(clientLedgerEntries).values({ customerId, kind: 'credit', amount: moneyScale(-amount), balanceAfter: nextBalance, note: stringValue(payload.reason) || 'Client credit applied' }).returning();
  return { ok: true, commandId, affectedIds: [customerId, entry.id], toast: `Applied ${moneyScale(amount)} credit to ${customer.name}.` };
}

export async function logPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  logPaymentPayloadSchema.parse(payload);
  const customerId = requiredId(payload.customerId, 'customerId');
  const amount = requiredNumber(payload.amount, 'amount');
  if (amount === 0) throw new Error('Payment amount cannot be zero.');
  const method = stringValue(payload.method) || 'cash';
  const transactionDate = dateOrNull(payload.date ?? payload.createdAt) ?? new Date();

  // Lock customer row to prevent concurrent balance update races
  const customerRows = await tx.execute(
    sql`SELECT * FROM ${customers} WHERE ${customers.id} = ${customerId} FOR UPDATE`
  );
  const customer = customerRows.rows[0];
  if (!customer) throw new Error('Customer not found.');
  const [payment] = await tx
    .insert(payments)
    .values({
      customerId,
      method,
      amount: moneyScale(amount),
      unappliedAmount: moneyScale(Math.max(0, amount)),
      reference: stringValue(payload.reference) || null,
      locationBucket: stringValue(payload.locationBucket) || null,
      notes: stringValue(payload.notes) || null,
      direction: stringValue(payload.direction) || (amount < 0 ? 'buyer_credit' : 'money_in'),
      category: stringValue(payload.category) || (amount < 0 ? 'buyer_credit' : 'client_payment'),
      allocationIntent: stringValue(payload.allocationIntent) || (payload.invoiceId ? 'selected_invoice' : 'fifo'),
      impactPreview: paymentImpactPreview(amount, stringValue(payload.allocationIntent) || (payload.invoiceId ? 'selected_invoice' : 'fifo')),
      status: 'posted',
      createdAt: transactionDate,
      updatedAt: transactionDate
    })
    .returning();

  const affected = [payment.id, customerId];
  if (amount < 0) {
    const credit = Math.abs(amount);
    const nextBalance = new Decimal(String(customer.balance ?? 0)).minus(String(credit)).toDecimalPlaces(2).toFixed(2);
    await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customerId));
    const [entry] = await tx.insert(clientLedgerEntries).values({ customerId, paymentId: payment.id, kind: 'down_payment', amount: moneyScale(-credit), balanceAfter: nextBalance, note: 'Negative payment recorded as buyer credit', createdAt: transactionDate }).returning();
    affected.push(entry.id);
  }

  // Enqueue credit recompute for this customer. Idempotent at the pending-row
  // level — if allocatePayment also enqueues below, the second insert is a no-op.
  await enqueueCustomerRecompute(tx, customerId, 'event:recordPayment', commandId);



  // Auto-execute allocation if allocationIntent is set to 'fifo' or 'selected_invoice'
  const intent = payment.allocationIntent;
  if (amount > 0 && (intent === 'fifo' || intent === 'selected_invoice')) {
    try {
      const allocationPayload: Payload = { paymentId: payment.id };
      if (payload.invoiceId) {
        allocationPayload.invoiceId = payload.invoiceId;
      }
      // GH #295: The nested allocatePayment call must use a distinct idempotency
      // key so that a logPayment replay does not collide with a stand-alone
      // allocatePayment that shares the same commandId suffix. Append the
      // payment UUID so the derived key is stable (same payment → same suffix)
      // but never equal to the parent commandId.
      const allocationCommandId = `${commandId}-alloc-${payment.id}`;
      const allocationResult = await allocatePayment(tx, allocationPayload, allocationCommandId);
      // Merge affected IDs from allocation
      affected.push(...allocationResult.affectedIds.filter(id => !affected.includes(id)));
      return {
        ok: true,
        commandId,
        affectedIds: affected,
        toast: `Payment logged and allocated for ${customer.name}. ${allocationResult.toast}`
      };
    } catch (allocationError) {
      // If allocation fails (e.g., no open invoices), that's okay - payment is still logged
      // Return payment logged confirmation without allocation
      const errorMsg = allocationError instanceof Error ? allocationError.message : 'Unknown error';
      return {
        ok: true,
        commandId,
        affectedIds: affected,
        toast: `Payment logged for ${customer.name}. Auto-allocation skipped: ${errorMsg}`
      };
    }
  }

  return { ok: true, commandId, affectedIds: affected, toast: `Payment logged for ${customer.name}.` };
}

export async function allocatePayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  allocatePaymentPayloadSchema.parse(payload);
  const paymentId = requiredId(payload.paymentId, 'paymentId');

  // Lock payment row to prevent concurrent allocation races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // columns like `unapplied_amount` and `customer_id` must be read via
  // bracket notation — camelCase access would silently produce `undefined` →
  // NaN writes to invoice.amount_paid and customer.balance.
  const paymentRows = await tx.execute(
    sql`SELECT * FROM ${payments} WHERE ${payments.id} = ${paymentId} FOR UPDATE`
  );
  const payment = paymentRows.rows[0];
  if (!payment) throw new Error('Payment not found.');
  if (Number(payment['unapplied_amount']) <= 0) throw new Error('Payment has no unapplied amount.');
  const paymentCustomerId = payment['customer_id'] as string | null | undefined;

  // Lock invoices to prevent concurrent payment application races.
  // Raw rows: `amount_paid` is multi-word, single-word `total` and `id` are fine.
  const invoicesToPay = payload.invoiceId
    ? (await tx.execute(
        sql`SELECT * FROM ${invoices} WHERE ${invoices.id} = ${requiredId(payload.invoiceId, 'invoiceId')} FOR UPDATE`
      )).rows
    : (await tx.execute(
        sql`SELECT * FROM ${invoices} WHERE ${invoices.customerId} = ${paymentCustomerId} AND ${invoices.status} in ('open', 'partial') ORDER BY ${invoices.createdAt} FOR UPDATE`
      )).rows;

  if (!invoicesToPay.length) throw new Error('No open invoice found for allocation.');
  let remaining = Number(payment['unapplied_amount']);
  const affected = [paymentId];
  for (const invoice of invoicesToPay) {
    if (remaining <= 0) break;
    // TER-1566: Decimal-precise open amount so allocationAmount boundary is exact.
    const open = Number(subMoney(invoice.total, invoice['amount_paid']));
    const allocationAmount = Math.min(open, remaining, payload.amount != null ? Number(payload.amount) : remaining);
    if (allocationAmount <= 0) continue;
    const [allocation] = await tx.insert(paymentAllocations).values({ paymentId, invoiceId: invoice.id as string, amount: moneyScale(allocationAmount) }).returning();
    // Invoice running-paid accumulation (TER-1566): use Decimal so a sequence
    // of partial allocations sums exactly to total when the invoice is paid in
    // full. Stored value remains a numeric-compatible string.
    const invoicePaid = addMoney(invoice['amount_paid'], allocationAmount);
    await tx.update(invoices).set({ amountPaid: invoicePaid, status: new Decimal(invoicePaid).gte(String(invoice.total)) ? 'paid' : 'partial', updatedAt: new Date() }).where(eq(invoices.id, invoice.id as string));
    remaining -= allocationAmount;
    affected.push(invoice.id as string, allocation.id);
  }
  await tx.update(payments).set({ unappliedAmount: moneyScale(remaining), updatedAt: new Date() }).where(eq(payments.id, paymentId));
  const totalAllocated = Number(payment['unapplied_amount']) - remaining;
  if (paymentCustomerId && totalAllocated > 0) {
    // Lock customer row to prevent concurrent balance update races.
    // `balance` is single-word so dot access is safe, but use bracket notation
    // to match the snake_case row contract.
    const customerRows = await tx.execute(
      sql`SELECT * FROM ${customers} WHERE ${customers.id} = ${paymentCustomerId} FOR UPDATE`
    );
    const customer = customerRows.rows[0];
    // Decimal subtraction so the customer's running balance stays exact
    // across many payments.
    const nextBalance = new Decimal(String(customer['balance']))
      .minus(new Decimal(String(totalAllocated)))
      .toDecimalPlaces(2)
      .toFixed(2);
    await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, paymentCustomerId));
    const [entry] = await tx.insert(clientLedgerEntries).values({ customerId: paymentCustomerId, paymentId, kind: 'payment_allocation', amount: moneyScale(-totalAllocated), balanceAfter: nextBalance, note: 'Auto-applied to oldest open invoices' }).returning();
    affected.push(paymentCustomerId, entry.id);
  }
  if (paymentCustomerId) {
    await enqueueCustomerRecompute(tx, paymentCustomerId, 'event:allocatePayment', commandId);
  }
  return { ok: true, commandId, affectedIds: affected, toast: `Allocated ${moneyScale(totalAllocated)} to oldest open invoices.` };
}

export async function unallocatePayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  unallocatePaymentPayloadSchema.parse(payload);
  const allocationId = requiredId(payload.allocationId, 'allocationId');
  const [allocation] = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.id, allocationId)).limit(1);
  if (!allocation) throw new Error('Allocation not found.');

  // Lock payment and invoice rows to prevent concurrent unallocation races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // columns like `unapplied_amount` and `amount_paid` must be read via
  // bracket notation — camelCase access would silently produce `undefined`.
  const paymentRows = await tx.execute(
    sql`SELECT * FROM ${payments} WHERE ${payments.id} = ${allocation.paymentId} FOR UPDATE`
  );
  const payment = paymentRows.rows[0];

  const invoiceRows = await tx.execute(
    sql`SELECT * FROM ${invoices} WHERE ${invoices.id} = ${allocation.invoiceId} FOR UPDATE`
  );
  const invoice = invoiceRows.rows[0];
  await tx.delete(paymentAllocations).where(eq(paymentAllocations.id, allocationId));
  // Decimal-precise unallocation: payment.unapplied_amount grows back exactly.
  await tx.update(payments).set({ unappliedAmount: addMoney(payment['unapplied_amount'], allocation.amount), updatedAt: new Date() }).where(eq(payments.id, payment.id as string));
  const paidDec = new Decimal(String(invoice['amount_paid']))
    .minus(new Decimal(String(allocation.amount)));
  const paid = paidDec.isNegative() ? new Decimal(0) : paidDec;
  await tx.update(invoices).set({ amountPaid: paid.toDecimalPlaces(2).toFixed(2), status: paid.lte(0) ? 'open' : 'partial', updatedAt: new Date() }).where(eq(invoices.id, invoice.id as string));
  return { ok: true, commandId, affectedIds: [allocationId, payment.id as string, invoice.id as string], toast: 'Payment allocation reversed.' };
}

export async function refundPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  refundPaymentPayloadSchema.parse(payload);
  const paymentId = requiredId(payload.paymentId, 'paymentId');

  // Lock payment row to prevent concurrent refund races. Raw `SELECT *` returns
  // Postgres column names (snake_case), so every read below uses bracket-string
  // access — camelCase dot access would silently produce `undefined` → NaN.
  const paymentRows = await tx.execute(
    sql`SELECT * FROM ${payments} WHERE ${payments.id} = ${paymentId} FOR UPDATE`
  );
  const payment = paymentRows.rows[0];
  if (!payment) throw new Error('Payment not found.');
  if (payment['status'] === 'refunded') throw new Error('Payment has already been refunded.');

  // Allocation precondition (mirror of the reverseTransaction → logPayment
  // guard): a payment must be fully unallocated before refund, otherwise the
  // customer balance and invoice amount_paid totals would drift. For positive
  // amounts that means unappliedAmount === amount; for negative amounts
  // (buyer_credit) Math.max(0, amount) === 0, so unappliedAmount must be 0.
  // Operators must call unallocatePayment for each allocation first.
  const paymentAmount = Number(payment['amount']);
  if (Number(payment['unapplied_amount']) !== Math.max(0, paymentAmount)) {
    throw new Error('Unallocate this payment before refunding.');
  }

  await tx.update(payments).set({ status: 'refunded', unappliedAmount: '0.00', updatedAt: new Date() }).where(eq(payments.id, paymentId));

  const affected = [paymentId];

  // Update customer balance and write a ledger entry to preserve integrity.
  // This mirrors the canonical reverseTransaction → logPayment reversal:
  //   - logPayment only decrements customer.balance for negative amounts
  //     (buyer_credit), via Decimal `balance.minus(|amount|)`. Positive amounts
  //     do not touch the balance at logPayment time — the balance only moves
  //     when allocatePayment runs, and we have already required those
  //     allocations to be reversed above.
  //   - Therefore refund must add `|amount|` back only when amount < 0; for a
  //     positive, fully-unallocated payment the balance is already at the
  //     correct value and only the status flip is needed.
  const customerId = payment['customer_id'] as string | null | undefined;
  if (customerId) {
    // Lock customer row to prevent concurrent balance update races
    const customerRows = await tx.execute(
      sql`SELECT * FROM ${customers} WHERE ${customers.id} = ${customerId} FOR UPDATE`
    );
    const customer = customerRows.rows[0];
    if (customer) {
      if (paymentAmount < 0) {
        const credit = Math.abs(paymentAmount);
        const nextBalance = new Decimal(String(customer['balance'] ?? 0))
          .plus(new Decimal(String(credit)))
          .toDecimalPlaces(2)
          .toFixed(2);
        await tx.update(customers).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(customers.id, customer['id'] as string));
        const [entry] = await tx.insert(clientLedgerEntries).values({
          customerId: customer['id'] as string,
          paymentId,
          kind: 'payment_refund',
          amount: moneyScale(credit),
          balanceAfter: nextBalance,
          note: `Refund of buyer credit payment ${paymentId}`
        }).returning();
        affected.push(customer['id'] as string, entry.id);
      }
      // else: positive payment with no live allocations — nothing to reverse on
      // the customer balance; the status flip above is the complete refund.
    } else {
      // Customer row not found — ledger integrity gap; surface for follow-up.
      console.error('[refundPayment] WARNING: customer not found for payment — balance not updated, ledger gap:', paymentId);
    }
  } else {
    // Payment has no customerId — same gap. No balance to update.
    console.error('[refundPayment] WARNING: customer balance not updated on refund — no customerId on payment:', paymentId);
  }

  return { ok: true, commandId, affectedIds: affected, toast: 'Payment refunded.' };
}

export async function markPaymentUnapplied(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  markPaymentUnappliedPayloadSchema.parse(payload);
  const paymentId = requiredId(payload.paymentId, 'paymentId');

  // Lock payment row to prevent concurrent races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so status
  // must be read via bracket notation — camelCase dot access would silently
  // produce `undefined`.
  const paymentRows = await tx.execute(
    sql`SELECT * FROM ${payments} WHERE ${payments.id} = ${paymentId} FOR UPDATE`
  );
  const payment = paymentRows.rows[0];
  if (!payment) throw new Error('Payment not found.');
  if (payment['status'] === 'refunded' || payment['status'] === 'reversed') {
    throw new Error('Cannot mark a refunded or reversed payment as unapplied.');
  }

  await tx.update(payments)
    .set({ allocationIntent: 'unapplied', updatedAt: new Date() })
    .where(eq(payments.id, paymentId));

  return { ok: true, commandId, affectedIds: [paymentId], toast: 'Payment marked as unapplied.' };
}

// TER-1662: applyEarlyPayDiscount → applyDiscount. The "early payment" gate
// is dropped; this command now applies a generic discount to any open invoice.
// The open-balance guard remains: a discount cannot exceed the invoice's
// unpaid amount. Optional `reason` is captured in the toast / receipt copy.
export async function applyDiscount(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  applyDiscountPayloadSchema.parse(payload);
  const invoiceId = requiredId(payload.invoiceId, 'invoiceId');
  const amount = requiredNumber(payload.amount, 'amount');
  const reason = stringValue(payload.reason);

  // Lock invoice row to prevent concurrent total adjustment races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // `amount_paid` must be read via bracket notation — camelCase access would
  // silently produce `undefined` → NaN comparisons that always pass/fail.
  const invoiceRows = await tx.execute(
    sql`SELECT * FROM ${invoices} WHERE ${invoices.id} = ${invoiceId} FOR UPDATE`
  );
  const invoice = invoiceRows.rows[0];
  if (!invoice) throw new Error('Invoice not found.');
  const openBalance = Number(invoice.total) - Number(invoice['amount_paid']);
  if (amount > openBalance + 0.001) {
    // 0.001 tolerance for float drift; the constraint is strict
    return { ok: false, commandId, affectedIds: [], toast: `Discount amount exceeds open balance ($${openBalance.toFixed(2)}). Reverse a payment first or reduce the discount.` };
  }
  const nextTotal = Math.max(0, Number(invoice.total) - amount);
  await tx.update(invoices).set({ total: moneyScale(nextTotal), status: Number(invoice['amount_paid']) >= nextTotal ? 'paid' : (invoice.status as string), updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
  return {
    ok: true,
    commandId,
    affectedIds: [invoiceId],
    toast: reason ? `Discount applied: ${reason}.` : 'Discount applied.'
  };
}

export async function scheduleVendorPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  scheduleVendorPaymentPayloadSchema.parse(payload);
  const billId = requiredId(payload.vendorBillId ?? payload.id, 'vendorBillId');
  const scheduledFor = dateOrNull(payload.scheduledFor) ?? oneWeek();
  await tx.update(vendorBills).set({ status: 'scheduled', scheduledFor, dueReason: 'Scheduled payment event exists', updatedAt: new Date() }).where(eq(vendorBills.id, billId));
  return { ok: true, commandId, affectedIds: [billId], toast: 'Vendor payment scheduled with an actual due event.' };
}

export async function recordVendorPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  recordVendorPaymentPayloadSchema.parse(payload);
  const billId = requiredId(payload.vendorBillId ?? payload.id, 'vendorBillId');

  // Lock vendor bill row to prevent concurrent payment races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // `amount_paid` must be read via bracket notation — camelCase access would
  // silently produce `undefined` → NaN writes to vendor bill totals.
  const billRows = await tx.execute(
    sql`SELECT * FROM ${vendorBills} WHERE ${vendorBills.id} = ${billId} FOR UPDATE`
  );
  const bill = billRows.rows[0];
  if (!bill) throw new Error('Vendor bill not found.');
  if (bill.status !== 'scheduled' && payload.overrideUnscheduled !== true) {
    throw new Error('Schedule this vendor payment before recording payment. Scheduled means a real appointment/payment event exists.');
  }
  // TER-1566: Decimal-precise default payment amount when not specified.
  const amount = payload.amount != null ? requiredNumber(payload.amount, 'amount') : Number(subMoney(bill.amount, bill['amount_paid']));
  if (amount <= 0) throw new Error('Vendor payout amount must be greater than zero.');
  if (Number(bill['amount_paid']) + amount > Number(bill.amount)) throw new Error('Vendor payout cannot exceed the open bill balance.');
  const transactionDate = dateOrNull(payload.date ?? payload.createdAt) ?? new Date();
  const [payment] = await tx.insert(vendorPayments).values({ vendorBillId: billId, amount: moneyScale(amount), method: stringValue(payload.method) || 'cash', reference: stringValue(payload.reference) || null, createdAt: transactionDate }).returning();
  // Decimal-precise vendor bill amountPaid accumulation (TER-1566): so the
  // bill flips to 'paid' exactly when paid==amount, not when the float sum
  // happens to overshoot.
  const paid = addMoney(bill['amount_paid'], amount);
  const isFullyPaid = new Decimal(paid).gte(String(bill.amount));
  await tx.update(vendorBills).set({ amountPaid: paid, status: isFullyPaid ? 'paid' : 'partial', dueReason: isFullyPaid ? 'Paid in full' : 'Partially paid vendor payable', updatedAt: new Date() }).where(eq(vendorBills.id, billId));

  return { ok: true, commandId, affectedIds: [billId, payment.id], toast: 'Vendor payout recorded and traceable.' };
}

export async function voidVendorPayment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  voidVendorPaymentPayloadSchema.parse(payload);
  const paymentId = requiredId(payload.vendorPaymentId ?? payload.id, 'vendorPaymentId');
  const [payment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.id, paymentId)).limit(1);
  if (!payment) throw new Error('Vendor payment not found.');
  await tx.update(vendorPayments).set({ status: 'void' }).where(eq(vendorPayments.id, paymentId));

  // Lock vendor bill row to prevent concurrent payment reversal races.
  // Raw `SELECT *` returns Postgres column names (snake_case), so multi-word
  // `amount_paid` and `consignment_triggered` must be read via bracket
  // notation — camelCase access would silently produce `undefined` → NaN
  // writes and an always-false consignment branch.
  const billRows = await tx.execute(
    sql`SELECT * FROM ${vendorBills} WHERE ${vendorBills.id} = ${payment.vendorBillId} FOR UPDATE`
  );
  const bill = billRows.rows[0];
  // Decimal-precise reversal: clamp at zero with Decimal so a series of
  // void/record cycles doesn't accumulate drift.
  const reversedPaidDec = new Decimal(String(bill['amount_paid'])).minus(new Decimal(String(payment.amount)));
  const reversedPaid = (reversedPaidDec.isNegative() ? new Decimal(0) : reversedPaidDec).toDecimalPlaces(2).toFixed(2);
  await tx.update(vendorBills).set({ amountPaid: reversedPaid, status: 'approved', dueReason: bill['consignment_triggered'] ? 'Due because consigned inventory depleted' : 'Approved vendor payable', updatedAt: new Date() }).where(eq(vendorBills.id, bill.id as string));
  return { ok: true, commandId, affectedIds: [paymentId, bill.id as string], toast: 'Vendor payout voided.' };
}

