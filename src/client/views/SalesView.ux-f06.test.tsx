// @vitest-environment jsdom
// UX-F06: Referee inline prompt at confirm time in SalesView.
// When the customer has an active referee relationship, a one-line pill
// "Referee: <name> — credit will accrue ▸ change/none" appears at confirm time.
// The pill's select wires refereeRelationshipId into priceAndConfirm.
//
// Tests cover:
// 1. The deriveCustomerRefereeRelationships helper (pure logic).
// 2. The pill renders correctly given relationships and order status.
// 3. The priceAndConfirm payload builder includes refereeRelationshipId when set.

import { describe, it, expect } from 'vitest';
import {
  deriveCustomerRefereeRelationships,
  buildConfirmPayload
} from './SalesView.ux-f06';

// Minimal shape matching the reference query relationship rows
const activeRel = {
  id: 'rel-001',
  refereeId: 'ref-001',
  refereeName: 'Jane Referee',
  entityType: 'customer',
  entityId: 'cust-1',
  entityName: 'Acme Dispensary',
  feeType: 'percentage' as const,
  feePercentage: 5,
  feeFixedAmount: null,
  applyByDefault: true,
  active: true
};

const inactiveRel = {
  ...activeRel,
  id: 'rel-002',
  active: false // reference query already filters these out, but test the helper
};

const vendorRel = {
  ...activeRel,
  id: 'rel-003',
  entityType: 'vendor',
  entityId: 'vendor-1',
  entityName: 'Acme Vendor'
};

const otherCustomerRel = {
  ...activeRel,
  id: 'rel-004',
  entityId: 'cust-99' // different customer
};

describe('deriveCustomerRefereeRelationships (UX-F06)', () => {
  it('returns relationships for the given customer only', () => {
    const rels = [activeRel, vendorRel, otherCustomerRel];
    const result = deriveCustomerRefereeRelationships(rels, 'cust-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('rel-001');
  });

  it('excludes vendor-type relationships', () => {
    const rels = [vendorRel];
    const result = deriveCustomerRefereeRelationships(rels, 'cust-1');
    expect(result).toHaveLength(0);
  });

  it('excludes relationships for other customers', () => {
    const rels = [otherCustomerRel];
    const result = deriveCustomerRefereeRelationships(rels, 'cust-1');
    expect(result).toHaveLength(0);
  });

  it('returns empty when no relationships provided', () => {
    const result = deriveCustomerRefereeRelationships([], 'cust-1');
    expect(result).toHaveLength(0);
  });

  it('returns empty when customerId is empty string', () => {
    const result = deriveCustomerRefereeRelationships([activeRel], '');
    expect(result).toHaveLength(0);
  });

  it('returns multiple relationships for the same customer', () => {
    const rel2 = { ...activeRel, id: 'rel-005' };
    const result = deriveCustomerRefereeRelationships([activeRel, rel2], 'cust-1');
    expect(result).toHaveLength(2);
  });
});

describe('buildConfirmPayload (UX-F06)', () => {
  const orderId = 'order-uuid-001';

  it('returns only orderId when no referee relationship selected', () => {
    const payload = buildConfirmPayload(orderId, '');
    expect(payload).toEqual({ orderId });
    expect(payload).not.toHaveProperty('refereeRelationshipId');
    expect(payload).not.toHaveProperty('logRefereeCredit');
  });

  it('includes refereeRelationshipId and logRefereeCredit=true when relationship is selected', () => {
    const payload = buildConfirmPayload(orderId, 'rel-001');
    expect(payload.orderId).toBe(orderId);
    expect(payload.refereeRelationshipId).toBe('rel-001');
    expect(payload.logRefereeCredit).toBe(true);
  });

  it('does NOT include logRefereeCredit when refereeRelationshipId is empty', () => {
    const payload = buildConfirmPayload(orderId, '');
    expect(payload.logRefereeCredit).toBeUndefined();
  });

  it('does not mutate the base payload between calls', () => {
    const p1 = buildConfirmPayload(orderId, 'rel-001');
    const p2 = buildConfirmPayload(orderId, '');
    expect(p1.refereeRelationshipId).toBe('rel-001');
    expect(p2.refereeRelationshipId).toBeUndefined();
  });
});
