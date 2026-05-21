import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { TRPCError } from '@trpc/server';
import * as documentSnapshots from '../services/documentSnapshots';
import { queriesRouter } from './queries';
import type { Role, SessionUser } from '../../shared/types';
import type { ExternalReceiptProjection, InternalReceiptProjection } from '../services/projections/types';

const PO_ID = '11111111-1111-1111-1111-111111111111';

function makeUser(role: Role = 'manager'): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test',
    email: 't@x',
    role,
    workLoop: null
  };
}

function makeCaller(role: Role = 'manager') {
  return queriesRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user: makeUser(role)
  });
}

function makeExternalProjection(): ExternalReceiptProjection {
  return {
    kind: 'purchase_finalization',
    header: { title: 'Purchase Order', counterparty: 'Acme Farms', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'PO-1001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 50, subtotal: 100 }],
    totals: { subtotal: 100, total: 100 },
    projectionVersion: 1,
    __EXTERNAL_PROJECTED__: true
  };
}

function makeInternalProjection(): InternalReceiptProjection {
  return {
    kind: 'purchase_finalization',
    header: { title: 'Purchase Order', counterparty: 'Acme Farms', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'PO-1001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 50, subtotal: 100 }],
    totals: { subtotal: 100, total: 100 },
    projectionVersion: 1,
    internalNotes: 'paid in cash',
    __INTERNAL_ONLY__: true
  };
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('purchaseOrderExternalReceipt', () => {
  it('returns the projection from getExternalReceipt for the given PO id', async () => {
    const projection = makeExternalProjection();
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(projection);

    const caller = makeCaller('operator');
    const result = await caller.purchaseOrderExternalReceipt({ purchaseOrderId: PO_ID });

    expect(result).toEqual(projection);
    expect(documentSnapshots.getExternalReceipt).toHaveBeenCalledWith(
      expect.anything(), // pool
      'purchase_order',
      PO_ID
    );
  });

  it('returns null when no receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.purchaseOrderExternalReceipt({ purchaseOrderId: PO_ID })).toBeNull();
  });
});

describe('purchaseOrderInternalReceipt', () => {
  it('returns the projection for manager+ callers', async () => {
    const projection = makeInternalProjection();
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(projection);

    const caller = makeCaller('manager');
    expect(await caller.purchaseOrderInternalReceipt({ purchaseOrderId: PO_ID })).toEqual(projection);
  });

  it('throws FORBIDDEN for operator role (assertRole inside getInternalReceipt fires)', async () => {
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockImplementation(async () => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This action requires manager access.' });
    });
    const caller = makeCaller('operator');
    await expect(caller.purchaseOrderInternalReceipt({ purchaseOrderId: PO_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN'
    });
  });
});

describe('purchaseOrderSignalText', () => {
  it('returns the rendered signal text when an external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalProjection());

    const caller = makeCaller('operator');
    const result = await caller.purchaseOrderSignalText({ purchaseOrderId: PO_ID });

    expect(result).toBeTypeOf('string');
    expect(result).toContain('Purchase Order PO-1001');
    expect(result).toContain('To: Acme Farms');
    expect(result).toContain('- Sunset OG x 2 @ 50 = 100');
    expect(result).toContain('Total: 100');
    // Plain text only — no HTML tags.
    expect(result).not.toMatch(/<[^>]+>/);
  });

  it('returns null when no external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.purchaseOrderSignalText({ purchaseOrderId: PO_ID })).toBeNull();
  });
});
