import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { TRPCError } from '@trpc/server';
import * as documentSnapshots from '../services/documentSnapshots';
import { paymentsRouter } from './payments.router';
import type { Role, SessionUser } from '../../shared/types';
import type { ExternalReceiptProjection, InternalReceiptProjection } from '../services/projections/types';

const PAY_ID = '11111111-1111-1111-1111-111111111111';
const VP_ID = '44444444-4444-4444-4444-444444444444';

function makeUser(role: Role = 'manager'): SessionUser {
  return { id: '00000000-0000-0000-0000-000000000001', name: 'Test', email: 't@x', role, workLoop: null };
}
function makeCaller(role: Role = 'manager') {
  return paymentsRouter.createCaller({ req: {} as Request, res: {} as Response, io: {} as SocketServer, user: makeUser(role) });
}

function makeExternalPayment(): ExternalReceiptProjection {
  return { kind: 'payment_received', header: { title: 'Payment Received', counterparty: 'Big Buyer Co', dateISO: '2026-05-22T12:00:00.000Z', documentNo: 'CHK-1234' }, lines: [], totals: { subtotal: 500, total: 500 }, projectionVersion: 1, __EXTERNAL_PROJECTED__: true };
}
function makeInternalPayment(): InternalReceiptProjection {
  return { kind: 'payment_received', header: { title: 'Payment Received', counterparty: 'Big Buyer Co', dateISO: '2026-05-22T12:00:00.000Z', documentNo: 'CHK-1234' }, lines: [], totals: { subtotal: 500, total: 500 }, projectionVersion: 1, internalNotes: 'partial allocation', __INTERNAL_ONLY__: true };
}
function makeExternalVendorPayout(): ExternalReceiptProjection {
  return { kind: 'vendor_payout', header: { title: 'Vendor Payout', counterparty: 'Acme Farms', dateISO: '2026-05-22T15:30:00.000Z', documentNo: 'WIRE-7788' }, lines: [], totals: { subtotal: 300, total: 300 }, projectionVersion: 1, __EXTERNAL_PROJECTED__: true };
}
function makeInternalVendorPayout(): InternalReceiptProjection {
  return { kind: 'vendor_payout', header: { title: 'Vendor Payout', counterparty: 'Acme Farms', dateISO: '2026-05-22T15:30:00.000Z', documentNo: 'WIRE-7788' }, lines: [], totals: { subtotal: 300, total: 300 }, projectionVersion: 1, internalNotes: 'check stub mismatched', __INTERNAL_ONLY__: true };
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('paymentExternalReceipt', () => {
  it('returns the projection for the given payment id', async () => {
    const projection = makeExternalPayment();
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(projection);
    const result = await makeCaller('operator').paymentExternalReceipt({ paymentId: PAY_ID });
    expect(result).toEqual(projection);
    expect(documentSnapshots.getExternalReceipt).toHaveBeenCalledWith(expect.anything(), 'payment', PAY_ID);
  });
  it('returns null when no receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    expect(await makeCaller('operator').paymentExternalReceipt({ paymentId: PAY_ID })).toBeNull();
  });
});

describe('paymentInternalReceipt', () => {
  it('returns the projection for manager+ callers', async () => {
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(makeInternalPayment());
    expect(await makeCaller('manager').paymentInternalReceipt({ paymentId: PAY_ID })).toEqual(makeInternalPayment());
    expect(documentSnapshots.getInternalReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'manager' }), 'payment', PAY_ID);
  });
  it('throws FORBIDDEN for operator role', async () => {
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockImplementation(async () => { throw new TRPCError({ code: 'FORBIDDEN', message: 'manager required' }); });
    await expect(makeCaller('operator').paymentInternalReceipt({ paymentId: PAY_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('paymentSignalText', () => {
  it('returns signal text when external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalPayment());
    const result = await makeCaller('operator').paymentSignalText({ paymentId: PAY_ID });
    expect(result).toBeTypeOf('string');
    expect(result).toContain('Payment Received CHK-1234');
    expect(result).toContain('To: Big Buyer Co');
    expect(result).toContain('Total: 500');
    expect(result).not.toMatch(/<[^>]+>/);
  });
  it('returns null when no receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    expect(await makeCaller('operator').paymentSignalText({ paymentId: PAY_ID })).toBeNull();
  });
});

describe('vendorPaymentExternalReceipt', () => {
  it('returns the projection for the given vendor_payment id', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalVendorPayout());
    const result = await makeCaller('operator').vendorPaymentExternalReceipt({ vendorPaymentId: VP_ID });
    expect(result).toEqual(makeExternalVendorPayout());
    expect(documentSnapshots.getExternalReceipt).toHaveBeenCalledWith(expect.anything(), 'vendor_payment', VP_ID);
  });
  it('returns null when no receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    expect(await makeCaller('operator').vendorPaymentExternalReceipt({ vendorPaymentId: VP_ID })).toBeNull();
  });
});

describe('vendorPaymentInternalReceipt', () => {
  it('returns the projection for manager+ callers', async () => {
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(makeInternalVendorPayout());
    expect(await makeCaller('manager').vendorPaymentInternalReceipt({ vendorPaymentId: VP_ID })).toEqual(makeInternalVendorPayout());
    expect(documentSnapshots.getInternalReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'manager' }), 'vendor_payment', VP_ID);
  });
  it('throws FORBIDDEN for operator role', async () => {
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockImplementation(async () => { throw new TRPCError({ code: 'FORBIDDEN', message: 'manager required' }); });
    await expect(makeCaller('operator').vendorPaymentInternalReceipt({ vendorPaymentId: VP_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('vendorPaymentSignalText', () => {
  it('returns signal text when external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalVendorPayout());
    const result = await makeCaller('operator').vendorPaymentSignalText({ vendorPaymentId: VP_ID });
    expect(result).toBeTypeOf('string');
    expect(result).toContain('Vendor Payout WIRE-7788');
    expect(result).toContain('To: Acme Farms');
    expect(result).toContain('Total: 300');
    expect(result).not.toMatch(/<[^>]+>/);
  });
  it('returns null when no receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    expect(await makeCaller('operator').vendorPaymentSignalText({ vendorPaymentId: VP_ID })).toBeNull();
  });
});
