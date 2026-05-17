import { describe, it, expect, vi } from 'vitest';
import {
  calculateProcessingFee,
  splitProcessingFee,
  calculateCustomerCredit,
  createPaymentProcessor,
  markUserFeeCollected,
  updateProcessorFeeStatus
} from './processorCommands';
import type { PaymentProcessor } from '../schema';

describe('calculateProcessingFee', () => {
  it('calculates percentage fee correctly', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: 'percentage',
      feePercentage: '3.50',
      feeFixedAmount: null
    };

    const fee = calculateProcessingFee(100, processor as PaymentProcessor);
    expect(fee).toBe(3.50);
  });

  it('calculates fixed fee correctly', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: 'fixed',
      feePercentage: null,
      feeFixedAmount: '2.00'
    };

    const fee = calculateProcessingFee(100, processor as PaymentProcessor);
    expect(fee).toBe(2.00);
  });

  it('calculates hybrid fee correctly', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: 'hybrid',
      feePercentage: '2.50',
      feeFixedAmount: '0.30'
    };

    const fee = calculateProcessingFee(100, processor as PaymentProcessor);
    expect(fee).toBe(2.80);
  });

  it('throws error for negative amount', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: 'percentage',
      feePercentage: '3.50',
      feeFixedAmount: null
    };

    expect(() => calculateProcessingFee(-100, processor as PaymentProcessor))
      .toThrow('Transaction amount cannot be negative');
  });

  it('calculates fee correctly for zero amount', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: 'percentage',
      feePercentage: '3.50',
      feeFixedAmount: null
    };

    const fee = calculateProcessingFee(0, processor as PaymentProcessor);
    expect(fee).toBe(0);
  });

  it('throws error when percentage fee type missing feePercentage', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: 'percentage',
      feePercentage: null,
      feeFixedAmount: null
    };

    expect(() => calculateProcessingFee(100, processor as PaymentProcessor))
      .toThrow('Fee percentage is required for percentage fee type');
  });

  it('throws error when fixed fee type missing feeFixedAmount', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: 'fixed',
      feePercentage: null,
      feeFixedAmount: null
    };

    expect(() => calculateProcessingFee(100, processor as PaymentProcessor))
      .toThrow('Fee fixed amount is required for fixed fee type');
  });

  it('throws error when hybrid fee type missing required fields', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: 'hybrid',
      feePercentage: '2.50',
      feeFixedAmount: null
    };

    expect(() => calculateProcessingFee(100, processor as PaymentProcessor))
      .toThrow('Both fee percentage and fixed amount are required for hybrid fee type');
  });

  it('throws error when fee type is missing', () => {
    const processor: Partial<PaymentProcessor> = {
      feeType: null as any,
      feePercentage: '3.50',
      feeFixedAmount: null
    };

    expect(() => calculateProcessingFee(100, processor as PaymentProcessor))
      .toThrow('Processor must have a fee type configured');
  });
});

describe('splitProcessingFee', () => {
  it('splits fee 25/75 correctly', () => {
    const result = splitProcessingFee(4.00, 25);
    expect(result.userShare).toBe(1.00);
    expect(result.processorShare).toBe(3.00);
  });

  it('splits fee 50/50 correctly', () => {
    const result = splitProcessingFee(10.00, 50);
    expect(result.userShare).toBe(5.00);
    expect(result.processorShare).toBe(5.00);
  });

  it('throws error for invalid split percent', () => {
    expect(() => splitProcessingFee(4.00, 150))
      .toThrow('User split percent must be between 0 and 100');
  });

  it('splits fee correctly when user gets 0%', () => {
    const result = splitProcessingFee(10.00, 0);
    expect(result.userShare).toBe(0);
    expect(result.processorShare).toBe(10.00);
  });

  it('splits fee correctly when user gets 100%', () => {
    const result = splitProcessingFee(10.00, 100);
    expect(result.userShare).toBe(10.00);
    expect(result.processorShare).toBe(0);
  });
});

describe('calculateCustomerCredit', () => {
  it('calculates customer credit correctly for cash-in', () => {
    const credit = calculateCustomerCredit(100.00, 3.00, 1.00);
    expect(credit).toBe(96.00);
  });

  it('handles decimal rounding correctly', () => {
    const credit = calculateCustomerCredit(100.00, 2.33, 0.67);
    expect(credit).toBe(97.00);
  });

  it('handles zero fees correctly', () => {
    const credit = calculateCustomerCredit(100.00, 0, 0);
    expect(credit).toBe(100.00);
  });
});

