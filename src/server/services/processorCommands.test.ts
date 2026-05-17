import { describe, it, expect } from 'vitest';
import { calculateProcessingFee, splitProcessingFee, calculateCustomerCredit } from './processorCommands';
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
