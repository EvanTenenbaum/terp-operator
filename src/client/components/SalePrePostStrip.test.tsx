// @vitest-environment jsdom
/**
 * UX-F02 / UX-F04 — pre-post checklist strip + duplicate-source helpers.
 * The check builders are pinned against the EXACT server preconditions in
 * src/server/services/commandBus.ts (confirmSalesOrder ~3523, postSalesOrder
 * ~3619, salesLineValidationIssues ~7602): credit is advisory-only (TER-1659),
 * duplicate source rows / unpriced lines / unresolved inventory are refusals.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AlreadyInOrderChip,
  SalePrePostStrip,
  buildSalePrePostChecks,
  duplicateSourceLineIds,
  prePostIssuesByLineId,
  saleLineSourceKey,
  type SalePrePostLine
} from './SalePrePostStrip';

function line(overrides: Partial<Record<string, unknown>> = {}): SalePrePostLine {
  return {
    id: 'l1',
    itemName: 'Item A',
    qty: 2,
    unitPrice: 10,
    batchId: 'batch-1',
    batchCode: 'B-001',
    sourceRowKey: 'B-001',
    unitCostResolved: true,
    availableQty: 10,
    ...overrides
  };
}

describe('saleLineSourceKey (mirror of commandBus sourceRowKey || batchId)', () => {
  it('prefers sourceRowKey', () => {
    expect(saleLineSourceKey(line({ sourceRowKey: 'SRC', batchId: 'b1' }))).toBe('SRC');
  });
  it('falls back to batchId when sourceRowKey empty', () => {
    expect(saleLineSourceKey(line({ sourceRowKey: '', batchId: 'b1' }))).toBe('b1');
    expect(saleLineSourceKey(line({ sourceRowKey: null, batchId: 'b1' }))).toBe('b1');
  });
  it('returns null when neither present (server skips such lines)', () => {
    expect(saleLineSourceKey(line({ sourceRowKey: null, batchId: null }))).toBeNull();
  });
});

describe('duplicateSourceLineIds (UX-F04)', () => {
  it('flags every line sharing a source key', () => {
    const lines = [
      line({ id: 'a', sourceRowKey: 'K1' }),
      line({ id: 'b', sourceRowKey: 'K1' }),
      line({ id: 'c', sourceRowKey: 'K2' })
    ];
    const dup = duplicateSourceLineIds(lines);
    expect(dup).toEqual(new Set(['a', 'b']));
  });

  it('matches sourceRowKey against another line batchId fallback (same key space as the server)', () => {
    const lines = [
      line({ id: 'a', sourceRowKey: 'batch-9', batchId: 'x' }),
      line({ id: 'b', sourceRowKey: null, batchId: 'batch-9' })
    ];
    expect(duplicateSourceLineIds(lines)).toEqual(new Set(['a', 'b']));
  });

  it('ignores lines with no key and returns empty set when no duplicates', () => {
    const lines = [
      line({ id: 'a', sourceRowKey: null, batchId: null }),
      line({ id: 'b', sourceRowKey: null, batchId: null }),
      line({ id: 'c', sourceRowKey: 'K1' })
    ];
    expect(duplicateSourceLineIds(lines).size).toBe(0);
  });
});

describe('buildSalePrePostChecks (UX-F02)', () => {
  const base = { orderTotal: 100, customerBalance: 50, creditLimit: 1000 };

  it('all checks pass on a clean order', () => {
    const checks = buildSalePrePostChecks({ ...base, lines: [line(), line({ id: 'l2', sourceRowKey: 'B-002', batchId: 'batch-2' })] });
    expect(checks).toHaveLength(4);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.key)).toEqual(['credit', 'duplicates', 'priced', 'inventory']);
  });

  it('credit: fails only when balance + total exceeds limit (strict >, same arithmetic as the server) and stays ADVISORY', () => {
    const atLimit = buildSalePrePostChecks({ orderTotal: 100, customerBalance: 900, creditLimit: 1000, lines: [line()] });
    expect(atLimit.find((c) => c.key === 'credit')?.ok).toBe(true);

    const over = buildSalePrePostChecks({ orderTotal: 100.01, customerBalance: 900, creditLimit: 1000, lines: [line()] });
    const credit = over.find((c) => c.key === 'credit')!;
    expect(credit.ok).toBe(false);
    expect(credit.advisory).toBe(true);
    // Money-path copy contract: must say the server will NOT refuse.
    expect(credit.detail).toMatch(/will NOT refuse/);
    expect(credit.detail).toMatch(/advisory/i);
    expect(credit.failingLineIds).toEqual([]);
  });

  it('duplicates: blocker listing every offending line id', () => {
    const checks = buildSalePrePostChecks({ ...base, lines: [line({ id: 'a' }), line({ id: 'b' })] }); // both K='B-001'
    const dup = checks.find((c) => c.key === 'duplicates')!;
    expect(dup.ok).toBe(false);
    expect(dup.advisory).toBe(false);
    expect(dup.failingLineIds.sort()).toEqual(['a', 'b']);
    expect(dup.detail).toMatch(/refuse Post/);
  });

  it('priced: fails on negative unitPrice or unitCostResolved=false (both confirm+post refusals)', () => {
    const checks = buildSalePrePostChecks({
      ...base,
      lines: [
        line({ id: 'neg', unitPrice: -1, sourceRowKey: 'K1' }),
        line({ id: 'cogs', unitCostResolved: false, sourceRowKey: 'K2' }),
        line({ id: 'zero', unitPrice: 0, sourceRowKey: 'K3' }) // zero price is allowed by the server
      ]
    });
    const priced = checks.find((c) => c.key === 'priced')!;
    expect(priced.ok).toBe(false);
    expect(priced.failingLineIds.sort()).toEqual(['cogs', 'neg']);
  });

  it('inventory: fails on missing batchId / item name / qty<=0 / qty above availableQty', () => {
    const checks = buildSalePrePostChecks({
      ...base,
      lines: [
        line({ id: 'nobatch', batchId: null, sourceRowKey: 'K1' }),
        line({ id: 'noname', itemName: '', sourceRowKey: 'K2' }),
        line({ id: 'noqty', qty: 0, sourceRowKey: 'K3' }),
        line({ id: 'short', qty: 11, availableQty: 10, sourceRowKey: 'K4' }),
        line({ id: 'ok', sourceRowKey: 'K5' })
      ]
    });
    const inv = checks.find((c) => c.key === 'inventory')!;
    expect(inv.ok).toBe(false);
    expect(inv.failingLineIds.sort()).toEqual(['nobatch', 'noname', 'noqty', 'short']);
  });

  it('inventory: does not invent an availability failure when availableQty is absent from the wire', () => {
    const checks = buildSalePrePostChecks({ ...base, lines: [line({ id: 'a', availableQty: null })] });
    expect(checks.find((c) => c.key === 'inventory')?.ok).toBe(true);
  });
});

describe('prePostIssuesByLineId', () => {
  it('maps failing line ids to their check detail text', () => {
    const checks = buildSalePrePostChecks({
      orderTotal: 0,
      customerBalance: 0,
      creditLimit: 100,
      lines: [line({ id: 'a' }), line({ id: 'b' })]
    });
    const map = prePostIssuesByLineId(checks);
    expect(map.get('a')?.[0]).toMatch(/refuse Post/);
    expect(map.get('b')?.length).toBe(1);
  });
});

describe('<SalePrePostStrip>', () => {
  function checksWith(failKey: string) {
    return buildSalePrePostChecks({
      orderTotal: failKey === 'credit' ? 1000 : 10,
      customerBalance: 0,
      creditLimit: 100,
      lines:
        failKey === 'duplicates'
          ? [line({ id: 'a' }), line({ id: 'b' })]
          : [line({ id: 'a' }), line({ id: 'b', sourceRowKey: 'OTHER', batchId: 'batch-2' })]
    });
  }

  it('renders ✓ pills for passing checks and stage label "Before Post" for confirmed orders', () => {
    render(<SalePrePostStrip orderStatus="confirmed" checks={checksWith('none')} onFocusLines={vi.fn()} onOpenCredit={vi.fn()} />);
    expect(screen.getByText('Before Post:')).toBeTruthy();
    expect(screen.getByTestId('pre-post-credit-ok')).toBeTruthy();
    expect(screen.getByTestId('pre-post-duplicates-ok')).toBeTruthy();
    expect(screen.getByTestId('pre-post-priced-ok')).toBeTruthy();
    expect(screen.getByTestId('pre-post-inventory-ok')).toBeTruthy();
  });

  it('renders "Before Confirm" for draft orders', () => {
    render(<SalePrePostStrip orderStatus="draft" checks={checksWith('none')} onFocusLines={vi.fn()} onOpenCredit={vi.fn()} />);
    expect(screen.getByText('Before Confirm:')).toBeTruthy();
  });

  it('✗ duplicate check deep-links via onFocusLines with the failing line ids', () => {
    const onFocusLines = vi.fn();
    render(<SalePrePostStrip orderStatus="draft" checks={checksWith('duplicates')} onFocusLines={onFocusLines} onOpenCredit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('pre-post-duplicates-fix'));
    expect(onFocusLines).toHaveBeenCalledTimes(1);
    expect(onFocusLines.mock.calls[0][0].failingLineIds.sort()).toEqual(['a', 'b']);
  });

  it('✗ credit check deep-links via onOpenCredit and is labeled advisory', () => {
    const onOpenCredit = vi.fn();
    render(<SalePrePostStrip orderStatus="confirmed" checks={checksWith('credit')} onFocusLines={vi.fn()} onOpenCredit={onOpenCredit} />);
    const creditButton = screen.getByTestId('pre-post-credit-fix');
    expect(creditButton.textContent).toMatch(/advisory/);
    fireEvent.click(creditButton);
    expect(onOpenCredit).toHaveBeenCalledTimes(1);
  });
});

describe('<AlreadyInOrderChip> (UX-F04)', () => {
  it('renders the chip for duplicate-source lines', () => {
    render(<AlreadyInOrderChip isDuplicate={true} />);
    const chip = screen.getByText('Already in order');
    expect(chip.getAttribute('title')).toMatch(/refuse Post/);
  });

  it('renders nothing for unique lines', () => {
    const { container } = render(<AlreadyInOrderChip isDuplicate={false} />);
    expect(container.innerHTML).toBe('');
  });
});