describe('createPaymentProcessor', () => {
  it('validates split percentages add up to 100', async () => {
    const mockTx: any = {
      insert: () => ({ values: () => ({ returning: () => [] }) })
    };

    const payload = {
      name: 'Test Processor',
      processorType: 'crypto',
      feeType: 'hybrid',
      feePercentage: 2.5,
      feeFixedAmount: 0.30,
      defaultUserSplit: 25,
      defaultProcessorSplit: 70 // Should be 75
    };

    await expect(
      createPaymentProcessor(mockTx, payload, 'cmd-123')
    ).rejects.toThrow('User split and processor split must add up to 100%');
  });

  it('validates percentage fee type has feePercentage', async () => {
    const mockTx: any = {
      insert: () => ({ values: () => ({ returning: () => [] }) })
    };

    const payload = {
      name: 'Test Processor',
      processorType: 'card',
      feeType: 'percentage',
      feeFixedAmount: 0.30,
      defaultUserSplit: 25,
      defaultProcessorSplit: 75
    };

    await expect(
      createPaymentProcessor(mockTx, payload, 'cmd-123')
    ).rejects.toThrow('Percentage fee required for percentage fee type');
  });

  it('validates fixed fee type has feeFixedAmount', async () => {
    const mockTx: any = {
      insert: () => ({ values: () => ({ returning: () => [] }) })
    };

    const payload = {
      name: 'Test Processor',
      processorType: 'card',
      feeType: 'fixed',
      feePercentage: 2.5,
      defaultUserSplit: 25,
      defaultProcessorSplit: 75
    };

    await expect(
      createPaymentProcessor(mockTx, payload, 'cmd-123')
    ).rejects.toThrow('Fixed amount required for fixed fee type');
  });

  it('validates hybrid fee type has both fee fields', async () => {
    const mockTx: any = {
      insert: () => ({ values: () => ({ returning: () => [] }) })
    };

    const payload = {
      name: 'Test Processor',
      processorType: 'crypto',
      feeType: 'hybrid',
      feePercentage: 2.5,
      defaultUserSplit: 25,
      defaultProcessorSplit: 75
    };

    await expect(
      createPaymentProcessor(mockTx, payload, 'cmd-123')
    ).rejects.toThrow('Both percentage and fixed amount required for hybrid fee type');
  });

  it('creates processor successfully with valid data', async () => {
    const mockProcessor = {
      id: 'proc-123',
      name: 'Test Processor',
      processorType: 'crypto',
      feeType: 'hybrid',
      feePercentage: '2.5',
      feeFixedAmount: '0.30',
      defaultUserSplit: '25',
      defaultProcessorSplit: '75',
      notes: null,
      active: true
    };

    const mockTx: any = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([mockProcessor]))
        }))
      }))
    };

    const payload = {
      name: 'Test Processor',
      processorType: 'crypto',
      feeType: 'hybrid',
      feePercentage: 2.5,
      feeFixedAmount: 0.30,
      defaultUserSplit: 25,
      defaultProcessorSplit: 75
    };

    const result = await createPaymentProcessor(mockTx, payload, 'cmd-123');

    expect(result.ok).toBe(true);
    expect(result.commandId).toBe('cmd-123');
    expect(result.affectedIds).toEqual(['proc-123']);
    expect(result.toast).toContain('Test Processor');
    expect(result.toast).toContain('created');
  });

  it('throws error for negative fee percentage', async () => {
    const mockTx: any = {
      insert: () => ({ values: () => ({ returning: () => [] }) })
    };

    await expect(
      createPaymentProcessor(mockTx, {
        name: 'Test',
        processorType: 'crypto',
        feeType: 'percentage',
        feePercentage: -5,
        defaultUserSplit: 50,
        defaultProcessorSplit: 50
      }, 'cmd')
    ).rejects.toThrow('Fee percentage cannot be negative');
  });

  it('throws error for negative fee fixed amount', async () => {
    const mockTx: any = {
      insert: () => ({ values: () => ({ returning: () => [] }) })
    };

    await expect(
      createPaymentProcessor(mockTx, {
        name: 'Test',
        processorType: 'crypto',
        feeType: 'fixed',
        feeFixedAmount: -2,
        defaultUserSplit: 50,
        defaultProcessorSplit: 50
      }, 'cmd')
    ).rejects.toThrow('Fee fixed amount cannot be negative');
  });

  it('throws error for negative split percentages', async () => {
    const mockTx: any = {
      insert: () => ({ values: () => ({ returning: () => [] }) })
    };

    await expect(
      createPaymentProcessor(mockTx, {
        name: 'Test',
        processorType: 'crypto',
        feeType: 'percentage',
        feePercentage: 5,
        defaultUserSplit: -10,
        defaultProcessorSplit: 110
      }, 'cmd')
    ).rejects.toThrow('Split percentages cannot be negative');
  });

  it('allows zero fee percentage', async () => {
    const mockProcessor = {
      id: 'proc-1',
      name: 'Test',
      processorType: 'crypto',
      feeType: 'percentage',
      feePercentage: '0',
      feeFixedAmount: null,
      defaultUserSplit: '50',
      defaultProcessorSplit: '50',
      notes: null,
      active: true
    };

    const mockTx: any = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([mockProcessor]))
        }))
      }))
    };

    const result = await createPaymentProcessor(mockTx, {
      name: 'Test',
      processorType: 'crypto',
      feeType: 'percentage',
      feePercentage: 0,
      defaultUserSplit: 50,
      defaultProcessorSplit: 50
    }, 'cmd');

    expect(result.ok).toBe(true);
  });
});

