import { describe, expect, it } from 'vitest';
import {
  buildCustomerSafeRelationshipStatus,
  buildOrderStatusSummary,
  buildVendorSafeRelationshipStatus,
  isCustomerSafeKey,
  sanitizeCustomerSafe
} from './customerSafeStatus';

/**
 * UX-U01 / UX-N02 — customer-safe status copy gating.
 *
 * Contract: forbidden fields (cost, margin, internal notes, reasons,
 * snapshots, payloads) NEVER appear in customer-facing output, even when
 * present in the input object. The catalog/offer surfaces (UX-F01/R03)
 * reuse this same gate.
 */

const SENTINELS = {
  unitCost: 'SECRET_COST_777',
  internalMargin: 'SECRET_MARGIN_888',
  estimatedMargin: 'SECRET_EST_MARGIN_999',
  notes: 'SECRET_NOTE_111',
  buyerNotes: 'SECRET_BUYER_NOTE_222',
  internalNotes: 'SECRET_INTERNAL_NOTE_333',
  belowFloorReason: 'SECRET_FLOOR_444',
  belowFloorNote: 'SECRET_FLOOR_NOTE_555',
  landedCostReason: 'SECRET_LANDED_666',
  reason: 'SECRET_REASON_000',
  impactPreview: 'SECRET_IMPACT_123',
  marginWaivedTotal: 'SECRET_WAIVED_456',
  priceFloor: 'SECRET_PRICE_FLOOR_789',
  beforeSnapshot: 'SECRET_SNAPSHOT_BEFORE',
  inputPayload: 'SECRET_PAYLOAD',
  creditLimit: 'SECRET_CREDIT_LIMIT'
};

describe('isCustomerSafeKey', () => {
  it('rejects cost/margin/floor/internal/notes/reason-style keys', () => {
    for (const key of Object.keys(SENTINELS)) {
      expect(isCustomerSafeKey(key), `${key} must be forbidden`).toBe(false);
    }
  });

  it('accepts customer-facing keys', () => {
    for (const key of ['orderNo', 'status', 'total', 'deliveryWindow', 'createdAt', 'packed', 'name', 'availableQty', 'unitPrice', 'tags']) {
      expect(isCustomerSafeKey(key), `${key} must be allowed`).toBe(true);
    }
  });
});

describe('sanitizeCustomerSafe', () => {
  it('strips every forbidden field, including nested objects and arrays', () => {
    const input = {
      orderNo: 'SO-1001',
      status: 'posted',
      ...SENTINELS,
      lines: [
        { itemName: 'Item A', qty: 5, unitPrice: 100, unitCost: SENTINELS.unitCost, belowFloorNote: SENTINELS.belowFloorNote },
        { itemName: 'Item B', qty: 2, unitPrice: 50, notes: SENTINELS.notes }
      ],
      meta: { internalMargin: SENTINELS.internalMargin, deliveryWindow: 'next week' }
    };
    const out = sanitizeCustomerSafe(input);
    const serialized = JSON.stringify(out);
    for (const sentinel of Object.values(SENTINELS)) {
      expect(serialized).not.toContain(sentinel);
    }
    // Safe fields survive, including nested ones.
    expect(out.orderNo).toBe('SO-1001');
    expect((out.lines as Array<Record<string, unknown>>)[0].itemName).toBe('Item A');
    expect((out.meta as Record<string, unknown>).deliveryWindow).toBe('next week');
  });

  it('does not mutate the input object', () => {
    const input = { orderNo: 'SO-1', notes: 'keep-me-in-input' };
    sanitizeCustomerSafe(input);
    expect(input.notes).toBe('keep-me-in-input');
  });
});

describe('buildOrderStatusSummary', () => {
  it('never includes forbidden fields even when present in input', () => {
    const order = {
      orderNo: 'SO-2002',
      status: 'posted',
      total: '1234.5',
      deliveryWindow: 'Friday AM',
      createdAt: '2026-06-01T12:00:00Z',
      packed: true,
      ...SENTINELS
    };
    const text = buildOrderStatusSummary(order, [
      { eventType: 'payment', label: 'Payment received (cash)', occurredAt: '2026-06-05T12:00:00Z', status: 'posted' }
    ]);
    for (const sentinel of Object.values(SENTINELS)) {
      expect(text).not.toContain(sentinel);
    }
    expect(text).not.toMatch(/cost|margin/i);
    // Status story content is present.
    expect(text).toContain('SO-2002 — posted');
    expect(text).toContain('Order total: $1,234.50');
    expect(text).toContain('Delivery window: Friday AM');
    expect(text).toContain('Packed: yes');
    expect(text).toContain('Payment received (cash) (posted)');
  });

  it('handles a minimal order and no events', () => {
    const text = buildOrderStatusSummary({});
    expect(text).toBe('Order');
  });

  it('caps recent activity at 6 events', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      eventType: 'command',
      label: `Event ${i}`,
      occurredAt: '2026-06-05T12:00:00Z',
      status: null
    }));
    const text = buildOrderStatusSummary({ orderNo: 'SO-1' }, events);
    expect(text).toContain('Event 5');
    expect(text).not.toContain('Event 6');
  });
});

describe('relationship status builders — RelationshipDrawer parity (UX-N02 convergence)', () => {
  it('customer text is byte-identical to the previous inline RelationshipDrawer format', () => {
    const text = buildCustomerSafeRelationshipStatus({
      name: 'Harbor Wellness',
      openBalance: 1500.5,
      orders: [
        { refNo: 'SO-1', status: 'posted' },
        { refNo: 'SO-2', status: 'confirmed' },
        { refNo: 'SO-3', status: 'draft' },
        { refNo: 'SO-4', status: 'draft' }
      ],
      invoices: [{ refNo: 'INV-1', status: 'open' }]
    });
    expect(text).toBe(
      [
        'Harbor Wellness',
        'Open balance: $1,500.50',
        'Recent orders: SO-1 posted, SO-2 confirmed, SO-3 draft',
        'Recent invoices: INV-1 open'
      ].join('\n')
    );
  });

  it('customer text shows "none" for empty orders/invoices', () => {
    const text = buildCustomerSafeRelationshipStatus({ name: 'C', openBalance: 0 });
    expect(text).toContain('Recent orders: none');
    expect(text).toContain('Recent invoices: none');
  });

  it('vendor text is byte-identical to the previous inline RelationshipDrawer format', () => {
    const text = buildVendorSafeRelationshipStatus({
      name: 'North Farms',
      openPayables: 980,
      scheduledPayoutCount: 2,
      bills: [{ refNo: 'VBILL-9', status: 'scheduled' }]
    });
    expect(text).toBe(
      [
        'North Farms',
        'Open payables: $980.00',
        'Scheduled payouts: 2',
        'Recent bills: VBILL-9 scheduled'
      ].join('\n')
    );
  });
});
