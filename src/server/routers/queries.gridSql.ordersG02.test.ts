// @vitest-environment node
/**
 * UX-G02 — orders grid allowlist field extension contract (no DB required;
 * gridSql is a pure string builder). Pins:
 *  - the "crossOrderSourceOrders" field exists on the orders view payload
 *  - the conflict key mirrors the server's duplicate-source guard key
 *    (sourceRowKey || batchId — commandBus.ts postSalesOrder sourceKey)
 *  - only OTHER orders are considered, and only OPEN ones (draft/confirmed)
 */
import { describe, it, expect } from 'vitest';
import { gridSql } from './queries';

describe('gridSql(orders) — UX-G02 crossOrderSourceOrders field', () => {
  const sql = gridSql('orders');

  it('keeps every pre-existing orders field (no functionality loss)', () => {
    for (const alias of ['"orderNo"', '"deliveryWindow"', '"inventoryPosted"', '"paymentFollowup"', '"legacyStatusMarkers"', '"validationIssues"', '"invoiceId"', '"invoiceNo"', '"invoiceStatus"', '"postedAt"', '"fulfilledAt"']) {
      expect(sql).toContain(alias);
    }
  });

  it('exposes the crossOrderSourceOrders allowlist field', () => {
    expect(sql).toContain('as "crossOrderSourceOrders"');
  });

  it('uses the same source key as the commandBus duplicate-source guard (sourceRowKey || batchId)', () => {
    expect(sql).toContain('coalesce(sol2.source_row_key, sol2.batch_id::text) = coalesce(sol.source_row_key, sol.batch_id::text)');
    expect(sql).toContain("coalesce(sol.source_row_key, sol.batch_id::text) is not null");
  });

  it('only flags conflicts against OTHER, OPEN orders (draft/confirmed)', () => {
    expect(sql).toContain('sol2.order_id <> sol.order_id');
    expect(sql).toContain("so2.status in ('draft', 'confirmed')");
  });
});