describe('markUserFeeCollected', () => {
  it('updates fee status to collected', async () => {
    let updateCalled = false;
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => {
            updateCalled = true;
            return Promise.resolve();
          })
        }))
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: 'fee-123' }]))
        }))
      }))
    };

    const result = await markUserFeeCollected(
      mockTx,
      { processorFeeId: 'fee-123' },
      'cmd-456'
    );

    expect(updateCalled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.commandId).toBe('cmd-456');
    expect(result.affectedIds).toEqual(['fee-123']);
    expect(result.toast).toContain('collected');
  });

  it('uses provided collectedAt date', async () => {
    let capturedSetValue: any;
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn((value) => {
          capturedSetValue = value;
          return {
            where: vi.fn(() => Promise.resolve())
          };
        })
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: 'fee-123' }]))
        }))
      }))
    };

    const customDate = '2025-01-15T10:30:00Z';
    await markUserFeeCollected(
      mockTx,
      { processorFeeId: 'fee-123', collectedAt: customDate },
      'cmd-456'
    );

    expect(capturedSetValue.userFeeStatus).toBe('collected');
    expect(capturedSetValue.userFeeCollectedAt).toBeInstanceOf(Date);
    expect(capturedSetValue.userFeeCollectedAt.toISOString()).toBe('2025-01-15T10:30:00.000Z');
  });

  it('throws error for non-existent fee ID', async () => {
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve())
        }))
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([]))
        }))
      }))
    };

    await expect(
      markUserFeeCollected(mockTx, { processorFeeId: 'nonexistent' }, 'cmd')
    ).rejects.toThrow('Processor fee not found');
  });

  it('throws error for invalid date format', async () => {
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve())
        }))
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: 'fee-123' }]))
        }))
      }))
    };

    await expect(
      markUserFeeCollected(mockTx, { processorFeeId: 'fee-123', collectedAt: 'invalid-date' }, 'cmd')
    ).rejects.toThrow('Invalid collectedAt date format');
  });
});

describe('updateProcessorFeeStatus', () => {
  it('updates processor fee status to paid', async () => {
    let capturedSetValue: any;
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn((value) => {
          capturedSetValue = value;
          return {
            where: vi.fn(() => Promise.resolve())
          };
        })
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: 'fee-789' }]))
        }))
      }))
    };

    const result = await updateProcessorFeeStatus(
      mockTx,
      { processorFeeId: 'fee-789', status: 'paid' },
      'cmd-999'
    );

    expect(capturedSetValue.processorFeeStatus).toBe('paid');
    expect(capturedSetValue.processorFeePaidAt).toBeInstanceOf(Date);
    expect(result.ok).toBe(true);
    expect(result.commandId).toBe('cmd-999');
    expect(result.affectedIds).toEqual(['fee-789']);
    expect(result.toast).toContain('paid');
  });

  it('updates processor fee status to unpaid', async () => {
    let capturedSetValue: any;
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn((value) => {
          capturedSetValue = value;
          return {
            where: vi.fn(() => Promise.resolve())
          };
        })
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: 'fee-789' }]))
        }))
      }))
    };

    const result = await updateProcessorFeeStatus(
      mockTx,
      { processorFeeId: 'fee-789', status: 'unpaid' },
      'cmd-999'
    );

    expect(capturedSetValue.processorFeeStatus).toBe('unpaid');
    expect(capturedSetValue.processorFeePaidAt).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.toast).toContain('unpaid');
  });

  it('throws error for invalid status value', async () => {
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve())
        }))
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: 'fee-123' }]))
        }))
      }))
    };

    await expect(
      updateProcessorFeeStatus(mockTx, { processorFeeId: 'fee-123', status: 'invalid' }, 'cmd')
    ).rejects.toThrow('Status must be either "paid" or "unpaid"');
  });

  it('throws error for non-existent fee ID', async () => {
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve())
        }))
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([]))
        }))
      }))
    };

    await expect(
      updateProcessorFeeStatus(mockTx, { processorFeeId: 'nonexistent', status: 'paid' }, 'cmd')
    ).rejects.toThrow('Processor fee not found');
  });
});
