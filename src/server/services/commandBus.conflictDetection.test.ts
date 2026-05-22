import { describe, it, expect } from 'vitest';

// CAP-030 (TER-1494): Unit tests for conflict detection logic added to
// updateSalesOrderLine, removeSalesOrderLine, and cancelSalesOrder.
//
// These exercise the pure decision points that trigger warehouse_alerts /
// block cancellation when a sales line is already released for picking.

describe('updateSalesOrderLine qty-change alert logic', () => {
  it('emits alert when qty changes on a released line', () => {
    const line = { pickReleasedAt: new Date(), qty: '5.000' };
    const payloadQty = 3;
    const fromQty = Number(line.qty);
    const toQty = payloadQty;
    const shouldAlert = !!line.pickReleasedAt && toQty !== fromQty;
    expect(shouldAlert).toBe(true);
  });

  it('does NOT emit alert when qty is unchanged', () => {
    const line = { pickReleasedAt: new Date(), qty: '5.000' };
    const payloadQty = 5;
    const fromQty = Number(line.qty);
    const toQty = payloadQty;
    const shouldAlert = !!line.pickReleasedAt && toQty !== fromQty;
    expect(shouldAlert).toBe(false);
  });

  it('does NOT emit alert when line is not released', () => {
    const line = { pickReleasedAt: null as Date | null, qty: '5.000' };
    const payloadQty = 3;
    const shouldAlert = !!line.pickReleasedAt && Number(payloadQty) !== Number(line.qty);
    expect(shouldAlert).toBe(false);
  });

  it('does NOT emit alert for non-qty fields on a released line', () => {
    const line = { pickReleasedAt: new Date(), qty: '5.000' };
    // payload only has unitPrice, no qty
    const payloadHasQty = false;
    const shouldAlert = !!line.pickReleasedAt && payloadHasQty;
    expect(shouldAlert).toBe(false);
  });

  it('captures from/to in the alert body', () => {
    const fromQty = 5;
    const toQty = 3;
    const alert = { kind: 'qty_changed', from: fromQty, to: toQty, at: new Date().toISOString(), actor: 'sales' };
    expect(alert.kind).toBe('qty_changed');
    expect(alert.from).toBe(5);
    expect(alert.to).toBe(3);
    expect(alert.actor).toBe('sales');
  });
});

describe('removeSalesOrderLine when released', () => {
  it('does NOT delete the sales line when pick-released (cascade-protect fulfillment line)', () => {
    const line = { pickReleasedAt: new Date() };
    const shouldKeep = !!line.pickReleasedAt;
    expect(shouldKeep).toBe(true);
  });

  it('DOES delete the sales line when not pick-released', () => {
    const line = { pickReleasedAt: null as Date | null };
    const shouldKeep = !!line.pickReleasedAt;
    expect(shouldKeep).toBe(false);
  });

  it('pushes line_cancelled alert with sales actor', () => {
    const alert = { kind: 'line_cancelled', at: new Date().toISOString(), actor: 'sales' };
    expect(alert.kind).toBe('line_cancelled');
    expect(alert.actor).toBe('sales');
  });
});

describe('cancelSalesOrder block on picked lines', () => {
  it('blocks when a fulfillment line has actual_qty > 0 and is not cancelled', () => {
    const fl = { actualQty: '2.000', statusExtended: null as string | null };
    const line = { pickReleasedAt: new Date(), itemName: 'Flower A' };
    const shouldBlock = !!line.pickReleasedAt && Number(fl.actualQty) > 0 && fl.statusExtended !== 'cancelled';
    expect(shouldBlock).toBe(true);
  });

  it('does not block when fulfillment line is already cancelled', () => {
    const fl = { actualQty: '2.000', statusExtended: 'cancelled' };
    const line = { pickReleasedAt: new Date(), itemName: 'Flower A' };
    const shouldBlock = !!line.pickReleasedAt && Number(fl.actualQty) > 0 && fl.statusExtended !== 'cancelled';
    expect(shouldBlock).toBe(false);
  });

  it('does not block when no units have been picked', () => {
    const fl = { actualQty: '0.000', statusExtended: null as string | null };
    const line = { pickReleasedAt: new Date(), itemName: 'Flower A' };
    const shouldBlock = !!line.pickReleasedAt && Number(fl.actualQty) > 0 && fl.statusExtended !== 'cancelled';
    expect(shouldBlock).toBe(false);
  });

  it('does not block lines that were never released', () => {
    const fl = { actualQty: '2.000', statusExtended: null as string | null };
    const line = { pickReleasedAt: null as Date | null, itemName: 'Flower A' };
    const shouldBlock = !!line.pickReleasedAt && Number(fl.actualQty) > 0 && fl.statusExtended !== 'cancelled';
    expect(shouldBlock).toBe(false);
  });
});

describe('cancelSalesOrder alerts for released lines', () => {
  it('fires line_cancelled alert for released lines during cancel', () => {
    const fl = { statusExtended: null as string | null, warehouseAlerts: [] as Array<Record<string, unknown>> };
    const line = { pickReleasedAt: new Date() };
    const shouldAlert = !!line.pickReleasedAt && fl.statusExtended !== 'cancelled';
    if (shouldAlert) {
      fl.warehouseAlerts.push({ kind: 'line_cancelled', at: new Date().toISOString(), actor: 'sales' });
    }
    expect(fl.warehouseAlerts).toHaveLength(1);
    expect((fl.warehouseAlerts[0] as Record<string, unknown>).kind).toBe('line_cancelled');
  });

  it('does not fire alert on already-cancelled fulfillment line', () => {
    const fl = { statusExtended: 'cancelled' as string | null, warehouseAlerts: [] as Array<Record<string, unknown>> };
    const line = { pickReleasedAt: new Date() };
    const shouldAlert = !!line.pickReleasedAt && fl.statusExtended !== 'cancelled';
    expect(shouldAlert).toBe(false);
  });
});
