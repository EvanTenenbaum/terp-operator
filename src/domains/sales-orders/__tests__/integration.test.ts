/**
 * Sales Orders domain — characterization tests.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

describe('sales-orders domain barrel', () => {
  let Sales: Record<string, unknown>;

  beforeAll(async () => {
    Sales = (await import('../index')) as unknown as Record<string, unknown>;
  });

  const expected = [
    'addSalesOrderLine', 'cancelSalesOrder', 'confirmSalesOrder', 'createSalesOrder',
    'postSalesOrder', 'priceSalesOrder', 'removeSalesOrderLine', 'reserveInventoryForOrder',
    'resolveVendorApproval', 'setCustomerPricingRule', 'setDefaultPricingRule',
    'setDeliveryWindow', 'setLineBelowFloorReason', 'setLineLandedCost', 'updateSalesOrderLine',
  ];

  for (const name of expected) {
    it(`exports ${name}`, () => {
      expect(Sales).toHaveProperty(name);
      expect(typeof Sales[name]).toBe('function');
    });
  }
});

describe('sales-orders schema validation', () => {
  it('createSalesOrderPayloadSchema requires customerId', async () => {
    const { createSalesOrderPayloadSchema } = await import('@/server/services/commandBus');
    const result = createSalesOrderPayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('setLineLandedCostPayloadSchema accepts valid basis values', async () => {
    const { setLineLandedCostPayloadSchema } = await import('../../../shared/schemas');
    const result = setLineLandedCostPayloadSchema.safeParse({
      lineId: '00000000-0000-0000-0000-000000000000',
      landedCost: 10,
      basis: 'manual',
    });
    expect(result.success).toBe(true);
  });

  it('setLineLandedCostPayloadSchema rejects invalid basis', async () => {
    const { setLineLandedCostPayloadSchema } = await import('../../../shared/schemas');
    const result = setLineLandedCostPayloadSchema.safeParse({
      lineId: '00000000-0000-0000-0000-000000000000',
      landedCost: 10,
      basis: 'not-valid',
    });
    expect(result.success).toBe(false);
  });
});

describe('sales-orders exception helpers', () => {
  it('BELOW_FLOOR_REASONS includes expected values', async () => {
    const { BELOW_FLOOR_REASONS } = await import('../../../shared/saleLineCostExceptions');
    expect(BELOW_FLOOR_REASONS).toContain('vendor_approval_pending');
    expect(BELOW_FLOOR_REASONS).toContain('waive_margin');
    expect(BELOW_FLOOR_REASONS).toContain('take_loss');
  });

  it('computeOrderExceptionTotals calculates margin waived', async () => {
    const { computeOrderExceptionTotals } = await import('../../../shared/saleLineCostExceptions');
    const lines = [{
      qty: 2, unitPrice: 8, unitCost: 10, priceFloor: 10,
      belowFloorReason: 'loss_recognized' as any, vendorApprovalState: 'none' as const,
    }];
    const totals = computeOrderExceptionTotals(lines);
    expect(typeof totals.marginWaivedTotal).toBe('number');
    expect(typeof totals.lossRecognizedTotal).toBe('number');
  });
});
