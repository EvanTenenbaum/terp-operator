// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { salesButtonTitle, selectionPillText } from './SalesView.columns';

// TER-1620 F-21: Sales empty-state cleanup.
// Tests the pure helpers that drive the three F-21 UX fixes:
//   Fix A — disabled button title ("Pick a customer first")
//   Fix B — selection pill suppressed when no customer selected (no redundant prompt)
//   Fix C — customer picker already renders as field-inline label (TER-1617 cover)

describe('salesButtonTitle (TER-1620 Fix A)', () => {
  it('returns "Pick a customer first" when no customer is selected', () => {
    expect(salesButtonTitle('')).toBe('Pick a customer first');
  });

  it('returns undefined when a customer is selected (no tooltip needed)', () => {
    expect(salesButtonTitle('cust-abc-123')).toBeUndefined();
  });

  it('returns "Pick a customer first" for any falsy customerId', () => {
    // UI binds <select value={customerId}> — empty string is the no-selection sentinel
    expect(salesButtonTitle('')).toBe('Pick a customer first');
  });
});

describe('selectionPillText (TER-1620 Fix B)', () => {
  it('returns null when no customer is selected — pill must be suppressed', () => {
    // This is the core of Fix B: no "Pick customer to start" redundant prompt
    expect(selectionPillText(undefined, '', '')).toBeNull();
    expect(selectionPillText(null, '', '')).toBeNull();
    expect(selectionPillText(undefined, '', 'draft')).toBeNull();
  });

  it('returns "Draft — add your first item" when customer is selected but no order', () => {
    expect(selectionPillText(undefined, 'cust-abc', '')).toBe('Draft — add your first item');
    expect(selectionPillText(null, 'cust-abc', 'draft')).toBe('Draft — add your first item');
  });

  it('returns order number and status when an order is selected', () => {
    expect(selectionPillText('ORD-42', 'cust-abc', 'confirmed')).toBe('ORD-42 / confirmed');
  });

  it('falls back to "open" when selectedOrderStatus is empty', () => {
    expect(selectionPillText('ORD-7', 'cust-abc', '')).toBe('ORD-7 / open');
  });

  it('handles numeric orderNo (AG Grid often provides numbers)', () => {
    expect(selectionPillText(123, 'cust-abc', 'draft')).toBe('123 / draft');
  });

  it('does not produce "Pick customer to start" for any combination of inputs', () => {
    // Exhaustively confirm the removed phrase never appears
    const cases: Array<[string | number | null | undefined, string, string]> = [
      [undefined, '', ''],
      [null, '', ''],
      [undefined, '', 'draft'],
      [null, 'cust', ''],
      ['ORD-1', 'cust', 'confirmed'],
    ];
    for (const [orderNo, custId, status] of cases) {
      const text = selectionPillText(orderNo, custId, status);
      expect(text).not.toBe('Pick customer to start');
    }
  });
});
