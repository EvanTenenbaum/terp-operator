import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { queriesRouter } from './queries';
import { pool } from '../db';
import type { SessionUser } from '../../shared/types';

/**
 * UX-U01 (UX-N01 / UF-014 / JY-16) — entityTimeline query.
 *
 * Sanctioned new read-only procedure: merges a chronological event list per
 * entity (customer/vendor/order/lot) from EXISTING tables only — command
 * journal, payments/allocations, fulfillment marks (pick_lists +
 * fulfillment_lines), media publishes (batch_media). Read-only, operator
 * auth like sibling queries, paginated with limit capped at 100.
 */

const ENTITY_ID = '22222222-2222-2222-2222-222222222222';

function makeUser(): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test',
    email: 't@x',
    role: 'operator',
    workLoop: null
  };
}

function makeCaller() {
  return queriesRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user: makeUser()
  });
}

function mockEmptyPool() {
  return vi.spyOn(pool, 'query').mockImplementation(async () => ({ rows: [] }) as never);
}

function sqlCalls(spy: ReturnType<typeof mockEmptyPool>) {
  return spy.mock.calls.map((call) => String(call[0]).toLowerCase());
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('entityTimeline — source selection per entity type', () => {
  it('order: queries command_journal, payment_allocations, pick_lists, fulfillment_lines — not payments or batch_media', async () => {
    const spy = mockEmptyPool();
    await makeCaller().entityTimeline({ entityType: 'order', entityId: ENTITY_ID });
    const sqls = sqlCalls(spy);
    expect(sqls.some((s) => s.includes('from command_journal'))).toBe(true);
    expect(sqls.some((s) => s.includes('from payment_allocations'))).toBe(true);
    expect(sqls.some((s) => s.includes('from pick_lists'))).toBe(true);
    expect(sqls.some((s) => s.includes('from fulfillment_lines'))).toBe(true);
    expect(sqls.some((s) => s.includes('from payments\n'))).toBe(false);
    expect(sqls.some((s) => s.includes('from batch_media'))).toBe(false);
    // order scoping
    expect(sqls.some((s) => s.includes('i.order_id = $1'))).toBe(true);
    expect(sqls.some((s) => s.includes('pl.order_id = $1'))).toBe(true);
  });

  it('customer: queries payments, allocations, picks, commands', async () => {
    const spy = mockEmptyPool();
    await makeCaller().entityTimeline({ entityType: 'customer', entityId: ENTITY_ID });
    const sqls = sqlCalls(spy);
    expect(sqls.some((s) => s.includes('from payments'))).toBe(true);
    expect(sqls.some((s) => s.includes('p.customer_id = $1'))).toBe(true);
    expect(sqls.some((s) => s.includes('so.customer_id = $1'))).toBe(true);
    expect(sqls.some((s) => s.includes('from command_journal'))).toBe(true);
    expect(sqls.some((s) => s.includes('from batch_media'))).toBe(false);
  });

  it('vendor: queries vendor_payments joined to vendor_bills, plus commands', async () => {
    const spy = mockEmptyPool();
    await makeCaller().entityTimeline({ entityType: 'vendor', entityId: ENTITY_ID });
    const sqls = sqlCalls(spy);
    expect(sqls.some((s) => s.includes('from vendor_payments'))).toBe(true);
    expect(sqls.some((s) => s.includes('vb.vendor_id = $1'))).toBe(true);
    expect(sqls.some((s) => s.includes('from command_journal'))).toBe(true);
  });

  it('lot: queries batch_media (published only) and fulfillment lines by batch, plus commands', async () => {
    const spy = mockEmptyPool();
    await makeCaller().entityTimeline({ entityType: 'lot', entityId: ENTITY_ID });
    const sqls = sqlCalls(spy);
    expect(sqls.some((s) => s.includes('from batch_media') && s.includes("status = 'published'"))).toBe(true);
    expect(sqls.some((s) => s.includes('fl.batch_id = $1'))).toBe(true);
    expect(sqls.some((s) => s.includes('from command_journal'))).toBe(true);
  });

  it('uses parameterized queries — entityId appears in params, never in SQL', async () => {
    const spy = mockEmptyPool();
    await makeCaller().entityTimeline({ entityType: 'order', entityId: ENTITY_ID });
    for (const call of spy.mock.calls) {
      expect(String(call[0])).not.toContain(ENTITY_ID);
      expect((call[1] as unknown[])[0]).toBe(ENTITY_ID);
    }
  });
});

describe('entityTimeline — merge, ordering, pagination', () => {
  function mockRoutedPool() {
    return vi.spyOn(pool, 'query').mockImplementation((async (sqlText: unknown) => {
      const sqlString = String(sqlText).toLowerCase();
      if (sqlString.includes('from command_journal')) {
        return {
          rows: [
            {
              id: 'c1',
              commandName: 'postSalesOrder',
              actorName: 'Op One',
              status: 'ok',
              reversedByCommandId: null,
              occurredAt: new Date('2026-06-03T10:00:00Z')
            }
          ]
        };
      }
      if (sqlString.includes('from payment_allocations')) {
        return {
          rows: [
            {
              id: 'a1',
              amount: '250.00',
              occurredAt: new Date('2026-06-05T10:00:00Z'),
              invoiceNo: 'INV-9',
              orderId: 'order-1',
              paymentId: 'pay-1'
            }
          ]
        };
      }
      if (sqlString.includes('from pick_lists')) {
        return {
          rows: [
            {
              id: 'pl1',
              pickNo: 'PICK-7',
              status: 'fulfilled',
              orderId: 'order-1',
              orderNo: 'SO-1',
              occurredAt: new Date('2026-06-04T10:00:00Z')
            }
          ]
        };
      }
      if (sqlString.includes('from fulfillment_lines')) {
        return { rows: [] };
      }
      return { rows: [] };
    }) as never);
  }

  it('merges all sources sorted newest-first with type/label/actor/target fields', async () => {
    mockRoutedPool();
    const out = await makeCaller().entityTimeline({ entityType: 'order', entityId: ENTITY_ID });
    expect(out.events.map((e) => e.eventType)).toEqual(['allocation', 'pick', 'command']);
    const [allocation, pick, command] = out.events;
    expect(allocation).toMatchObject({
      label: 'Payment applied to INV-9',
      amount: '250.00',
      targetType: 'order',
      targetId: 'order-1',
      refNo: 'INV-9'
    });
    expect(pick).toMatchObject({
      label: 'Pick PICK-7 fulfilled',
      targetType: 'pick',
      targetId: 'pl1',
      refNo: 'PICK-7'
    });
    expect(command).toMatchObject({
      eventType: 'command',
      label: 'postSalesOrder',
      actor: 'Op One',
      status: 'ok',
      targetType: null
    });
    expect(out.nextOffset).toBeNull();
  });

  it('marks reversed commands with status "reversed"', async () => {
    vi.spyOn(pool, 'query').mockImplementation((async (sqlText: unknown) => {
      if (String(sqlText).toLowerCase().includes('from command_journal')) {
        return {
          rows: [
            {
              id: 'c2',
              commandName: 'postReceipt',
              actorName: 'Op',
              status: 'ok',
              reversedByCommandId: 'rev-1',
              occurredAt: new Date('2026-06-01T00:00:00Z')
            }
          ]
        };
      }
      return { rows: [] };
    }) as never);
    const out = await makeCaller().entityTimeline({ entityType: 'lot', entityId: ENTITY_ID });
    expect(out.events[0].status).toBe('reversed');
  });

  it('paginates with limit + offset and reports nextOffset when more rows exist', async () => {
    vi.spyOn(pool, 'query').mockImplementation((async (sqlText: unknown) => {
      if (String(sqlText).toLowerCase().includes('from command_journal')) {
        return {
          rows: Array.from({ length: 5 }, (_, i) => ({
            id: `c${i}`,
            commandName: `cmd${i}`,
            actorName: 'Op',
            status: 'ok',
            reversedByCommandId: null,
            occurredAt: new Date(Date.UTC(2026, 5, 10 - i))
          }))
        };
      }
      return { rows: [] };
    }) as never);
    const page1 = await makeCaller().entityTimeline({ entityType: 'lot', entityId: ENTITY_ID, limit: 2, offset: 0 });
    expect(page1.events.map((e) => e.label)).toEqual(['cmd0', 'cmd1']);
    expect(page1.nextOffset).toBe(2);
    const page2 = await makeCaller().entityTimeline({ entityType: 'lot', entityId: ENTITY_ID, limit: 2, offset: 2 });
    expect(page2.events.map((e) => e.label)).toEqual(['cmd2', 'cmd3']);
  });

  it('rejects limit above the 100 cap and non-uuid entityId (zod input gate)', async () => {
    mockEmptyPool();
    const caller = makeCaller();
    await expect(caller.entityTimeline({ entityType: 'order', entityId: ENTITY_ID, limit: 500 })).rejects.toThrow();
    await expect(caller.entityTimeline({ entityType: 'order', entityId: 'not-a-uuid' })).rejects.toThrow();
  });
});
