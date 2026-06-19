import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { TRPCError } from '@trpc/server';
import * as documentSnapshots from '../services/documentSnapshots';
import { salesOrdersRouter } from './sales-orders.router';
import { pool } from '../db';
import type { Role, SessionUser } from '../../shared/types';
import type { ExternalReceiptProjection, InternalReceiptProjection } from '../services/projections/types';

const SO_ID = '11111111-1111-1111-1111-111111111111';
const INV_ID = '44444444-4444-4444-4444-444444444444';

function makeUser(role: Role = 'manager'): SessionUser {
  return { id: '00000000-0000-0000-0000-000000000001', name: 'Test', email: 't@x', role, workLoop: null };
}

function makeCaller(role: Role = 'manager') {
  return salesOrdersRouter.createCaller({ req: {} as Request, res: {} as Response, io: {} as SocketServer, user: makeUser(role) });
}

function makeExternalConfirmation(): ExternalReceiptProjection {
  return {
    kind: 'sales_confirmation',
    header: { title: 'Sales Confirmation', counterparty: 'Acme Buyers', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'SO-2001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 100, subtotal: 200 }],
    totals: { subtotal: 200, total: 200 }, projectionVersion: 1, __EXTERNAL_PROJECTED__: true
  };
}

function makeInternalConfirmation(): InternalReceiptProjection {
  return {
    kind: 'sales_confirmation',
    header: { title: 'Sales Confirmation', counterparty: 'Acme Buyers', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'SO-2001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 100, subtotal: 200 }],
    totals: { subtotal: 200, total: 200 }, projectionVersion: 1,
    cogs: { perLine: [{ name: 'Sunset OG', unitCost: 50 }], total: 100 },
    margin: { perLine: [{ name: 'Sunset OG', marginAbs: 100, marginPct: 50 }], total: 100 },
    __INTERNAL_ONLY__: true
  };
}

function makeExternalInvoice(): ExternalReceiptProjection {
  return {
    kind: 'invoice',
    header: { title: 'Invoice', counterparty: 'Acme Buyers', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'INV-9001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 100, subtotal: 200 }],
    totals: { subtotal: 200, total: 200 }, footer: { reference: '2026-05-28T00:00:00.000Z' },
    projectionVersion: 1, __EXTERNAL_PROJECTED__: true
  };
}

function makeInternalInvoice(): InternalReceiptProjection {
  return {
    ...makeExternalInvoice(),
    __EXTERNAL_PROJECTED__: undefined as unknown as never,
    cogs: { perLine: [{ name: 'Sunset OG', unitCost: 50 }], total: 100 },
    __INTERNAL_ONLY__: true
  } as InternalReceiptProjection;
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('salesOrderExternalReceipt', () => {
  it('returns the invoice external projection when the invoice live head exists (invoice wins over confirmation)', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: INV_ID }], rowCount: 1 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const invoiceProjection = makeExternalInvoice();
    const getExt = vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(invoiceProjection);
    const caller = makeCaller('operator');
    const result = await caller.salesOrderExternalReceipt({ salesOrderId: SO_ID });
    expect(result).toEqual(invoiceProjection);
    expect(getExt).toHaveBeenCalledWith(expect.anything(), 'invoice', INV_ID);
    invoiceLookup.mockRestore();
  });

  it('falls back to the sales_confirmation external projection when no invoice exists yet', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const confirmation = makeExternalConfirmation();
    const getExt = vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(confirmation);
    const caller = makeCaller('operator');
    const result = await caller.salesOrderExternalReceipt({ salesOrderId: SO_ID });
    expect(result).toEqual(confirmation);
    expect(getExt).toHaveBeenCalledWith(expect.anything(), 'sales_order', SO_ID);
    invoiceLookup.mockRestore();
  });

  it('returns null when neither an invoice nor a confirmation snapshot exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.salesOrderExternalReceipt({ salesOrderId: SO_ID })).toBeNull();
    invoiceLookup.mockRestore();
  });
});

describe('salesOrderInternalReceipt', () => {
  it('returns the invoice internal projection for manager+ when an invoice exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: INV_ID }], rowCount: 1 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const projection = makeInternalInvoice();
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(projection);
    const caller = makeCaller('manager');
    expect(await caller.salesOrderInternalReceipt({ salesOrderId: SO_ID })).toEqual(projection);
    invoiceLookup.mockRestore();
  });

  it('falls back to the sales_confirmation internal projection when no invoice exists yet', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const projection = makeInternalConfirmation();
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(projection);
    const caller = makeCaller('manager');
    expect(await caller.salesOrderInternalReceipt({ salesOrderId: SO_ID })).toEqual(projection);
    invoiceLookup.mockRestore();
  });

  it('throws FORBIDDEN for operator role (assertRole inside getInternalReceipt fires)', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: INV_ID }], rowCount: 1 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockImplementation(async () => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This action requires manager access.' });
    });
    const caller = makeCaller('operator');
    await expect(caller.salesOrderInternalReceipt({ salesOrderId: SO_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    invoiceLookup.mockRestore();
  });
});

describe('salesOrderSignalText', () => {
  it('renders the invoice external projection when an invoice live head exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: INV_ID }], rowCount: 1 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalInvoice());
    const caller = makeCaller('operator');
    const result = await caller.salesOrderSignalText({ salesOrderId: SO_ID });
    expect(result).toBeTypeOf('string');
    expect(result).toContain('Invoice INV-9001');
    expect(result).toContain('To: Acme Buyers');
    expect(result).toContain('Total: 200');
    expect(result).not.toMatch(/<[^>]+>/);
    invoiceLookup.mockRestore();
  });

  it('falls back to the confirmation external projection when no invoice exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalConfirmation());
    const caller = makeCaller('operator');
    const result = await caller.salesOrderSignalText({ salesOrderId: SO_ID });
    expect(result).toContain('Sales Confirmation SO-2001');
    invoiceLookup.mockRestore();
  });

  it('returns null when neither a confirmation nor an invoice snapshot exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.salesOrderSignalText({ salesOrderId: SO_ID })).toBeNull();
    invoiceLookup.mockRestore();
  });
});
