import { describe, expect, it } from 'vitest';

import { addMoney, subMoney, subMoneyMin0 } from './commandBus';

describe('commandBus money helpers', () => {
  it('subtracts money without IEEE 754 drift', () => {
    expect(subMoney('100.1', '0.2')).toBe('99.90');
  });

  it('adds money without IEEE 754 drift', () => {
    expect(addMoney('0.1', '0.2')).toBe('0.30');
  });

  it('clamps negative subtraction results at zero', () => {
    expect(subMoneyMin0('0.1', '0.2')).toBe('0.00');
  });
});
